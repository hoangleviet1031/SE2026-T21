import type { AuthResponse } from '@field-survey/shared';

// Phiên của trang quản trị: chỉ token và thông tin admin trong sessionStorage, đóng tab là phải đăng
// nhập lại (design §4.9). Không IndexedDB, không localStorage.

export type AdminSession = AuthResponse;

const KEY = 'field-survey-admin-session';

/** Đọc lại phiên đã lưu; giá trị hỏng hoặc không phải admin coi như chưa đăng nhập. */
export function parseSession(raw: string | null): AdminSession | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // Không phải JSON (bị sửa tay): đăng nhập lại là đủ, không có dữ liệu nào để mất
    return null;
  }
  if (typeof value !== 'object' || value === null || !('token' in value) || !('user' in value)) return null;
  const { token, user } = value;
  if (typeof token !== 'string' || token === '' || typeof user !== 'object' || user === null) return null;
  if (!('id' in user) || !('username' in user) || !('name' in user) || !('isAdmin' in user)) return null;
  const { id, username, name, isAdmin } = user;
  if (typeof id !== 'string' || typeof username !== 'string' || typeof name !== 'string') return null;
  if (isAdmin !== true) return null;
  return { token, user: { id, username, name, isAdmin } };
}

export function readSession(): AdminSession | null {
  return parseSession(sessionStorage.getItem(KEY));
}

export function saveSession(session: AdminSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}
