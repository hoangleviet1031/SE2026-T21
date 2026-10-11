import { expect, type Page } from '@playwright/test';

// Hàm dùng chung cho E2E. TV3-02 sẽ mở rộng file này (fixture dự án, token thật);
// giữ chữ ký login(page, token) để các spec không phải sửa lại.

/** Mở app và nhập mã ở màn hình đăng nhập (design §4.7). Mỗi test có context mới nên luôn phải đăng nhập. */
export async function login(page: Page, token = 'e2e-token') {
  await page.goto('/');
  await page.getByTestId('login-token').fill(token);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByTestId('login-token')).toHaveCount(0);
}
