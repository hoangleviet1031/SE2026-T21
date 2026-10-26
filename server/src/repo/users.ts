import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { AdminUser } from '@field-survey/shared';
import { tx, type Db } from '../db';
import { hashToken } from '../auth';
import { hashPassword } from '../password';

// Tài khoản và phiên (ADR 0003 §1). Không nhận `ctx` vì không đọc dữ liệu bên trong dự án.
// Hàm ghi cơ bản (insertUser, insertSession, deleteSession) không tự mở transaction; người gọi bọc
// trong tx(db, ...). Các thao tác hỗ trợ ở cuối file (khoá, cấp lại mật khẩu, thu hồi phiên) tự mở
// transaction và dùng chung cho CLI user:* và API /admin/users (A3), để hai đường cùng một hành vi.

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `u_` + 8 ký tự a-z0-9, cùng kiểu với u_lan trong dữ liệu demo. */
export function newUserId(): string {
  let s = 'u_';
  for (let i = 0; i < 8; i++) s += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return s;
}

/** Token phiên gửi cho client: 32 byte ngẫu nhiên. Server chỉ lưu SHA-256. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface LoginUserRow {
  id: string;
  username: string | null;
  name: string;
  is_admin: number;
  disabled: number;
  password_hash: string | null;
}

/** `username` phải đã chuyển về chữ thường (`parseLoginRequest` làm việc này). */
export function findUserByUsername(db: Db, username: string): LoginUserRow | undefined {
  return db
    .prepare(`SELECT id, username, name, is_admin, disabled, password_hash FROM users WHERE username = ?`)
    .get(username) as LoginUserRow | undefined;
}

export function userIdExists(db: Db, userId: string): boolean {
  return db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(userId) !== undefined;
}

/** Tạo tài khoản tự đăng ký. Trả id mới. */
export function insertUser(db: Db, u: { username: string; name: string; passwordHash: string; now: string }): string {
  let id = newUserId();
  // 36^8 khả năng nên gần như không trùng, nhưng trùng thì khoá chính sẽ làm request hỏng.
  while (userIdExists(db, id)) id = newUserId();
  // users.token_hash là NOT NULL UNIQUE từ migration 2 và không bỏ được nếu không tạo lại bảng.
  // Giá trị giữ chỗ không phải hex nên không bao giờ trùng SHA-256 của token nào; requireAuth
  // cũng không đọc cột này nữa (design §6.1).
  const placeholder = `unused:${randomUUID()}`;
  db.prepare(
    `INSERT INTO users (id, username, name, token_hash, password_hash, is_admin, disabled, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
  ).run(id, u.username, u.name, placeholder, u.passwordHash, u.now);
  return id;
}

export function insertSession(db: Db, userId: string, token: string, now: string): void {
  db.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)`).run(
    hashToken(token),
    userId,
    now,
    now,
  );
}

export function deleteSession(db: Db, tokenHash: string): void {
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

// Bỏ 0 O 1 l I: người dùng phải gõ tay mật khẩu tạm, dễ nhầm các ký tự này với nhau.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const TEMP_PASSWORD_LENGTH = 12;

export function newTempPassword(): string {
  let s = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) s += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  return s;
}

/**
 * Quên mật khẩu: cấp mật khẩu tạm mới, trả về để đưa cho người dùng đúng một lần; chỉ lưu scrypt.
 * Không thu hồi phiên (máy đang giữ phiếu chưa gửi vẫn gửi được). `undefined` nếu không có tài khoản.
 */
export async function resetUserPassword(db: Db, userId: string): Promise<string | undefined> {
  if (!userIdExists(db, userId)) return undefined;
  const password = newTempPassword();
  // Băm trước khi mở transaction: scrypt chạy bất đồng bộ, không được nằm giữa BEGIN và COMMIT.
  const passwordHash = await hashPassword(password);
  const changed = tx(db, () => db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId).changes);
  return changed > 0 ? password : undefined;
}

/** scrypt của mật khẩu hiện tại; `null` khi tài khoản cũ chưa có mật khẩu (trước migration 4). */
export function findPasswordHash(db: Db, userId: string): string | null {
  const row = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(userId) as
    { password_hash: string | null } | undefined;
  return row?.password_hash ?? null;
}

/**
 * Người dùng tự đổi mật khẩu (design §4.7): đổi hash và thu hồi mọi phiên khác trong một transaction,
 * giữ phiên của máy đang đổi. Máy khác gặp 401, phiếu chưa gửi trên máy đó vẫn còn (§4.7, 401 giữa chừng).
 * `passwordHash` băm trước khi gọi: scrypt bất đồng bộ không được nằm trong transaction.
 */
export function changeUserPassword(db: Db, userId: string, passwordHash: string, keepSessionHash: string): void {
  tx(db, () => {
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?`).run(userId, keepSessionHash);
  });
}

/** Mất máy: mọi phiên của người này hết hiệu lực. Trả số phiên đã thu hồi, `undefined` nếu không có tài khoản. */
export function revokeUserSessions(db: Db, userId: string): number | undefined {
  return tx(db, () => {
    if (!userIdExists(db, userId)) return undefined;
    return Number(db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId).changes);
  });
}

/**
 * Khoá tài khoản và thu hồi mọi phiên trong một transaction (ADR 0003 §1). Phiếu đã gửi giữ nguyên.
 * Khoá lại tài khoản đã khoá thì không đổi gì. Trả số phiên đã thu hồi, `undefined` nếu không có tài khoản.
 */
export function disableUserAccount(db: Db, userId: string): number | undefined {
  return tx(db, () => {
    if (!userIdExists(db, userId)) return undefined;
    db.prepare(`UPDATE users SET disabled = 1 WHERE id = ?`).run(userId);
    return Number(db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId).changes);
  });
}

const SEARCH_LIMIT = 50;

interface AdminUserRow {
  id: string;
  username: string;
  name: string;
  disabled: number;
  created_at: string;
  project_count: number;
}

/**
 * Tìm tài khoản cho màn hình A3: chuỗi con trong tên đăng nhập, không phân biệt hoa thường; `q` rỗng
 * thì lấy mọi tài khoản. Sắp theo tên đăng nhập, tối đa 50. `%`, `_` trong `q` là ký tự thường
 * (`_` hợp lệ trong tên đăng nhập). Tài khoản cũ chưa có username thì dùng id, như toAuthUser.
 */
export function searchUsers(db: Db, q: string): AdminUser[] {
  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = db
    .prepare(
      `SELECT u.id, COALESCE(u.username, u.id) AS username, u.name, u.disabled, u.created_at,
         (SELECT COUNT(*) FROM memberships m JOIN projects p ON p.id = m.project_id
          WHERE m.user_id = u.id AND p.archived = 0) AS project_count
       FROM users u
       WHERE COALESCE(u.username, u.id) LIKE ? ESCAPE '\\'
       ORDER BY username
       LIMIT ${SEARCH_LIMIT}`,
    )
    .all(pattern) as unknown as AdminUserRow[];
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    disabled: r.disabled === 1,
    createdAt: r.created_at,
    projectCount: r.project_count,
  }));
}
