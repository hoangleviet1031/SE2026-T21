import { expect, test } from '@playwright/test';
import { API, TOKENS, authHeaders, login } from './helpers';

// Lấy vị trí khi offline rồi đồng bộ (US-03, TV3-14; design §4.1 luật `gps`). Ca lấy vị trí không
// được nằm ở gps-errors.spec.ts. Vị trí giả bằng setGeolocation của Playwright: không cần mạng,
// giống GPS thật trên điện thoại.

test('offline bấm "Lấy vị trí", lưu phiếu; có mạng thì server nhận đúng toạ độ', async ({
  page,
  context,
  request,
}) => {
  const name = `Hộ có vị trí ${crypto.randomUUID().slice(0, 8)}`;
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 10.7769, longitude: 106.7009, accuracy: 12 });
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  const gps = page.getByRole('group', { name: 'Vị trí' });
  await gps.getByRole('button', { name: 'Lấy vị trí' }).click();
  await expect(gps.getByText('10.77690, 106.70090 (±12 m)')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu' }).click();

  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
  await expect(row.getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  await context.setOffline(false);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json();
  const saved = pulled.records.find((r: { data: { householdName: string } }) => r.data.householdName === name);
  expect(saved.data.location).toEqual({ lat: 10.7769, lng: 106.7009, accuracy: 12 });
});
