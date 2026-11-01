import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, TOKENS, authHeaders, login } from './helpers';

// TV2-08, design §10.1 R2, R3 và ADR 0001 quy tắc 3: gửi lại cùng Idempotency-Key không bao giờ
// tạo bản ghi thứ hai.

const FAULTS = 'http://localhost:3001/api/__test/faults';

test.afterEach(async ({ request }) => {
  await request.delete(FAULTS);
});

async function saveRecord(page: Page, name: string) {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: name }).getByTestId('sync-state');
}

async function serverCopies(request: APIRequestContext, name: string) {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json();
  return pulled.records.filter((r: { data: { householdName?: string } }) => r.data.householdName === name) as {
    version: number;
  }[];
}

test('R2: server giữ request quá timeout của client: client huỷ, gửi lại, server chỉ có một bản ghi', async ({
  page,
  request,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  // Server giữ request 15 s; client huỷ sau 10 s rồi retry theo backoff
  await request.post(FAULTS, { data: { mode: 'timeout', count: 1 } });

  const name = `Hộ R2 ${crypto.randomUUID().slice(0, 8)}`;
  const state = await saveRecord(page, name);
  await expect(state).toHaveText('Đã đồng bộ', { timeout: 40_000 });

  // Request bị giữ được xử lý sau cùng; nó phải nhận replay chứ không ghi thêm
  await expect.poll(async () => (await serverCopies(request, name)).map((r) => r.version), { timeout: 10_000 }).toEqual([1]);
});

test('R3: server ghi xong nhưng kết nối bị cắt trước response: gửi lại nhận Idempotent-Replayed, một bản ghi', async ({
  page,
  request,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await request.post(FAULTS, { data: { mode: 'drop', count: 1 } });

  const replayed: number[] = [];
  page.on('response', (res) => {
    if (res.request().method() === 'PUT' && res.headers()['idempotent-replayed'] === 'true') replayed.push(res.status());
  });

  const name = `Hộ R3 ${crypto.randomUUID().slice(0, 8)}`;
  const state = await saveRecord(page, name);
  await expect(state).toHaveText('Đã đồng bộ', { timeout: 20_000 });

  expect(replayed).toEqual([201]);
  expect((await serverCopies(request, name)).map((r) => r.version)).toEqual([1]);
});
