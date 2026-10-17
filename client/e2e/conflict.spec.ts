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
  await expect(table.getByTestId('conflict-field')).toHaveCount(1);
  // Nhãn trường lấy từ form thay cho id (TV3-07)
  await expect(table.getByTestId('conflict-field')).toContainText('Tên chủ hộ');
  await expect(page.getByTestId('auto-merged')).toContainText('Đã gộp tự động (2 trường)');
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
  await expect(page.getByTestId('conflict-table').getByTestId('conflict-field')).toHaveCount(1);
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
  await expect(table.getByTestId('conflict-field')).toHaveCount(1);
  await expect(table.getByLabel('Hộ C8b Máy A')).toBeVisible();
  await expect(table.getByLabel('Hộ C8b Máy C')).toBeVisible();
  // members (máy này sửa 3 → 5) không bị mất
  expect((await localRecord(page, id))?.data).toMatchObject({ householdName: 'Hộ C8b Máy A', members: 5 });
  expect((await serverRecord(request, id)).version).toBe(3);
});

test('C7: phiếu đang xung đột mở ra chỉ đọc: có banner, không có Lưu/Xoá, không tạo op', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const id = await openConflict(page, context, request, 'Hộ khoá');
  const before = await localRecord(page, id);

  await page.goto(`/#/fill/household-survey/${id}`);
  const notice = page.getByTestId('record-in-conflict');
  await expect(notice).toContainText('Phiếu này cần xử lý xung đột trước');
  await expect(notice.getByRole('link', { name: 'Xử lý' })).toHaveAttribute('href', `#/conflict/${id}`);
  await expect(page.getByRole('button', { name: 'Lưu' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xoá phiếu' })).toHaveCount(0);
  await expect(page.locator('input[name=householdName]')).toBeDisabled();
  await expect(page.getByTestId('photo-input-housePhoto')).toBeDisabled();

  await notice.getByRole('link', { name: 'Xử lý' }).click();
  await expect(page.getByRole('heading', { name: 'Xử lý xung đột' })).toBeVisible();
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

// ---- TV3-07: "Gộp cả hai", bộ lọc "Cần xử lý" (design §4.5, §4.8; ui.md màn hình 3) ----

test('multiselect hai bên thêm khác nhau: "Gộp cả hai" thì server có hợp hai tập', async ({ page, context, request }) => {
  await login(page);
  const id = await createSynced(page, 'Hộ gộp');
  await serverPut(request, id, 1, { householdName: 'Hộ gộp', members: 3, assets: ['Xe máy'] });
  // Kéo bản có Xe máy về máy rồi mới sửa offline
  await page.reload();
  await expect.poll(async () => (await localRecord(page, id))?.baseVersion, { timeout: 15_000 }).toBe(2);

  await context.setOffline(true);
  await recordRow(page, 'Hộ gộp').getByRole('link').first().click();
  await page.getByRole('checkbox', { name: 'Tivi', exact: true }).check();
  await page.getByRole('button', { name: 'Lưu' }).click();
  await serverPut(request, id, 2, { householdName: 'Hộ gộp', members: 3, assets: ['Xe máy', 'Tủ lạnh'] });
  await context.setOffline(false);

  const badge = recordRow(page, 'Hộ gộp').getByRole('link', { name: 'Cần xử lý xung đột' });
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await badge.click();
  const card = page.getByTestId('conflict-field').filter({ hasText: 'Tài sản' });
  await expect(card).toContainText('Gộp cả hai: Xe máy; Tivi; Tủ lạnh');
  await card.getByLabel('Gộp cả hai').check();
  await page.getByRole('button', { name: 'Áp dụng và đồng bộ' }).click();

  await expect(recordRow(page, 'Hộ gộp').getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const saved = await serverRecord(request, id);
  expect([...(saved.data.assets as string[])].sort()).toEqual(['Tivi', 'Tủ lạnh', 'Xe máy']);
});

test('số "Cần xử lý" đầu trang và bộ lọc chỉ hiện phiếu cần xử lý', async ({ page, context, request }) => {
  await login(page);
  await createSynced(page, 'Hộ lọc yên');
  await openConflict(page, context, request, 'Hộ lọc xung đột');
  await page.getByRole('link', { name: '← Quay lại' }).click();

  await expect(page.getByTestId('needs-attention')).toHaveText('Cần xử lý (1)');
  await page.getByTestId('needs-attention').click();
  await expect(page.getByRole('radio', { name: 'Cần xử lý' })).toBeChecked();
  await expect(page.getByTestId('records').getByRole('listitem')).toHaveCount(1);
  await expect(recordRow(page, 'Hộ lọc xung đột')).toHaveCount(1);
  await expect(recordRow(page, 'Hộ lọc yên')).toHaveCount(0);

  await page.getByRole('radio', { name: 'Tất cả' }).check();
  await expect(recordRow(page, 'Hộ lọc yên')).toHaveCount(1);
});

test('xoá vs sửa: phiếu hiện ở "Cần xử lý", màn hình xung đột khoá Áp dụng, không tự chọn hộ', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const id = await createSynced(page, 'Hộ xoá sửa');
  await context.setOffline(true);
  await recordRow(page, 'Hộ xoá sửa').getByRole('link').first().click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Xoá phiếu' }).click();
  await serverPut(request, id, 1, { householdName: 'Hộ xoá sửa', members: 8 });
  await context.setOffline(false);

  // Phiếu đã xoá ở máy này nhưng đang xung đột: vẫn hiện để người dùng xử lý
  const badge = recordRow(page, 'Hộ xoá sửa').getByRole('link', { name: 'Cần xử lý xung đột' });
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await badge.click();
  await expect(page.getByTestId('record-level-conflict')).toContainText('bị xoá ở một nơi và được sửa ở nơi khác');
  await expect(page.getByRole('button', { name: 'Áp dụng và đồng bộ' })).toBeDisabled();

  const local = await localRecord(page, id);
  expect(local?.syncState).toBe('conflict');
  expect(await opsOf(page, id)).toHaveLength(0);
  expect((await serverRecord(request, id)).data).toMatchObject({ members: 8 });
});
