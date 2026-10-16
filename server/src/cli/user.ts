import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { DISPLAY_NAME_MAX_LENGTH, USERNAME_PATTERN } from '@field-survey/shared';
import { tx, type Db } from '../db';
import { hashPassword } from '../password';
import { findUserByUsername, insertUser, type LoginUserRow } from '../repo/users';
import { openDbFromEnv } from './openDbFromEnv';

// Quản lý tài khoản trên server (design §12, ADR 0003 §1). Người dùng thường tự tạo tài khoản trên
// app; lệnh này để tạo admin và hỗ trợ (quên mật khẩu, mất máy, khoá tài khoản). Mật khẩu tạm chỉ
// in ra một lần, server chỉ lưu scrypt.
//   npm run user:add -w server -- --username dang --name "Đăng" [--admin]
//   npm run user:reset-password -w server -- --user <username>
//   npm run user:revoke-sessions -w server -- --user <username>
//   npm run user:disable -w server -- --user <username>

/** Lỗi do người chạy lệnh nhập sai; in ra cho họ đọc, không phải lỗi lập trình. */
export class CliError extends Error {}

// Bỏ 0 O 1 l I: người dùng phải gõ tay mật khẩu tạm, dễ nhầm các ký tự này với nhau.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const TEMP_PASSWORD_LENGTH = 12;

export function newTempPassword(): string {
  let s = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) s += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  return s;
}

function requireUser(db: Db, username: string): LoginUserRow {
  const user = findUserByUsername(db, username.toLowerCase());
  if (!user) throw new CliError(`Không có tài khoản ${username}.`);
  return user;
}

export async function addUser(
  db: Db,
  opts: { username: string; name: string; admin?: boolean },
): Promise<{ userId: string; username: string; password: string }> {
  const username = opts.username.toLowerCase();
  const name = opts.name.trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw new CliError('Tên đăng nhập chỉ gồm chữ thường, số, "." và "_", dài 3–32 ký tự.');
  }
  if (name.length < 1 || name.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new CliError(`Tên hiển thị không được để trống, tối đa ${DISPLAY_NAME_MAX_LENGTH} ký tự.`);
  }
  if (findUserByUsername(db, username)) throw new CliError(`Tên đăng nhập ${username} đã có.`);

  const password = newTempPassword();
  // Băm trước khi mở transaction: scrypt chạy bất đồng bộ, không được nằm giữa BEGIN và COMMIT.
  const passwordHash = await hashPassword(password);
  const userId = tx(db, () => {
    // Kiểm lại trong transaction: tên có thể vừa được ai đó đăng ký trên app trong lúc chờ scrypt.
    if (findUserByUsername(db, username)) throw new CliError(`Tên đăng nhập ${username} đã có.`);
    const id = insertUser(db, { username, name, passwordHash, now: new Date().toISOString() });
    if (opts.admin) db.prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).run(id);
    return id;
  });
  return { userId, username, password };
}

/** Quên mật khẩu: cấp mật khẩu tạm mới. Không thu hồi phiên (máy đang giữ phiếu chưa gửi vẫn gửi được). */
export async function resetPassword(db: Db, username: string): Promise<string> {
  const user = requireUser(db, username);
  const password = newTempPassword();
  const passwordHash = await hashPassword(password);
  tx(db, () => db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, user.id));
  return password;
}

/** Mất máy: mọi phiên của người này hết hiệu lực. Trả số phiên đã thu hồi. */
export function revokeSessions(db: Db, username: string): number {
  const user = requireUser(db, username);
  return tx(db, () => Number(db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id).changes));
}

/** Khoá tài khoản và thu hồi mọi phiên (ADR 0003 §1). Phiếu đã gửi vẫn giữ nguyên. Trả số phiên đã thu hồi. */
export function disableUser(db: Db, username: string): number {
  const user = requireUser(db, username);
  return tx(db, () => {
    db.prepare(`UPDATE users SET disabled = 1 WHERE id = ?`).run(user.id);
    return Number(db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id).changes);
  });
}

interface Output {
  out: (line: string) => void;
  err: (line: string) => void;
}

function requireOption(value: string | undefined, flag: string): string {
  if (!value) throw new CliError(`Thiếu ${flag}.`);
  return value;
}

const TEMP_PASSWORD_NOTE = 'Mật khẩu tạm chỉ hiện một lần này. Gửi cho người dùng qua kênh riêng; server chỉ lưu bản băm.';

/** Chạy một lệnh, trả mã thoát. Tách khỏi process để test được. */
export async function runUserCli(argv: string[], db: Db, io: Output): Promise<number> {
  try {
    const { positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        username: { type: 'string' },
        name: { type: 'string' },
        admin: { type: 'boolean', default: false },
        user: { type: 'string' },
      },
    });
    const command = positionals[0];
    if (command === 'add') {
      const created = await addUser(db, {
        username: requireOption(values.username, '--username'),
        name: requireOption(values.name, '--name'),
        admin: values.admin,
      });
      io.out(`Tên đăng nhập: ${created.username}`);
      io.out(`Mật khẩu tạm:  ${created.password}`);
      io.out(TEMP_PASSWORD_NOTE);
      return 0;
    }
    if (command === 'reset-password') {
      const username = requireOption(values.user, '--user');
      const password = await resetPassword(db, username);
      io.out(`Tên đăng nhập: ${username.toLowerCase()}`);
      io.out(`Mật khẩu tạm:  ${password}`);
      io.out(`${TEMP_PASSWORD_NOTE} Các máy đang đăng nhập vẫn giữ phiên; muốn thu hồi thì chạy user:revoke-sessions.`);
      return 0;
    }
    if (command === 'revoke-sessions') {
      const username = requireOption(values.user, '--user');
      const n = revokeSessions(db, username);
      io.out(`Đã thu hồi ${n} phiên của ${username.toLowerCase()}. Người dùng phải đăng nhập lại.`);
      return 0;
    }
    if (command === 'disable') {
      const username = requireOption(values.user, '--user');
      const n = disableUser(db, username);
      io.out(`Đã khoá ${username.toLowerCase()} và thu hồi ${n} phiên.`);
      return 0;
    }
    throw new CliError(
      `Lệnh không hợp lệ: ${command ?? '(trống)'}. Dùng add, reset-password, revoke-sessions hoặc disable.`,
    );
  } catch (e) {
    // parseArgs ném TypeError khi gặp cờ lạ; cả hai đều là lỗi nhập lệnh, các lỗi khác ném tiếp.
    if (e instanceof CliError || (e instanceof TypeError && 'code' in e)) {
      io.err(e.message);
      return 1;
    }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDbFromEnv();
  try {
    process.exitCode = await runUserCli(process.argv.slice(2), db, { out: console.log, err: console.error });
  } finally {
    db.close();
  }
}
