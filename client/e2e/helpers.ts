import { expect, type Page } from '@playwright/test';

// Hàm dùng chung cho E2E. Token và dự án khớp server/src/seedDemo.ts (server E2E chạy với SEED_DEMO=1).

export const TOKENS = { admin: 'demo-token-admin', lan: 'demo-token-lan', minh: 'demo-token-minh' } as const;
export const PROJECT = 'demo-yte';
export const API = `http://localhost:3001/api/projects/${PROJECT}`;

/** Header xác thực cho request gọi thẳng API (đóng vai người dùng khác). */
export const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Mở app và nhập mã ở màn hình đăng nhập (design §4.7). Mỗi test có context mới nên luôn phải đăng nhập. */
export async function login(page: Page, token: string = TOKENS.minh) {
  await page.goto('/');
  await page.getByTestId('login-token').fill(token);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByTestId('login-token')).toHaveCount(0);
}
