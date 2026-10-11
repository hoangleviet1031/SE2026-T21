import { db, getMeta, setMeta } from './db/db';

// Tạm lưu mã trong bảng `meta` của CSDL hiện có. TV2-05 sẽ chuyển sang
// `field-survey-account` (design §5.1) nhưng giữ nguyên chữ ký ba hàm này,
// vì TV2-03 (gửi token) và e2e/helpers.ts dựa vào chúng.
const TOKEN_KEY = 'authToken';

export function getToken(): Promise<string | null> {
  return getMeta<string | null>(TOKEN_KEY, null);
}

export async function setToken(token: string): Promise<void> {
  await setMeta(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await db.meta.delete(TOKEN_KEY);
}
