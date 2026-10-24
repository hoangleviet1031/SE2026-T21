import { accountDb, getAccountValue, setAccountValue } from './db/accountDb';

// Mã đăng nhập nằm trong `field-survey-account` (design §4.2), dùng chung cho mọi dự án.
// Giữ nguyên chữ ký getToken, setToken, clearToken vì api.ts, App.tsx và LoginPage dựa vào chúng.

export function getToken(): Promise<string | null> {
  return getAccountValue<string | null>('token', null);
}

export async function setToken(token: string): Promise<void> {
  await accountDb.transaction('rw', accountDb.account, async () => {
    await setAccountValue('token', token);
    await accountDb.account.delete('sessionExpired');
  });
}

/** Màn hình Đăng nhập có cần báo "Phiên đăng nhập hết hạn" không. */
export function isSessionExpired(): Promise<boolean> {
  return getAccountValue<boolean>('sessionExpired', false);
}

/**
 * Server từ chối token (401): xoá token và ghi lại lý do để màn hình Đăng nhập báo (design §8). Chỉ ghi
 * khi token còn: request về muộn sau khi người dùng tự đăng xuất thì không báo hết hạn.
 */
export async function expireSession(): Promise<void> {
  await accountDb.transaction('rw', accountDb.account, async () => {
    if (!(await accountDb.account.get('token'))) return;
    await accountDb.account.delete('token');
    await setAccountValue('sessionExpired', true);
  });
}

export async function clearToken(): Promise<void> {
  await accountDb.account.delete('token');
}
