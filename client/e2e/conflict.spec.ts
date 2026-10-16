import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { API, TOKENS, authHeaders, login, readStore } from './helpers';

test('cùng trường bị sửa ở hai nơi: hiện màn hình conflict, người dùng chọn rồi đồng bộ', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Trần Thị Gốc');
  await page.locator('input[name=members]').fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();

  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Trần Thị' });
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ');
  const id = (await row.getByRole('link').first().getAttribute('href'))!.split('/').pop()!;

  // Máy này offline sửa tên và số thành viên
  await context.setOffline(true);
  await row.getByRole('link').first().click();
  await page.locator('input[name=householdName]').fill('Trần Thị Máy A');
  await page.locator('input[name=members]').fill('5');
  await page.getByRole('button', { name: 'Lưu' }).click();

  // Trong lúc đó người khác sửa tên và nguồn nước trên server
  const other = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: {
      formId: 'household-survey',
      formVersion: 1,
      baseVersion: 1,
      deleted: false,
      data: { householdName: 'Trần Thị Máy B', members: 3, waterSource: 'Giếng' },
    },
  });
  expect(other.status()).toBe(200);

  await context.setOffline(false);
  const conflictBadge = page.getByRole('link', { name: 'Cần xử lý xung đột' });
  await expect(conflictBadge).toBeVisible({ timeout: 15_000 });
  await conflictBadge.click();

  // Tạm hiện userId của người sửa; tên ('Lan') chờ updatedByName (design §6.2)
  await expect(page.getByText('u_lan')).toBeVisible();
  const table = page.getByTestId('conflict-table');
  // Chỉ householdName xung đột; members và waterSource được gộp tự động
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.getByLabel('Trần Thị Máy A').check();
  await page.getByRole('button', { name: 'Áp dụng và đồng bộ' }).click();

  await expect(page.getByTestId('records').getByTestId('sync-state').first()).toHaveText('Đã đồng bộ', {
    timeout: 15_000,
  });
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.lan) })).json();
  const saved = pulled.records.find((r: { id: string }) => r.id === id);
  expect(saved.version).toBe(3);
  expect(saved.data).toMatchObject({ householdName: 'Trần Thị Máy A', members: 5, waterSource: 'Giếng' });
});

// ---- TV2-10: tự gộp, gộp op khi offline, 409 lặp, khoá sửa khi conflict, pull bỏ qua nháp ----
// ADR 0001 quy tắc 5, 7, 8; design §4.5, §5.2, §10.1 C1, C6, C8.

const DB = 'field-survey-p-demo-yte';

interface StoredRecord {
  id: string;
  data: Record<string, unknown>;
  syncState: string;
  baseVersion: number;
}

function recordRow(page: Page, text: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: text });
}

/** Tạo một phiếu và chờ nó lên server (version 1). Trả id phiếu. */
async function createSynced(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.locator('input[name=members]').fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();
  const row = recordRow(page, name);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  return (await row.getByRole('link').first().getAttribute('href'))!.split('/').pop()!;
}

/** Người khác ghi phiếu trên server (đóng vai máy B). */
async function serverPut(request: APIRequestContext, id: string, baseVersion: number, data: Record<string, unknown>) {
  const res = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion, deleted: false, data },
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

async function opsOf(page: Page, id: string): Promise<unknown[]> {
  return ((await readStore(page, DB, 'outbox')) as { recordId: string }[]).filter((o) => o.recordId === id);
}

async function pullCursor(page: Page): Promise<number> {
  const meta = (await readStore(page, DB, 'meta')) as { key: string; value: { cursor: number } }[];
  return meta.find((m) => m.key === 'pull')?.value.cursor ?? 0;
}

/** Đưa phiếu vào `conflict` ở trường householdName như ca trên rồi mở màn hình xung đột. Server ở version 2. */
async function openConflict(page: Page, context: BrowserContext, request: APIRequestContext, name: string) {
  const id = await createSynced(page, name);
  await context.setOffline(true);
  await recordRow(page, name).getByRole('link').first().click();
  await page.locator('input[name=householdName]').fill(`${name} Máy A`);
  await page.locator('input[name=members]').fill('5');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await serverPut(request, id, 1, { householdName: `${name} Máy B`, members: 3, waterSource: 'Giếng' });
  await context.setOffline(false);
  const badge = recordRow(page, name).getByRole('link', { name: 'Cần xử lý xung đột' });
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await badge.click();
  await expect(page.getByTestId('conflict-table').locator('tbody tr')).toHaveCount(1);
  return id;
}

test('C1: hai nơi sửa khác trường thì tự gộp, không hiện xung đột', async ({ page, context, request }) => {
  await login(page);
  const id = await createSynced(page, 'Hộ C1');

  await context.setOffline(true);
  await recordRow(page, 'Hộ C1').getByRole('link').first().click();
  await page.locator('input[name=members]').fill('7');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await serverPut(request, id, 1, { householdName: 'Hộ C1', members: 3, waterSource: 'Mưa' });
  await context.setOffline(false);

  await expect(recordRow(page, 'Hộ C1').getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Cần xử lý xung đột' })).toHaveCount(0);
  const saved = await serverRecord(request, id);
  expect(saved.version).toBe(3);
  expect(saved.data).toMatchObject({ householdName: 'Hộ C1', members: 7, waterSource: 'Mưa' });
});

test('C6: sửa ba lần liên tiếp khi offline thì chỉ một op, version server tăng 1', async ({ page, context, request }) => {
  await login(page);
  const id = await createSynced(page, 'Hộ C6');

  await context.setOffline(true);
  for (const members of ['4', '5', '6']) {
    await recordRow(page, 'Hộ C6').getByRole('link').first().click();
    await page.locator('input[name=members]').fill(members);
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(recordRow(page, 'Hộ C6').getByTestId('sync-state')).toHaveText('Chờ đồng bộ');
  }
  expect(await opsOf(page, id)).toHaveLength(1);

  await context.setOffline(false);
  await expect(recordRow(page, 'Hộ C6').getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const saved = await serverRecord(request, id);
  expect(saved.version).toBe(2);
  expect(saved.data).toMatchObject({ members: 6 });
});

test('C8: server đổi trường khác trong lúc đang chọn ở màn hình xung đột thì tự gộp khi áp dụng', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const id = await openConflict(page, context, request, 'Hộ C8a');

  // Người khác sửa tiếp một trường chưa ai đụng tới (server lên version 3)
  await serverPut(request, id, 2, {
    householdName: 'Hộ C8a Máy B',
    members: 3,
    waterSource: 'Giếng',
    visitDate: '2026-10-16',
  });

  await page.getByTestId('conflict-table').getByLabel('Hộ C8a Máy A').check();
  await page.getByRole('button', { name: 'Áp dụng và đồng bộ' }).click();

  await expect(recordRow(page, 'Hộ C8a').getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const saved = await serverRecord(request, id);
  expect(saved.version).toBe(4);
  expect(saved.data).toMatchObject({
    householdName: 'Hộ C8a Máy A',
    members: 5,
    waterSource: 'Giếng',
    visitDate: '2026-10-16',
  });
});

test('C8: server đổi cùng trường trong lúc đang chọn thì hiện xung đột mới, giữ lựa chọn đã áp dụng', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const id = await openConflict(page, context, request, 'Hộ C8b');

  // Người khác sửa tiếp đúng trường đang xung đột (server lên version 3)
  await serverPut(request, id, 2, { householdName: 'Hộ C8b Máy C', members: 3, waterSource: 'Giếng' });

  await page.getByTestId('conflict-table').getByLabel('Hộ C8b Máy A').check();
  await page.getByRole('button', { name: 'Áp dụng và đồng bộ' }).click();

  const badge = recordRow(page, 'Hộ C8b').getByRole('link', { name: 'Cần xử lý xung đột' });
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await badge.click();
  const table = page.getByTestId('conflict-table');
  // Chỉ trường mới bị đụng; "của bạn" là lựa chọn đã áp dụng, "trên máy chủ" là bản mới nhất
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByLabel('Hộ C8b Máy A')).toBeVisible();
  await expect(table.getByLabel('Hộ C8b Máy C')).toBeVisible();
  // members (máy này sửa 3 → 5) không bị mất
  expect((await localRecord(page, id))?.data).toMatchObject({ householdName: 'Hộ C8b Máy A', members: 5 });
  expect((await serverRecord(request, id)).version).toBe(3);
});

test('phiếu đang xung đột không sửa được: bấm Lưu báo cần xử lý xung đột, không tạo op', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const id = await openConflict(page, context, request, 'Hộ khoá');
  const before = await localRecord(page, id);

  await page.goto(`/#/fill/household-survey/${id}`);
  await page.locator('input[name=householdName]').fill('Hộ khoá sửa thêm');
  await page.getByRole('button', { name: 'Lưu' }).click();

  const notice = page.getByTestId('record-in-conflict');
  await expect(notice).toContainText('Phiếu này cần xử lý xung đột trước');
  await expect(notice.getByRole('link')).toHaveAttribute('href', `#/conflict/${id}`);
  const after = await localRecord(page, id);
  expect(after?.syncState).toBe('conflict');
  expect(after?.data).toEqual(before?.data);
  expect(await opsOf(page, id)).toHaveLength(0);
});

test('pull không ghi đè phiếu nháp (ADR 0001 quy tắc 8)', async ({ page, request }) => {
  await login(page);
  const id = await createSynced(page, 'Hộ nháp');

  // Xoá tên chủ hộ (bắt buộc) thì phiếu thành nháp, ở lại trang
  await recordRow(page, 'Hộ nháp').getByRole('link').first().click();
  await page.locator('input[name=householdName]').fill('');
  await page.locator('input[name=members]').fill('9');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect.poll(async () => (await localRecord(page, id))?.syncState).toBe('draft');

  await serverPut(request, id, 1, { householdName: 'Hộ nháp trên server', members: 1 });
  // Cursor server trả cho minh lúc này đã gồm bản vừa sửa; máy đạt tới cursor đó là pull đã nhận nó
  const latest = (await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json()).cursor;
  // Mở lại app: chạy một vòng đồng bộ
  await page.goto('/');
  await expect.poll(() => pullCursor(page), { timeout: 15_000 }).toBe(latest);

  const local = await localRecord(page, id);
  expect(local?.syncState).toBe('draft');
  expect(local?.data).toMatchObject({ householdName: '', members: 9 });
  expect(local?.baseVersion).toBe(1);
});
