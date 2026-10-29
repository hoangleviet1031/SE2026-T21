import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Kiểm tra trình duyệt và xin giữ bộ nhớ (TV1-07 phần 2b; design §4.2, §11.1).

test('thiếu Web Locks thì hiện "Trình duyệt không được hỗ trợ" thay cho app', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trình duyệt không được hỗ trợ' })).toBeVisible();
  await expect(page.getByTestId('unsupported-browser')).toContainText('Thiếu: Web Locks');
  await expect(page.getByTestId('login-username')).toHaveCount(0);
  // App không chạy nên không tạo CSDL nào
  expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
});

test('lưu phiếu thì xin trình duyệt giữ bộ nhớ, kể cả khi phiếu còn là nháp', async ({ page }) => {
  // Đếm lời gọi: Chromium khi chạy test tự quyết có cấp hay không, nên không kiểm kết quả cấp
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(window, '__persistCalls', { get: () => calls });
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false });
    Object.defineProperty(navigator.storage, 'persist', {
      value: async () => {
        calls += 1;
        return false;
      },
    });
  });
  const persistCalls = () => page.evaluate(() => Reflect.get(window, '__persistCalls'));

  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  expect(await persistCalls()).toBe(0);

  // Thiếu trường bắt buộc: phiếu lưu thành nháp, vẫn là dữ liệu chỉ nằm trên máy
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await expect.poll(persistCalls).toBe(1);
});
