import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { hashToken } from '../auth';

// Tài khoản và phiên (ADR 0003 §1). Không nhận `ctx` vì không đọc dữ liệu bên trong dự án.
// Hàm ghi không tự mở transaction; người gọi bọc trong tx(db, ...).

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
