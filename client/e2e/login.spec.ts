import { expect, test } from '@playwright/test';

// TV1-02, design §4.7 "Lần đầu mở app". Chưa có GET /api/me (TV2-04) nên mã nào cũng được nhận.

test('lần đầu mở app thấy màn hình nhập mã; nhập xong vào trang chủ, tải lại vẫn ở trang chủ', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('login-token')).toBeVisible();
  await expect(page.getByText('Nhận mã từ quản trị viên.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo phiếu mới' })).toHaveCount(0);

  await page.getByTestId('login-token').fill('  ma-thu-nghiem  ');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await expect(page.getByTestId('login-token')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await expect(page.getByTestId('login-token')).toHaveCount(0);
});

test('offline lần đầu (chưa có mã): báo cần kết nối mạng, không vào được trang chủ', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('login-token')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng để đăng nhập lần đầu');

  await page.getByTestId('login-token').fill('ma-thu-nghiem');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng để đăng nhập lần đầu');

  // Có mạng lại rồi tải lại: nếu lúc offline mã đã bị lưu thì sẽ vào thẳng trang chủ
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByTestId('login-token')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
