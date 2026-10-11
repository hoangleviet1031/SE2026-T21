import { expect, test } from '@playwright/test';
import { login } from './helpers';

const API = 'http://localhost:3001/api';

test('cùng trường bị sửa ở hai nơi: hiện màn hình conflict, người dùng chọn rồi đồng bộ', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Trần Thị Gốc');
  await page.locator('input[name=members]').fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();

  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Trần Thị' });
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ');
  const id = (await row.getByRole('link').first().getAttribute('href'))!.split('/').pop()!;

  // Máy này offline sửa tên và số thành viên
  await context.setOffline(true);
  await row.getByRole('link').first().click();
  await page.locator('input[name=householdName]').fill('Trần Thị Máy A');
  await page.locator('input[name=members]').fill('5');
  await page.getByRole('button', { name: 'Lưu' }).click();

  // Trong lúc đó người khác sửa tên và nguồn nước trên server
  const other = await request.put(`${API}/records/${id}`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {
      formId: 'household-survey',
      formVersion: 1,
      baseVersion: 1,
      deleted: false,
      updatedBy: 'Lan',
      data: { householdName: 'Trần Thị Máy B', members: 3, waterSource: 'Giếng' },
    },
  });
  expect(other.status()).toBe(200);

  await context.setOffline(false);
  const conflictBadge = page.getByRole('link', { name: 'Cần xử lý xung đột' });
  await expect(conflictBadge).toBeVisible({ timeout: 15_000 });
  await conflictBadge.click();

  await expect(page.getByText('Lan')).toBeVisible();
  const table = page.getByTestId('conflict-table');
  // Chỉ householdName xung đột; members và waterSource được gộp tự động
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.getByLabel('Trần Thị Máy A').check();
  await page.getByRole('button', { name: 'Áp dụng và đồng bộ' }).click();

  await expect(page.getByTestId('records').getByTestId('sync-state').first()).toHaveText('Đã đồng bộ', {
    timeout: 15_000,
  });
  const pulled = await (await request.get(`${API}/records?since=0`)).json();
  const saved = pulled.records.find((r: { id: string }) => r.id === id);
  expect(saved.version).toBe(3);
  expect(saved.data).toMatchObject({ householdName: 'Trần Thị Máy A', members: 5, waterSource: 'Giếng' });
});
