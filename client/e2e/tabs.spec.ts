import { expect, test, type Page } from '@playwright/test';
import { databaseNames, login, readStore } from './helpers';

// TV2-06, design §5.3 (Nhiều dự án, Nhiều tab), ADR 0001 (Nhiều tab, một thiết bị).

function recordRow(page: Page, name: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
}

test('O6: hai tab cùng mở, mỗi op chỉ được gửi từ một tab', async ({ context }) => {
  const tab1 = await context.newPage();
  await login(tab1);
  await expect(tab1.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const tab2 = await context.newPage();
  await tab2.goto('/');
  await expect(tab2.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();

  // Tên riêng mỗi lần chạy: server E2E dùng chung nên phiếu của lần chạy trước cũng được pull về
  const name = `Hộ hai tab ${crypto.randomUUID().slice(0, 8)}`;

  // Đếm ở phía trình duyệt: mọi request của mọi tab trong context đều đi qua đây
  const puts: string[] = [];
  context.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/records/')) puts.push(req.url());
  });

  // Lưu khi offline rồi bật mạng: sự kiện `online` làm cả hai tab cùng đồng bộ một lúc,
  // là lúc dễ gửi trùng nhất.
  await context.setOffline(true);
  await tab1.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await tab1.locator('input[name=householdName]').fill(name);
  await tab1.locator('input[name=members]').fill('3');
  await tab1.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(tab1, name).getByTestId('sync-state')).toHaveText('Chờ đồng bộ');
  // Tab 2 thấy phiếu ngay nhờ liveQuery trên cùng IndexedDB
  await expect(recordRow(tab2, name).getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  await context.setOffline(false);
  await expect(recordRow(tab1, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  await expect(recordRow(tab2, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ');

  expect(puts).toHaveLength(1);
});

test('một vòng đồng bộ tải mọi dự án của người dùng vào đúng CSDL của từng dự án', async ({ page }) => {
  // lan: supervisor ở demo-yte, surveyor ở demo-nongnghiep (server/src/seedDemo.ts)
  await login(page, 'lan');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();

  await expect
    .poll(async () => {
      const projects = (await readStore(page, 'field-survey-account', 'projects')) as { id: string; role: string }[];
      return projects.map((p) => `${p.id}:${p.role}`).sort();
    })
    .toEqual(['demo-nongnghiep:surveyor', 'demo-yte:supervisor']);

  // Dự án không đang chọn cũng có CSDL riêng và đã tải form
  await expect
    .poll(async () => (await databaseNames(page)).includes('field-survey-p-demo-nongnghiep'))
    .toBe(true);
  await expect
    .poll(async () => (await readStore(page, 'field-survey-p-demo-nongnghiep', 'forms')).length)
    .toBeGreaterThan(0);
  const projects = (await readStore(page, 'field-survey-account', 'projects')) as { status: string }[];
  expect(projects.every((p) => p.status === 'active')).toBe(true);
});
