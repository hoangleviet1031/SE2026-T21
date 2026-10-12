import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { API, TOKENS, authHeaders, login } from './helpers';

// TV2-09: op `failed` khi server trả 4xx, nút "Thử lại", sửa phiếu lỗi, "Xuất JSON phiếu này"
// (design §5.1, §5.2, §8; ca R5 ở §10.1).

const FAULTS = 'http://localhost:3001/api/__test/faults';

test.afterEach(async ({ request }) => {
  await request.delete(FAULTS);
});

function row(page: Page, name: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
}

/** Đăng nhập, tiêm một lỗi 400, lưu phiếu và chờ phiếu thành "Lỗi". */
async function saveFailingRecord(page: Page, request: APIRequestContext, name: string) {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await request.post(FAULTS, { data: { mode: '400', count: 1 } });
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(row(page, name).getByTestId('sync-state')).toHaveText('Lỗi');
  await expect(row(page, name).getByTestId('sync-error')).toContainText('400');
}

async function serverCopies(request: APIRequestContext, name: string) {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json();
  return (pulled.records as { version: number; data: { householdName?: string } }[]).filter(
    (r) => r.data.householdName === name,
  );
}

/** Đếm PUT phiếu và số vòng pull đã xong (mỗi vòng đồng bộ kết thúc bằng pull). */
function trackRequests(context: BrowserContext) {
  const counts = { puts: 0, pulls: 0 };
  context.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/records/')) counts.puts += 1;
  });
  context.on('requestfinished', (req) => {
    if (req.method() === 'GET' && req.url().includes('/records?since=')) counts.pulls += 1;
  });
  return counts;
}

test('R5: server trả 400: phiếu "Lỗi", không retry; bấm Thử lại thì đồng bộ được', async ({
  page,
  context,
  request,
}) => {
  const counts = trackRequests(context);
  const name = `Hộ R5 ${crypto.randomUUID().slice(0, 8)}`;
  await saveFailingRecord(page, request, name);
  expect(counts.puts).toBe(1);

  // Chạy thêm hai vòng đồng bộ trọn vẹn: op failed không được gửi lại
  for (let i = 0; i < 2; i++) {
    const before = counts.pulls;
    await page.getByRole('button', { name: 'Đồng bộ' }).click();
    await expect.poll(() => counts.pulls).toBeGreaterThan(before);
  }
  expect(counts.puts).toBe(1);
  await expect(row(page, name).getByTestId('sync-state')).toHaveText('Lỗi');

  await row(page, name).getByRole('button', { name: 'Thử lại' }).click();
  await expect(row(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ');
  expect((await serverCopies(request, name)).map((r) => r.version)).toEqual([1]);
});

test('sửa phiếu đang "Lỗi": gửi dữ liệu mới, đồng bộ được', async ({ page, request }) => {
  const name = `Hộ lỗi ${crypto.randomUUID().slice(0, 8)}`;
  await saveFailingRecord(page, request, name);

  const fixed = `${name} (đã sửa)`;
  await row(page, name).getByRole('link', { name }).click();
  await page.locator('input[name=householdName]').fill(fixed);
  await page.getByRole('button', { name: 'Lưu' }).click();

  await expect(row(page, fixed).getByTestId('sync-state')).toHaveText('Đã đồng bộ');
  expect((await serverCopies(request, fixed)).map((r) => r.version)).toEqual([1]);
  expect(await serverCopies(request, name)).toEqual([]);
});

test('"Xuất JSON phiếu này" tải về đúng phiếu đang lỗi', async ({ page, request }) => {
  const name = `Hộ xuất ${crypto.randomUUID().slice(0, 8)}`;
  await saveFailingRecord(page, request, name);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    row(page, name).getByRole('button', { name: 'Xuất JSON phiếu này' }).click(),
  ]);
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, 'utf8')) as {
    projectId: string;
    records: { syncState: string; data: { householdName?: string } }[];
  };
  expect(exported.projectId).toBe('demo-yte');
  expect(exported.records).toHaveLength(1);
  expect(exported.records[0]).toMatchObject({ syncState: 'error', data: { householdName: name } });
});
