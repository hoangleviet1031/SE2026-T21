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

// Trường chọn nhiều là nhóm, không bọc trong <label> (lỗi nhãn lồng, sửa ở TV1-12 b2 p3)
test('chọn nhiều: là nhóm mang tên trường, mỗi ô tên đúng lựa chọn, bấm tên trường không đánh dấu ô nào', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  const group = page.getByRole('group', { name: 'Tài sản' });
  await expect(group).toBeVisible();
  const boxes = group.getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  for (const option of ['Xe máy', 'Tivi', 'Tủ lạnh', 'Máy giặt']) {
    await expect(group.getByRole('checkbox', { name: option, exact: true })).toHaveAccessibleName(option);
  }
  await group.getByText('Tài sản', { exact: true }).click();
  await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(0);
});

// Tech-debt N16 (ui.md "Hệ thống thiết kế"): ô đang báo lỗi lúc nhập vẫn giữ viền đỏ, chỉ thêm quầng vàng
test('N16: ô thiếu trường bắt buộc, Tab về lại thì vẫn viền đỏ + quầng vàng', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.getByRole('button', { name: 'Lưu' }).click();
  const name = page.getByLabel('Tên chủ hộ *');
  await expect(name).toHaveCSS('border-top-color', 'rgb(192, 38, 26)');
  await page.getByLabel('Số thành viên').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(name).toBeFocused();
  await expect(name).toHaveCSS('border-top-color', 'rgb(192, 38, 26)');
  await expect(name).toHaveCSS('outline', 'rgb(253, 229, 154) solid 3px');
});
