import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { API, TOKENS, authHeaders, login } from './helpers';

// Nút Xuất ở trang chủ (design §4.6, ui.md màn hình 2, ticket TV3-09): supervisor/owner tải được file
// thật, surveyor không thấy nút, cần mạng.

const FORM_TITLE = 'Khảo sát hộ gia đình';
const formRow = (page: Page) => page.getByRole('listitem').filter({ hasText: FORM_TITLE });

/**
 * lan là supervisor ở demo-yte nhưng chỉ là surveyor ở demo-nongnghiep, và /me sắp theo id nên app mở
 * demo-nongnghiep trước. Chọn demo-yte bằng bộ chọn dự án như người dùng.
 */
async function loginSupervisorYte(page: Page) {
  await login(page, 'lan');
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name: /Y tế xã \(demo\)/ }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName('Y tế xã (demo)');
}

test('supervisor bấm "Xuất CSV": tải file .csv có BOM, có phiếu của dự án', async ({ page, request }) => {
  const name = `Hộ xuất ${Date.now()}`;
  const put = await request.put(`${API}/records/${crypto.randomUUID()}`, {
    headers: { ...authHeaders(TOKENS.minh), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 0, deleted: false, data: { householdName: name } },
  });
  expect(put.status()).toBe(201);

  await loginSupervisorYte(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    formRow(page).getByRole('button', { name: 'Xuất CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('household-survey.csv');
  const bytes = readFileSync(await download.path());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.toString('utf8');
  expect(text).toContain('id,version,updatedAt,updatedBy,updatedByName,formVersion,deleted,householdName');
  expect(text).toContain(name);
});

test('supervisor bấm "Xuất JSON": file có forms và records', async ({ page }) => {
  await loginSupervisorYte(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    formRow(page).getByRole('button', { name: 'Xuất JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('household-survey.json');
  const body = JSON.parse(readFileSync(await download.path(), 'utf8')) as { forms: unknown[]; records: unknown[] };
  expect(body.forms.length).toBeGreaterThan(0);
  expect(Array.isArray(body.records)).toBe(true);
});

test('surveyor không thấy nút Xuất', async ({ page }) => {
  await login(page, 'minh');
  await expect(formRow(page).getByRole('button', { name: 'Tạo phiếu mới' })).toBeVisible();
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toHaveCount(0);
  await expect(formRow(page).getByRole('button', { name: 'Xuất JSON' })).toHaveCount(0);
});

test('offline: nút Xuất bị khoá, báo cần mạng', async ({ page, context }) => {
  await loginSupervisorYte(page);
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toBeEnabled();
  await context.setOffline(true);
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toBeDisabled();
  await expect(formRow(page).getByTestId('export-offline')).toHaveText('Cần kết nối mạng để xuất');
});
