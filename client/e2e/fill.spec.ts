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

// Đổi 8 (TV1-12 b2): hàng nút dính đáy, phiếu dài vẫn bấm Lưu bằng ngón cái mà không che trường nào.
test('màn 360 px: [Lưu] trong khung nhìn khi chưa cuộn; cuộn tới cuối thì trường cuối nằm trên hàng nút', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  const save = page.getByRole('button', { name: 'Lưu' });
  const lastField = page.getByRole('group', { name: 'Vị trí' });
  await expect(lastField).not.toBeInViewport();
  await expect(save).toBeInViewport();

  const bar = page.getByTestId('record-actions');
  const lastAboveBar = async () => {
    const field = await lastField.boundingBox();
    const actions = await bar.boundingBox();
    expect(field && actions && field.y + field.height <= actions.y).toBe(true);
  };
  // Focus vào nút trong trường cuối (như bấm Tab): trình duyệt cuộn tới mà không để hàng nút che
  await lastField.getByRole('button', { name: 'Lấy vị trí' }).focus();
  await expect(lastField).toBeInViewport();
  await lastAboveBar();
  // Cuộn hết cỡ như người dùng vuốt
  await page.mouse.wheel(0, 5000);
  await expect(save).toBeInViewport();
  await lastAboveBar();
});

test('chọn nhiều: bấm chỗ trống bên phải ô cũng đánh dấu', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  const tivi = page.getByRole('checkbox', { name: 'Tivi', exact: true });
  // Ô bấm là label bọc ngay ngoài ô đánh dấu
  const tile = tivi.locator('..');
  const box = await tile.boundingBox();
  if (!box) throw new Error('không thấy ô Tivi');
  await tile.click({ position: { x: box.width - 6, y: box.height / 2 } });
  await expect(tivi).toBeChecked();
});
