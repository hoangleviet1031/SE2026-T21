import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Trang điền phiếu (ui.md màn hình 4): "← Quay lại" về danh sách, phần chưa bấm Lưu không được giữ.

test('← Quay lại về trang chủ và không tạo phiếu', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Chưa lưu');
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  await expect(page.getByTestId('records').getByText('Chưa lưu')).toHaveCount(0);
});
