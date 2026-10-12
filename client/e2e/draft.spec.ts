import { expect, test } from '@playwright/test';
import { API, TOKENS, authHeaders, login } from './helpers';

// O5 (design §10.1): phiếu thiếu trường bắt buộc lưu thành nháp, không lên server; sửa đủ thì đồng bộ.
test('O5: lưu thiếu tên chủ hộ thành Nháp, không gửi PUT; điền đủ thì đồng bộ', async ({ page, request }) => {
  const puts: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/records/')) puts.push(req.url());
  });

  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  const draftId = new URL(page.url()).hash.split('/').pop() ?? '';
  expect(draftId).not.toBe('');
  await page.locator('input[name=members]').fill('7');
  await page.getByRole('button', { name: 'Lưu' }).click();

  // Ở lại trang, báo lỗi ngay dưới trường thiếu
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await expect(page.getByTestId('error-householdName')).toHaveText('⚠ Bắt buộc nhập');

  await page.getByRole('link', { name: 'Khảo sát thực địa' }).click();
  const draftRow = page.getByTestId('records').getByRole('listitem').filter({ has: page.locator(`a[href$="/${draftId}"]`) });
  await expect(draftRow.getByTestId('sync-state')).toHaveText('Nháp');

  // Một phiếu hợp lệ đồng bộ xong nghĩa là engine đã chạy hết outbox mà không đụng tới nháp
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Phiếu hợp lệ O5');
  await page.getByRole('button', { name: 'Lưu' }).click();
  const validRow = page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Phiếu hợp lệ O5' });
  await expect(validRow.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect(draftRow.getByTestId('sync-state')).toHaveText('Nháp');
  expect(puts.filter((u) => u.endsWith(`/records/${draftId}`))).toHaveLength(0);

  // Mở lại nháp: vẫn thấy lỗi; điền đủ thì thành phiếu thường và đồng bộ
  await draftRow.getByRole('link').click();
  await expect(page.getByTestId('error-householdName')).toBeVisible();
  await page.locator('input[name=householdName]').fill('Nguyễn Văn Nháp');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(draftRow.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  expect(puts.filter((u) => u.endsWith(`/records/${draftId}`))).toHaveLength(1);

  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json();
  const saved = pulled.records.find((r: { id: string }) => r.id === draftId);
  expect(saved.version).toBe(1);
  expect(saved.data).toMatchObject({ householdName: 'Nguyễn Văn Nháp', members: 7 });
});
