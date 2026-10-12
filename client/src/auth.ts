import { accountDb, getAccountValue, setAccountValue } from './db/accountDb';

// Mã đăng nhập nằm trong `field-survey-account` (design §4.2), dùng chung cho mọi dự án.
// Giữ nguyên chữ ký ba hàm vì api.ts, App.tsx và LoginPage dựa vào chúng.

export function getToken(): Promise<string | null> {
  return getAccountValue<string | null>('token', null);
}

export async function setToken(token: string): Promise<void> {
  await setAccountValue('token', token);
}

export async function clearToken(): Promise<void> {
  await accountDb.account.delete('token');
}
