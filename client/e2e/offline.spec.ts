import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // Chờ SW kiểm soát trang để reload khi offline vẫn tải được app shell
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
    return reg.active?.state;
  });
}

test('điền phiếu khi offline, có mạng lại thì tự đồng bộ', async ({ page, context, request }) => {
  await login(page);
  await waitForServiceWorker(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Nguyễn Văn Offline');
  await page.locator('input[name=members]').fill('4');
  await page.getByRole('button', { name: 'Lưu' }).click();

  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Nguyễn Văn Offline' });
  await expect(row.getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  await context.setOffline(false);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  const pulled = await (await request.get('http://localhost:3001/api/records?since=0')).json();
  const saved = pulled.records.find((r: { data: { householdName: string } }) => r.data.householdName === 'Nguyễn Văn Offline');
  expect(saved.version).toBe(1);
  expect(saved.data.members).toBe(4);
});

test('server lỗi 500 hai lần: retry và vẫn đồng bộ đúng một bản ghi', async ({ page, request }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await request.post('http://localhost:3001/api/__test/faults', { data: { mode: '500', count: 2 } });

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Retry 500');
  await page.getByRole('button', { name: 'Lưu' }).click();

  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Retry 500' });
  // Backoff: ~1s rồi ~2s; nút Đồng bộ chỉ kích hoạt lại, không bỏ qua lịch retry
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 40_000 });

  const pulled = await (await request.get('http://localhost:3001/api/records?since=0')).json();
  const matches = pulled.records.filter((r: { data: { householdName: string } }) => r.data.householdName === 'Retry 500');
  expect(matches).toHaveLength(1);
});
