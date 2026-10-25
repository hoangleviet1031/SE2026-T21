import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, TOKENS, authHeaders, login } from './helpers';

// Tech-debt N12: trang điền phiếu có nhãn trạng thái đầu trang (cùng displayState với trang chủ); phiếu
// "Lỗi" có câu lỗi, [Thử lại], [Xuất JSON phiếu này] ngay trên trang (ui.md màn hình 4, design §8).

const FAULTS = 'http://localhost:3001/api/__test/faults';

test.afterEach(async ({ request }) => {
  await request.delete(FAULTS);
});

function row(page: Page, name: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
}

/** Đăng nhập, tiêm một lỗi 400, lưu phiếu, chờ phiếu thành "Lỗi" rồi mở lại phiếu đó. */
async function openFailingRecord(page: Page, request: APIRequestContext, name: string) {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await request.post(FAULTS, { data: { mode: '400', count: 1 } });
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(row(page, name).getByTestId('sync-state')).toHaveText('Lỗi');
  await row(page, name).getByRole('link', { name }).click();
}

async function serverVersions(request: APIRequestContext, name: string) {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json();
  return (pulled.records as { version: number; data: { householdName?: string } }[])
    .filter((r) => r.data.householdName === name)
    .map((r) => r.version);
}

test('N12: mở phiếu "Lỗi" thấy nhãn và câu lỗi đầu trang; Thử lại ngay trên trang thì đồng bộ được', async ({
  page,
  request,
}) => {
  const name = `Hộ N12 ${crypto.randomUUID().slice(0, 8)}`;
  await openFailingRecord(page, request, name);

  await expect(page.getByTestId('record-state')).toHaveText('Lỗi');
  await expect(page.getByTestId('sync-error')).toContainText('400');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  // Ở lại trang: nhãn đổi theo IndexedDB, khối lỗi mất
  await expect(page.getByTestId('record-state')).toHaveText('Đã đồng bộ');
  await expect(page.getByTestId('sync-error')).toHaveCount(0);
  expect(await serverVersions(request, name)).toEqual([1]);
});

test('N12: "Xuất JSON phiếu này" ở trang điền phiếu tải về đúng phiếu đang lỗi', async ({ page, request }) => {
  const name = `Hộ N12 xuất ${crypto.randomUUID().slice(0, 8)}`;
  await openFailingRecord(page, request, name);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Xuất JSON phiếu này' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^phieu-.+\.json$/);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    records: { syncState: string; data: { householdName?: string } }[];
  };
  expect(exported.records).toHaveLength(1);
  expect(exported.records[0]).toMatchObject({ syncState: 'error', data: { householdName: name } });
});

test('N12: phiếu mới chưa lưu không có nhãn; phiếu đã đồng bộ mở lại có nhãn "Đã đồng bộ", không có khối lỗi', async ({
  page,
}) => {
  const name = `Hộ N12 ổn ${crypto.randomUUID().slice(0, 8)}`;
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await expect(page.locator('input[name=householdName]')).toBeVisible();
  await expect(page.getByTestId('record-state')).toHaveCount(0);
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(row(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ');

  await row(page, name).getByRole('link', { name }).click();
  await expect(page.getByTestId('record-state')).toHaveText('Đã đồng bộ');
  await expect(page.getByTestId('sync-error')).toHaveCount(0);
});
