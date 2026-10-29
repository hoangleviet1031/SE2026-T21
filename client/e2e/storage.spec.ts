import { expect, test } from '@playwright/test';
import { PROJECT, databaseNames, login, readStore } from './helpers';

// TV2-05, design §4.2 và ADR 0002 §4: một CSDL account cho cả máy, mỗi dự án một CSDL riêng,
// CSDL `field-survey` của khung cũ bị xoá khi khởi động. Đọc IndexedDB bằng API gốc của trình
// duyệt, không qua Dexie của app, để kiểm đúng thứ nằm trên máy.

const ACCOUNT_DB = 'field-survey-account';
const PROJECT_DB = `field-survey-p-${PROJECT}`;
const LEGACY_DB = 'field-survey';

test('đăng nhập xong có CSDL account và CSDL của dự án, không có CSDL cũ', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();

  const names = await databaseNames(page);
  expect(names).toContain(ACCOUNT_DB);
  expect(names).toContain(PROJECT_DB);
  expect(names).not.toContain(LEGACY_DB);

  // Mã đăng nhập nằm trong CSDL account, không nằm trong CSDL dự án
  const account = await readStore(page, ACCOUNT_DB, 'account');
  expect(account).toContainEqual({ key: 'token', value: expect.any(String) });
  expect(await readStore(page, PROJECT_DB, 'meta')).not.toContainEqual(expect.objectContaining({ key: 'authToken' }));
});

test('CSDL field-survey của khung cũ bị xoá khi mở app', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('field-survey', 10);
        open.onupgradeneeded = () => open.result.createObjectStore('meta', { keyPath: 'key' });
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          open.result.close();
          resolve();
        };
      }),
  );
  expect(await databaseNames(page)).toContain(LEGACY_DB);

  await page.reload();
  await expect.poll(() => databaseNames(page), { timeout: 10_000 }).not.toContain(LEGACY_DB);
});

test('phiếu và op được ghi vào CSDL của dự án đang chọn', async ({ page, context }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();

  // Offline để op còn nằm trong outbox khi đọc
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Hộ trong CSDL dự án');
  await page.locator('input[name=members]').fill('2');
  await page.getByRole('button', { name: 'Lưu' }).click();
  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Hộ trong CSDL dự án' });
  await expect(row.getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  const records = (await readStore(page, PROJECT_DB, 'records')) as { id: string; data: { householdName?: string } }[];
  const saved = records.find((r) => r.data.householdName === 'Hộ trong CSDL dự án');
  expect(saved).toBeDefined();
  const outbox = (await readStore(page, PROJECT_DB, 'outbox')) as { recordId: string }[];
  expect(outbox.map((op) => op.recordId)).toContain(saved?.id);
});
