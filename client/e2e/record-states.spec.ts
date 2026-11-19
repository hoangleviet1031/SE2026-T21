import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { API, TOKENS, authHeaders, login, readStore } from './helpers';

// Chuyển trạng thái phiếu theo design §5.1 (việc 10 "Test chuyển trạng thái phiếu", slide L07 s15).
// Bảng dưới gom mọi mũi tên của sơ đồ §5.1 và các đường KHÔNG được đi, mỗi dòng trỏ tới test kiểm nó.
// Ca có sẵn ở file khác thì trỏ tới đó; ca chưa ai kiểm thì viết ngay trong file này (đánh dấu ★).
//
// Đường được phép (sơ đồ §5.1):
// | Từ → sang                  | Khi nào                                  | Test                                                        |
// |----------------------------|------------------------------------------|-------------------------------------------------------------|
// | (mới) → draft              | lưu, chưa hợp lệ                         | draft.spec "O5: lưu thiếu tên chủ hộ thành Nháp…"           |
// | (mới) → pending            | lưu, hợp lệ                              | offline.spec "điền phiếu khi offline…"                      |
// | draft → draft              | sửa, vẫn chưa hợp lệ                     | ★ "Đã đồng bộ → Nháp → Nháp → Chờ đồng bộ…"                 |
// | draft → pending            | sửa thành hợp lệ (tạo op)                | draft.spec "O5…"; ★ cùng ca trên                            |
// | pending → synced           | push 200/201, không còn op               | offline.spec "điền phiếu khi offline…"                      |
// | pending → pending          | lỗi mạng / 5xx (backoff)                 | offline.spec "server lỗi 500 hai lần…"; retry.spec R2, R3   |
// | pending → pending          | người dùng sửa tiếp                      | conflict.spec "C6: sửa ba lần liên tiếp khi offline…"       |
// | pending → pending          | 409, tự gộp được                         | conflict.spec "C1: hai nơi sửa khác trường…"                |
// | pending → conflict         | 409, cùng trường / xoá vs sửa            | conflict.spec ca đầu; delete-conflict.spec C4, C5           |
// | pending → error            | 4xx khác                                 | errors.spec "R5: server trả 400…"                           |
// | synced → pending           | sửa, hợp lệ                              | conflict.spec "C6…"; typing-buffer.spec "phiếu đã đồng bộ…" |
// | synced → draft             | sửa, chưa hợp lệ                         | ★ "Đã đồng bộ → Nháp → Nháp → Chờ đồng bộ…"                 |
// | synced → synced            | pull nhận bản mới hơn                    | ★ "Đã đồng bộ nhận bản mới khi pull…"                       |
// | conflict → pending         | người dùng chọn xong                     | conflict.spec ca đầu; delete-conflict.spec C4, C5           |
// | error → pending            | bấm Thử lại / sửa phiếu                  | errors.spec "R5…", "sửa phiếu đang Lỗi…"                    |
// | error → draft              | sửa thành chưa hợp lệ (code có, sơ đồ chưa vẽ) | draft.spec "phiếu Lỗi sửa thành nháp giữ op failed…" |
//
// Đường bị cấm (không được xảy ra):
// | Đường cấm                                   | Vì sao                               | Test                                               |
// |---------------------------------------------|--------------------------------------|----------------------------------------------------|
// | draft gửi lên server / có op                | dữ liệu chưa qua validate            | draft.spec "O5…"; ★ ca synced → draft              |
// | conflict sửa, xoá được / sinh op            | ADR 0001 quy tắc 7                   | conflict.spec "C7…"; delete.spec "phiếu đang xung đột không xoá được…" |
// | pull ghi đè draft                           | ADR 0001 quy tắc 8                   | conflict.spec "pull không ghi đè phiếu nháp…"      |
// | pull ghi đè pending (còn op chưa gửi)       | ADR 0001 quy tắc 8, bất biến 1       | ★ "pull không ghi đè phiếu Chờ đồng bộ…"           |
// | pull ghi đè error (op failed)               | ADR 0001 quy tắc 8, bất biến 1       | ★ "pull không ghi đè phiếu Lỗi…"                   |
// | pending → error vì lỗi mạng / 5xx           | lỗi tạm thời phải tự thử lại         | offline.spec "server lỗi 500 hai lần…"; ★ ca pull không ghi đè Chờ đồng bộ |
// | error tự gửi lại không cần người bấm        | 4xx gửi lại vẫn hỏng                 | errors.spec "R5…" (hai vòng không PUT)             |
// | op đã gửi bị sửa data / dùng lại opId       | bất biến 3                           | errors.spec "sửa phiếu đang Lỗi…"; draft.spec "phiếu Lỗi sửa thành nháp…" |

const DB = 'field-survey-p-demo-yte';
const FAULTS = 'http://localhost:3001/api/__test/faults';

interface StoredRecord {
  id: string;
  data: Record<string, unknown>;
  baseVersion: number;
  syncState: string;
}

interface StoredOp {
  recordId: string;
  opId: string;
  status: string;
  data: Record<string, unknown>;
}

test.afterEach(async ({ request }) => {
  await request.delete(FAULTS);
});

function recordRow(page: Page, id: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ has: page.locator(`a[href$="/${id}"]`) });
}

/** Tạo một phiếu hợp lệ và chờ nó lên server (version 1). Trả id phiếu. */
async function createSynced(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  const id = new URL(page.url()).hash.split('/').pop() ?? '';
  expect(id).not.toBe('');
  await page.locator('input[name=householdName]').fill(name);
  await page.locator('input[name=members]').fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, id).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  return id;
}

/** Người khác (máy B, tài khoản lan) ghi phiếu trên server. */
async function serverPut(request: APIRequestContext, id: string, baseVersion: number, data: Record<string, unknown>) {
  const res = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion, deleted: false, data },
  });
  expect(res.status()).toBe(200);
}

async function serverRecord(request: APIRequestContext, id: string) {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json();
  return (pulled.records as { id: string; version: number; data: Record<string, unknown> }[]).find((r) => r.id === id);
}

async function localRecord(page: Page, id: string): Promise<StoredRecord | undefined> {
  return ((await readStore(page, DB, 'records')) as StoredRecord[]).find((r) => r.id === id);
}

async function opsOf(page: Page, id: string): Promise<StoredOp[]> {
  return ((await readStore(page, DB, 'outbox')) as StoredOp[]).filter((o) => o.recordId === id);
}

/** Đếm PUT của một phiếu và số vòng pull đã xong (mỗi vòng đồng bộ kết thúc bằng pull). */
function trackRequests(context: BrowserContext, id: string) {
  const counts = { puts: 0, pulls: 0 };
  context.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().endsWith(`/records/${id}`)) counts.puts += 1;
  });
  context.on('requestfinished', (req) => {
    if (req.method() === 'GET' && req.url().includes('/records?since=')) counts.pulls += 1;
  });
  return counts;
}

async function openRecord(page: Page, id: string) {
  // Mở thẳng địa chỉ: tên chủ hộ có thể đang rỗng (nháp) nên link ở trang chủ không mang tên
  await page.goto(`/#/fill/household-survey/${id}`);
  await expect(page.locator('input[name=householdName]')).toBeVisible();
}

async function backHome(page: Page) {
  await page.getByRole('link', { name: 'Khảo sát thực địa' }).click();
}

test('★ Đã đồng bộ → Nháp → Nháp → Chờ đồng bộ → Đã đồng bộ: nháp không có op, server giữ bản cũ tới khi hợp lệ', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = `Hộ trạng thái ${crypto.randomUUID().slice(0, 8)}`;
  const id = await createSynced(page, name);
  const counts = trackRequests(context, id);

  // synced → draft: xoá tên chủ hộ (bắt buộc) rồi Lưu
  await openRecord(page, id);
  await page.locator('input[name=householdName]').fill('');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await backHome(page);
  await expect(recordRow(page, id).getByTestId('sync-state')).toHaveText('Nháp');
  expect((await localRecord(page, id))?.syncState).toBe('draft');
  expect(await opsOf(page, id)).toEqual([]);

  // draft → draft: sửa trường khác, vẫn thiếu tên. Chạy trọn một vòng đồng bộ: không PUT, không op
  await openRecord(page, id);
  await page.locator('input[name=members]').fill('8');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await backHome(page);
  const pullsBefore = counts.pulls;
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect.poll(() => counts.pulls).toBeGreaterThan(pullsBefore);
  await expect(recordRow(page, id).getByTestId('sync-state')).toHaveText('Nháp');
  expect(await opsOf(page, id)).toEqual([]);
  expect(counts.puts).toBe(0);
  // Server vẫn là bản hợp lệ cuối cùng, pull cũng không ghi đè nháp trên máy
  expect(await serverRecord(request, id)).toMatchObject({ version: 1, data: { householdName: name, members: 3 } });
  expect((await localRecord(page, id))?.data).toMatchObject({ members: 8 });

  // draft → pending → synced: điền lại tên thì có op, lên server version 2 với dữ liệu mới
  await openRecord(page, id);
  await page.locator('input[name=householdName]').fill(`${name} (sửa)`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, id).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  expect(counts.puts).toBe(1);
  expect(await opsOf(page, id)).toEqual([]);
  expect(await serverRecord(request, id)).toMatchObject({
    version: 2,
    data: { householdName: `${name} (sửa)`, members: 8 },
  });
});

test('★ Đã đồng bộ nhận bản mới khi pull: vẫn Đã đồng bộ, dữ liệu và version theo server, không sinh op, không PUT', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = `Hộ pull ${crypto.randomUUID().slice(0, 8)}`;
  const id = await createSynced(page, name);
  const counts = trackRequests(context, id);

  await serverPut(request, id, 1, { householdName: name, members: 9, waterSource: 'Mưa' });
  await page.getByRole('button', { name: 'Đồng bộ' }).click();

  await expect.poll(async () => (await localRecord(page, id))?.baseVersion, { timeout: 15_000 }).toBe(2);
  expect(await localRecord(page, id)).toMatchObject({
    syncState: 'synced',
    data: { householdName: name, members: 9, waterSource: 'Mưa' },
  });
  await expect(recordRow(page, id).getByTestId('sync-state')).toHaveText('Đã đồng bộ');
  expect(await opsOf(page, id)).toEqual([]);
  expect(counts.puts).toBe(0);
});

test('★ pull không ghi đè phiếu Chờ đồng bộ: server 500 thì giữ bản trên máy, lỗi tạm không thành Lỗi; hết lỗi thì tự gộp', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = `Hộ chờ ${crypto.randomUUID().slice(0, 8)}`;
  const id = await createSynced(page, name);
  const counts = trackRequests(context, id);

  // Máy B sửa nguồn nước (version 2); máy này sửa số thành viên mà PUT gặp 500 ba lần. Chỉ chặn PUT
  // của phiếu này (match), pull vẫn chạy và mang version 2 về
  await serverPut(request, id, 1, { householdName: name, members: 3, waterSource: 'Mưa' });
  await request.post(FAULTS, { data: { mode: '500', count: 3, match: `/records/${id}` } });
  await openRecord(page, id);
  await page.locator('input[name=members]').fill('7');
  const failed = page.waitForResponse((res) => res.url().endsWith(`/records/${id}`) && res.status() === 500);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await failed;
  // Sau lần PUT hỏng đầu tiên, vòng đó vẫn pull xong: phiếu phải giữ bản trên máy, chưa nhận version 2.
  // Còn 2 lần 500 nữa (backoff ~1 s, ~2 s) nên lúc kiểm phiếu chắc chắn chưa gửi được
  const pullsAtFail = counts.pulls;
  await expect.poll(() => counts.pulls, { timeout: 15_000 }).toBeGreaterThan(pullsAtFail);
  await backHome(page);
  const local = await localRecord(page, id);
  expect(local).toMatchObject({ syncState: 'pending', baseVersion: 1, data: { members: 7 } });
  expect(local?.data.waterSource).toBeUndefined();
  expect((await opsOf(page, id)).map((o) => o.status)).toEqual(['queued']);
  await expect(recordRow(page, id).getByTestId('sync-state')).not.toHaveText('Lỗi');

  // Hết lỗi: lần thử lại nhận 409, hai bên sửa khác trường nên tự gộp, lên version 3 có cả hai thay đổi
  await expect(recordRow(page, id).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 30_000 });
  expect(await serverRecord(request, id)).toMatchObject({
    version: 3,
    data: { householdName: name, members: 7, waterSource: 'Mưa' },
  });
  expect(await opsOf(page, id)).toEqual([]);
});

test('★ pull không ghi đè phiếu Lỗi: op failed giữ nguyên qua các vòng đồng bộ; Thử lại thì tự gộp với bản mới', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = `Hộ lỗi ${crypto.randomUUID().slice(0, 8)}`;
  const id = await createSynced(page, name);
  const counts = trackRequests(context, id);

  await serverPut(request, id, 1, { householdName: name, members: 3, waterSource: 'Mưa' });
  await request.post(FAULTS, { data: { mode: '400', count: 1, match: `/records/${id}` } });
  await openRecord(page, id);
  await page.locator('input[name=members]').fill('7');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await backHome(page);
  await expect(recordRow(page, id).getByTestId('sync-state')).toHaveText('Lỗi', { timeout: 15_000 });
  const failedOp = (await opsOf(page, id))[0];
  expect(failedOp).toMatchObject({ status: 'failed', data: { members: 7 } });

  // Hai vòng đồng bộ trọn vẹn (có pull mang version 2 về): phiếu vẫn Lỗi, giữ bản trên máy, op không đổi
  for (let i = 0; i < 2; i++) {
    const pulls = counts.pulls;
    await page.getByRole('button', { name: 'Đồng bộ' }).click();
    await expect.poll(() => counts.pulls).toBeGreaterThan(pulls);
  }
  expect(await localRecord(page, id)).toMatchObject({ syncState: 'error', baseVersion: 1, data: { members: 7 } });
  expect(await opsOf(page, id)).toEqual([failedOp]);
  expect(counts.puts).toBe(1);

  // error → pending: Thử lại gửi đúng op cũ, nhận 409, tự gộp với bản của máy B
  await recordRow(page, id).getByRole('button', { name: 'Thử lại' }).click();
  await expect(recordRow(page, id).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  expect(await serverRecord(request, id)).toMatchObject({
    version: 3,
    data: { householdName: name, members: 7, waterSource: 'Mưa' },
  });
});
