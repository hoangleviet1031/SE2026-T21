import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { tx, type Db } from '../db';
import { hashToken } from '../auth';
import { openDbFromEnv } from './openDbFromEnv';
import { insertSession, newSessionToken, newUserId, userIdExists } from '../repo/users';

// Quản lý người dùng trên server (design §12, ADR 0002 §2). Không có tự đăng ký:
// quản trị chạy lệnh này rồi gửi token cho người dùng qua kênh riêng.
// Cầu nối tới TV3-12: từ migration 4 token được ghi thành một phiên trong bảng sessions
// (requireAuth chỉ tra bảng này), username đặt bằng userId như tài khoản cũ. TV3-12 thay các lệnh
// này bằng bản theo tên đăng nhập + mật khẩu (ADR 0003, design §12).
//   npm run user:add -w server -- --name "Lan" [--admin]
//   npm run user:rotate-token -w server -- --user <userId>
//   npm run user:disable -w server -- --user <userId>

/** Lỗi do người chạy lệnh nhập sai; in ra cho họ đọc, không phải lỗi lập trình. */
export class CliError extends Error {}


export function addUser(db: Db, opts: { name: string; admin?: boolean }): { userId: string; token: string } {
  const name = opts.name.trim();
  if (!name) throw new CliError('Tên người dùng không được để trống.');
  const token = newSessionToken();
  const userId = tx(db, () => {
    let id = newUserId();
    // 36^8 khả năng nên gần như không trùng, nhưng trùng thì khoá chính sẽ làm lệnh hỏng.
    while (userIdExists(db, id)) id = newUserId();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, username, name, token_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, id, name, hashToken(token), opts.admin ? 1 : 0, now);
    insertSession(db, id, token, now);
    return id;
  });
  return { userId, token };
}

export function rotateToken(db: Db, userId: string): string {
  const token = newSessionToken();
  tx(db, () => {
    const result = db.prepare(`UPDATE users SET token_hash = ? WHERE id = ?`).run(hashToken(token), userId);
    if (result.changes === 0) throw new CliError(`Không có người dùng ${userId}.`);
    // Token cũ hết hiệu lực trên mọi máy, như trước migration 4.
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
    insertSession(db, userId, token, new Date().toISOString());
  });
  return token;
}

/** Khoá tài khoản: mọi request bằng token của người này nhận 401. Phiếu đã gửi vẫn giữ nguyên. */
export function disableUser(db: Db, userId: string): void {
  tx(db, () => {
    const result = db.prepare(`UPDATE users SET disabled = 1 WHERE id = ?`).run(userId);
    if (result.changes === 0) throw new CliError(`Không có người dùng ${userId}.`);
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

/** Chạy một lệnh, trả mã thoát. Tách khỏi process để test được. */
export function runUserCli(argv: string[], db: Db, io: Output): number {
  try {
    const { positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        name: { type: 'string' },
        admin: { type: 'boolean', default: false },
        user: { type: 'string' },
      },
    });
    const command = positionals[0];
    if (command === 'add') {
      const { userId, token } = addUser(db, { name: requireOption(values.name, '--name'), admin: values.admin });
      io.out(`userId: ${userId}`);
      io.out(`token:  ${token}`);
      io.out('Token chỉ hiện một lần này. Gửi cho người dùng qua kênh riêng; server chỉ lưu bản băm.');
      return 0;
    }
    if (command === 'rotate-token') {
      const userId = requireOption(values.user, '--user');
      const token = rotateToken(db, userId);
      io.out(`userId: ${userId}`);
      io.out(`token:  ${token}`);
      io.out('Token cũ đã hết hiệu lực. Token mới chỉ hiện một lần này.');
      return 0;
    }
    if (command === 'disable') {
      const userId = requireOption(values.user, '--user');
      disableUser(db, userId);
      io.out(`Đã khoá ${userId}. Token của người này không dùng được nữa.`);
      return 0;
    }
    throw new CliError(`Lệnh không hợp lệ: ${command ?? '(trống)'}. Dùng add, rotate-token hoặc disable.`);
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
  process.exitCode = runUserCli(process.argv.slice(2), db, { out: console.log, err: console.error });
  db.close();
}
