import type { ChangePasswordRequest, LoginRequest, RegisterRequest } from './types';

// Luật tài khoản của ADR 0003 §1. Đặt ở shared để màn hình tạo tài khoản (TV1-14) báo lỗi đúng
// như server kiểm.

/** Chữ thường, số, `.`, `_`, 3–32 ký tự. So sau khi đã chuyển về chữ thường. */
export const USERNAME_PATTERN = /^[a-z0-9._]{3,32}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 100;

/** Thân `POST /api/auth/register` đã chuẩn hoá, hoặc undefined nếu sai kiểu hay sai luật. */
export function parseRegisterRequest(body: unknown): RegisterRequest | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.username !== 'string' || typeof b.name !== 'string' || typeof b.password !== 'string') return undefined;

  const username = b.username.toLowerCase();
  const name = b.name.trim();
  // Mật khẩu không cắt khoảng trắng: người dùng gõ gì thì băm đúng như vậy.
  const password = b.password;
  if (!USERNAME_PATTERN.test(username)) return undefined;
  if (name.length < 1 || name.length > DISPLAY_NAME_MAX_LENGTH) return undefined;
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return undefined;
  return { username, name, password };
}

/**
 * Thân `POST /api/auth/login`. Chỉ kiểm kiểu: tên sai định dạng thì cũng chỉ là "không có tên đó",
 * trả `401 invalid_credentials` như mọi lần sai khác.
 */
export function parseLoginRequest(body: unknown): LoginRequest | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.username !== 'string' || typeof b.password !== 'string') return undefined;
  return { username: b.username.toLowerCase(), password: b.password };
}

/**
 * Thân `POST /api/auth/change-password`. Mật khẩu mới theo luật đăng ký; mật khẩu hiện tại chỉ kiểm kiểu,
 * sai độ dài thì cũng chỉ là "không đúng" (`403 wrong_password`), không lộ luật.
 */
export function parseChangePasswordRequest(body: unknown): ChangePasswordRequest | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.currentPassword !== 'string' || typeof b.newPassword !== 'string') return undefined;
  const newPassword = b.newPassword;
  if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) return undefined;
  return { currentPassword: b.currentPassword, newPassword };
}
