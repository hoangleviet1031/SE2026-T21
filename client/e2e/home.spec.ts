import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Trang chủ theo bản thiết kế (TV1-12 b2 p2; design §4.6, §4.8, ui.md màn hình 2): nút [Xuất ▾] và
// dòng phiếu bấm được cả hàng. Ẩn bộ lọc khi chưa có phiếu ở ui-states.spec.ts.

const FORM_TITLE = 'Khảo sát hộ gia đình';
const formRow = (page: Page) => page.getByRole('listitem').filter({ hasText: FORM_TITLE });

/** lan là supervisor ở demo-yte; /me sắp theo id nên app mở demo-nongnghiep trước (như export.spec.ts). */
async function loginSupervisorYte(page: Page) {
  await login(page, 'lan');
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name: /Y tế xã \(demo\)/ }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName('Y tế xã (demo)');
}

test('[Xuất ▾]: mở thấy hai lựa chọn; Esc đóng và trả focus về nút; bấm ra ngoài cũng đóng', async ({ page }) => {
  await loginSupervisorYte(page);
  const toggle = formRow(page).getByRole('button', { name: 'Xuất', exact: true });
  // Nhiều thẻ form cùng có nút "Xuất": trình đọc màn hình đọc kèm tên form
  await expect(toggle).toHaveAccessibleDescription(FORM_TITLE);
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toBeVisible();
  await expect(formRow(page).getByRole('button', { name: 'Xuất JSON' })).toBeVisible();

  await formRow(page).getByRole('button', { name: 'Xuất CSV' }).focus();
  await page.keyboard.press('Escape');
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(formRow(page).getByRole('button', { name: 'Xuất JSON' })).toBeVisible();
  await page.getByRole('heading', { name: 'Phiếu đã nhập' }).click();
  await expect(formRow(page).getByRole('button', { name: 'Xuất JSON' })).toHaveCount(0);
});

test('dòng phiếu: bấm chỗ mũi tên › (không phải chữ tên) cũng mở đúng phiếu', async ({ page }) => {
  await login(page);
  const name = `Hộ bấm hàng ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();

  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
  await expect(row).toBeVisible();
  const href = await row.getByRole('link', { name }).getAttribute('href');
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  // Mũi tên nằm sát mép phải, giữa phần trên của dòng
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) - 20, (box?.y ?? 0) + 24);
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.locator('input[name=householdName]')).toHaveValue(name);
});

test('có phiếu mà lọc ra rỗng: vẫn hiện bộ lọc, báo "Không có phiếu nào ở trạng thái này."', async ({ page }) => {
  await login(page);
  const name = `Hộ lọc rỗng ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('records').getByText(name)).toBeVisible();

  // Phiếu vừa lưu đủ trường nên không phải Lỗi
  await page.getByRole('radio', { name: 'Lỗi' }).check();
  await expect(page.getByTestId('no-records')).toHaveText('Không có phiếu nào ở trạng thái này.');
  await expect(page.getByRole('radiogroup', { name: 'Lọc theo trạng thái' })).toBeVisible();
});
