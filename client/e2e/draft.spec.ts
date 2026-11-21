import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { API, TOKENS, authHeaders, login, readStore } from './helpers';

const FAULTS = 'http://localhost:3001/api/__test/faults';

test.afterEach(async ({ request }) => {
  await request.delete(FAULTS);
});

// O5 (design §10.1): phiếu thiếu trường bắt buộc lưu thành nháp, không lên server; sửa đủ thì đồng bộ.
test('O5: lưu thiếu tên chủ hộ thành Nháp, không gửi PUT; điền đủ thì đồng bộ', async ({ page, request }) => {
  const puts: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/records/')) puts.push(req.url());
  });

  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();

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

// Phiếu "Lỗi" (op failed, TV2-09) bị sửa thành nháp: op failed vẫn giữ trên máy vì chưa có dữ liệu
// hợp lệ thay thế (CLAUDE.md bất biến 1); sửa đủ thì op mới thay op failed và đồng bộ.
test('phiếu Lỗi sửa thành nháp giữ op failed; điền đủ thì đồng bộ bản mới', async ({ page, request }) => {
  const name = `Hộ lỗi nháp ${crypto.randomUUID().slice(0, 8)}`;
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await request.post(FAULTS, { data: { mode: '400', count: 1 } });
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  const id = new URL(page.url()).hash.split('/').pop() ?? '';
  expect(id).not.toBe('');
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const recordRow = page.getByTestId('records').getByRole('listitem').filter({ has: page.locator(`a[href$="/${id}"]`) });
  await expect(recordRow.getByTestId('sync-state')).toHaveText('Lỗi');

  await recordRow.getByRole('link').click();
  await page.locator('input[name=householdName]').fill('');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();

  const ops = (await readStore(page, 'field-survey-p-demo-yte', 'outbox')) as {
    recordId: string;
    status: string;
    data: { householdName?: string };
  }[];
  expect(ops.filter((op) => op.recordId === id)).toMatchObject([{ status: 'failed', data: { householdName: name } }]);

  await page.getByRole('link', { name: 'Khảo sát thực địa' }).click();
  await expect(recordRow.getByTestId('sync-state')).toHaveText('Nháp');

  const fixed = `${name} (đã sửa)`;
  // Link ở trang chủ lấy giá trị trường đầu tiên, đang rỗng nên không bấm được; mở thẳng phiếu
  await page.goto(`/#/fill/household-survey/${id}`);
  await page.locator('input[name=householdName]').fill(fixed);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json();
  const saved = pulled.records.find((r: { id: string }) => r.id === id);
  expect(saved.version).toBe(1);
  expect(saved.data.householdName).toBe(fixed);
});

// ---- Phiếu Chờ đồng bộ sửa thành Nháp: op hợp lệ cũ còn trong outbox (design §5.1) ----
// Op cũ gặp 409 hay 4xx thì dữ liệu nháp không được lên server và phiếu vẫn là Nháp.

const DB = 'field-survey-p-demo-yte';

interface StoredRecord {
  id: string;
  data: Record<string, unknown>;
  baseVersion: number;
  syncState: string;
}

interface StoredOp {
  recordId: string;
  status: string;
}

/** Tạo phiếu đã đồng bộ, offline sửa hợp lệ (op chờ gửi) rồi xoá tên chủ hộ thành nháp. Trả id. */
async function pendingThenDraft(page: Page, context: BrowserContext, name: string): Promise<string> {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  const id = new URL(page.url()).hash.split('/').pop() ?? '';
  expect(id).not.toBe('');
  await page.locator('input[name=householdName]').fill(name);
  await page.locator('input[name=members]').fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();
  const recordRow = page.getByTestId('records').getByRole('listitem').filter({ has: page.locator(`a[href$="/${id}"]`) });
  await expect(recordRow.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  await context.setOffline(true);
  await recordRow.getByRole('link').click();
  await page.locator('input[name=members]').fill('5');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow.getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  await page.goto(`/#/fill/household-survey/${id}`);
  await page.locator('input[name=householdName]').fill('');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  // Op hợp lệ cũ (members 5) vẫn chờ gửi: đúng điều kiện của các ca dưới
  expect(await opsOf(page, id)).toMatchObject([{ status: 'queued' }]);
  // Rời trang điền phiếu trước khi có mạng: đồng bộ chạy nền lúc form không mở
  await page.getByRole('link', { name: 'Khảo sát thực địa' }).click();
  return id;
}

/** Người khác sửa phiếu trên server (đóng vai máy B), từ bản 1. */
async function otherDevicePut(request: APIRequestContext, id: string, data: Record<string, unknown>) {
  const res = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 1, deleted: false, data },
  });
  expect(res.status()).toBe(200);
}

async function serverRecord(request: APIRequestContext, id: string) {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.lan) })).json();
  return pulled.records.find((r: { id: string }) => r.id === id) as { version: number; data: Record<string, unknown> };
}

async function localRecord(page: Page, id: string): Promise<StoredRecord | undefined> {
  return ((await readStore(page, DB, 'records')) as StoredRecord[]).find((r) => r.id === id);
}

async function opsOf(page: Page, id: string): Promise<StoredOp[]> {
  return ((await readStore(page, DB, 'outbox')) as StoredOp[]).filter((op) => op.recordId === id);
}

test('phiếu nháp còn op cũ gặp 409 tự gộp: không gửi nháp, gộp bản server vào nháp; điền đủ thì gửi bản gộp', async ({
  page,
  context,
  request,
}) => {
  const name = `Hộ nháp 409 ${crypto.randomUUID().slice(0, 8)}`;
  const id = await pendingThenDraft(page, context, name);
  await otherDevicePut(request, id, { householdName: name, members: 3, waterSource: 'Giếng' });

  await context.setOffline(false);
  // 409 gộp xong thì base của máy là bản 2 của server và op cũ đã bị bỏ
  await expect.poll(async () => (await localRecord(page, id))?.baseVersion, { timeout: 15_000 }).toBe(2);
  const local = await localRecord(page, id);
  expect(local?.syncState).toBe('draft');
  expect(local?.data).toMatchObject({ householdName: '', members: 5, waterSource: 'Giếng' });
  expect(await opsOf(page, id)).toHaveLength(0);
  const onServer = await serverRecord(request, id);
  expect(onServer.version).toBe(2);
  expect(onServer.data.householdName).toBe(name);

  // Điền đủ: bản gửi lên có cả phần của máy (số thành viên) lẫn phần server (nguồn nước)
  await page.goto(`/#/fill/household-survey/${id}`);
  await expect(page.locator('input[name=members]')).toHaveValue('5');
  await page.locator('input[name=householdName]').fill(`${name} (đủ)`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect.poll(async () => (await serverRecord(request, id)).version, { timeout: 15_000 }).toBe(3);
  expect((await serverRecord(request, id)).data).toMatchObject({
    householdName: `${name} (đủ)`,
    members: 5,
    waterSource: 'Giếng',
  });
});

test('phiếu nháp gặp 409 có trường xung đột: giữ giá trị của mình thì về Nháp, không gửi', async ({
  page,
  context,
  request,
}) => {
  const name = `Hộ nháp xung đột ${crypto.randomUUID().slice(0, 8)}`;
  const id = await pendingThenDraft(page, context, name);
  // Cả hai cùng sửa số thành viên: 5 trên máy, 7 trên server
  await otherDevicePut(request, id, { householdName: name, members: 7 });

  await context.setOffline(false);
  const conflictBadge = page.getByRole('link', { name: 'Cần xử lý xung đột' });
  await expect(conflictBadge).toBeVisible({ timeout: 15_000 });
  await conflictBadge.click();
  const field = page.getByTestId('conflict-table').getByTestId('conflict-field');
  await expect(field).toHaveCount(1);
  await field.getByLabel('Của bạn: 5').check();
  await page.getByRole('button', { name: 'Áp dụng và đồng bộ' }).click();

  await expect.poll(async () => (await localRecord(page, id))?.syncState).toBe('draft');
  const local = await localRecord(page, id);
  expect(local?.data).toMatchObject({ householdName: '', members: 5 });
  expect(local?.baseVersion).toBe(2);
  expect(await opsOf(page, id)).toHaveLength(0);
  const onServer = await serverRecord(request, id);
  expect(onServer.version).toBe(2);
  expect(onServer.data).toMatchObject({ householdName: name, members: 7 });
});

test('phiếu nháp còn op cũ bị 400: vẫn là Nháp, không thành Lỗi; điền đủ thì đồng bộ', async ({
  page,
  context,
  request,
}) => {
  const name = `Hộ nháp 400 ${crypto.randomUUID().slice(0, 8)}`;
  const id = await pendingThenDraft(page, context, name);
  // Chỉ PUT của phiếu này, để vòng pull không ăn mất lỗi tiêm
  await request.post(FAULTS, { data: { mode: '400', count: 1, match: `/records/${id}` } });

  await context.setOffline(false);
  await expect
    .poll(async () => (await opsOf(page, id)).map((op) => op.status), { timeout: 15_000 })
    .toEqual(['failed']);
  expect((await localRecord(page, id))?.syncState).toBe('draft');
  expect((await serverRecord(request, id)).version).toBe(1);

  await page.goto(`/#/fill/household-survey/${id}`);
  await page.locator('input[name=householdName]').fill(`${name} (đủ)`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect.poll(async () => (await serverRecord(request, id)).version, { timeout: 15_000 }).toBe(2);
  expect((await serverRecord(request, id)).data).toMatchObject({ householdName: `${name} (đủ)`, members: 5 });
  expect((await localRecord(page, id))?.syncState).toBe('synced');
});
