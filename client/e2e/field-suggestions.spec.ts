import { expect, test, type Page } from '@playwright/test';
import { answerConfirm, login } from './helpers';

// Gợi ý giá trị đã nhập ở màn hình 4 (design §4.1 "Gợi ý giá trị đã nhập", ui.md màn hình 4; Could, cắt được):
// ô chữ có <datalist> các giá trị đã nhập ở phiếu khác cùng form trên máy. Server E2E dùng chung nên chỉ kiểm
// "có chứa" với tên riêng của từng ca, không kiểm cả danh sách.

const uniq = (name: string) => `${name} ${crypto.randomUUID().slice(0, 8)}`;
const nameInput = (page: Page) => page.locator('input[name=householdName]');
const nameList = (page: Page) => page.getByTestId('suggest-householdName');
const option = (page: Page, value: string) => nameList(page).locator(`option[value="${value}"]`);

async function saveRecord(page: Page, name: string) {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await nameInput(page).fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
}

function recordRow(page: Page, text: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: text });
}

test('ô chữ gợi ý giá trị đã nhập ở phiếu khác, bỏ trùng theo hoa thường và khoảng trắng; ô số không có', async ({
  page,
}) => {
  await login(page);
  const first = uniq('Gợi ý một');
  const second = uniq('Gợi ý hai');
  await saveRecord(page, first);
  await saveRecord(page, second);
  // Cùng tên với phiếu đầu, khác hoa thường và khoảng trắng: chỉ giữ cách viết mới nhất
  await saveRecord(page, `  ${first.toUpperCase()}  `);

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await expect(nameInput(page)).toHaveAttribute('list', 'suggest-householdName');
  await expect(option(page, second)).toHaveCount(1);
  await expect(option(page, first.toUpperCase())).toHaveCount(1);
  await expect(option(page, first)).toHaveCount(0);
  // Chỉ trường chữ có gợi ý
  await expect(page.locator('input[name=members]')).not.toHaveAttribute('list');
  // Chọn gợi ý chỉ là điền vào ô, như gõ tay
  await nameInput(page).fill(second);
  await expect(nameInput(page)).toHaveValue(second);
});

test('phiếu đang mở và phiếu đã xoá không nằm trong gợi ý', async ({ page }) => {
  await login(page);
  const kept = uniq('Gợi ý còn');
  const removed = uniq('Gợi ý xoá');
  await saveRecord(page, kept);
  await saveRecord(page, removed);

  // Mở phiếu đã lưu: giá trị của chính nó đã nằm trong ô nên không gợi ý lại
  await recordRow(page, kept).getByTestId('record-title').click();
  await expect(nameInput(page)).toHaveValue(kept);
  await expect(option(page, removed)).toHaveCount(1);
  await expect(option(page, kept)).toHaveCount(0);
  await page.getByRole('link', { name: '← Quay lại' }).click();

  await recordRow(page, removed).getByTestId('record-title').click();
  await page.getByRole('button', { name: 'Xoá phiếu' }).click();
  await answerConfirm(page, 'Xoá phiếu này? Không hoàn tác được trên máy.', 'Xoá');
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await expect(option(page, kept)).toHaveCount(1);
  await expect(option(page, removed)).toHaveCount(0);
});
