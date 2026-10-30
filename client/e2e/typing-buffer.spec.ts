import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { API, TOKENS, authHeaders, login, makeImage, readStore } from './helpers';

// Bộ đệm chữ đang gõ ở màn hình 4 (design §4.1 "Bộ đệm đang nhập", ui.md màn hình 4; Could, Dương chốt
// 2026-10-30). Chữ chưa bấm Lưu được giữ trong meta `typing:<id>`, mở lại phiếu thì hỏi khôi phục. Tự lưu
// không đổi phiếu, không tạo op (CLAUDE.md bất biến 2, 3).

const DB = 'field-survey-p-demo-yte';

const banner = (page: Page) => page.getByTestId('typing-restore');
const nameInput = (page: Page) => page.locator('input[name=householdName]');
const membersInput = (page: Page) => page.locator('input[name=members]');

function recordRow(page: Page, text: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: text });
}

async function typingBuffer(page: Page, id: string): Promise<{ data: Record<string, unknown> } | undefined> {
  const rows = (await readStore(page, DB, 'meta')) as { key: string; value: { data: Record<string, unknown> } }[];
  return rows.find((r) => r.key === `typing:${id}`)?.value;
}

/** Chờ tự lưu ghi xong bộ đệm có giá trị mong đợi (sau 1 s ngừng gõ) */
async function expectBuffered(page: Page, id: string, field: string, value: unknown) {
  await expect.poll(async () => (await typingBuffer(page, id))?.data[field]).toEqual(value);
}

async function opsOf(page: Page, id: string): Promise<unknown[]> {
  return ((await readStore(page, DB, 'outbox')) as { recordId: string }[]).filter((o) => o.recordId === id);
}

async function localRecord(page: Page, id: string) {
  return ((await readStore(page, DB, 'records')) as { id: string; data: Record<string, unknown>; syncState: string }[]).find(
    (r) => r.id === id,
  );
}

const idFromUrl = (page: Page) => page.url().split('/').pop() ?? '';

/** Tạo một phiếu và chờ nó lên server (version 1). Trả id phiếu. */
async function createSynced(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await nameInput(page).fill(name);
  await membersInput(page).fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();
  const row = recordRow(page, name);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  return (await row.getByRole('link').first().getAttribute('href'))?.split('/').pop() ?? '';
}

/** Người khác ghi phiếu trên server (đóng vai máy B). */
async function serverPut(request: APIRequestContext, id: string, baseVersion: number, data: Record<string, unknown>) {
  const res = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion, deleted: false, data },
  });
  expect(res.status()).toBe(200);
}

async function serverVersion(request: APIRequestContext, id: string) {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.lan) })).json();
  return (pulled.records as { id: string; version: number; data: Record<string, unknown> }[]).find((r) => r.id === id);
}

test('phiếu mới: gõ rồi tải lại thì hỏi, Khôi phục có lại chữ; trong lúc đó không có phiếu, không có op', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await nameInput(page).fill('Hộ đang gõ dở');
  const id = idFromUrl(page);
  await expectBuffered(page, id, 'householdName', 'Hộ đang gõ dở');
  expect(await localRecord(page, id)).toBeUndefined();
  expect(await opsOf(page, id)).toHaveLength(0);

  await page.reload();
  await expect(banner(page)).toHaveText(/Có nội dung đang nhập chưa lưu \(\d\d:\d\d\)\./);
  // Đang hỏi thì khoá form, không có Lưu: gõ tiếp rồi Khôi phục sẽ thay mất phần vừa gõ
  await expect(nameInput(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Lưu' })).toHaveCount(0);
  await expect(nameInput(page)).toHaveValue('');

  await banner(page).getByRole('button', { name: 'Khôi phục' }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(nameInput(page)).toHaveValue('Hộ đang gõ dở');
  await expect(nameInput(page)).toBeEnabled();
  expect(await localRecord(page, id)).toBeUndefined();
  expect(await opsOf(page, id)).toHaveLength(0);
});

test('phiếu đã đồng bộ: sửa, tải lại, Khôi phục rồi Lưu thì lên server đúng một lần, bộ đệm mất', async ({
  page,
  request,
}) => {
  await login(page);
  const id = await createSynced(page, 'Hộ sửa dở');
  await recordRow(page, 'Hộ sửa dở').getByTestId('record-title').click();
  await membersInput(page).fill('7');
  await expectBuffered(page, id, 'members', 7);
  // Tự lưu không đổi phiếu, không tạo op
  expect((await localRecord(page, id))?.syncState).toBe('synced');
  expect(await opsOf(page, id)).toHaveLength(0);

  await page.reload();
  await banner(page).getByRole('button', { name: 'Khôi phục' }).click();
  await expect(membersInput(page)).toHaveValue('7');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, 'Hộ sửa dở').getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  expect(await serverVersion(request, id)).toMatchObject({ version: 2, data: { members: 7 } });
  expect(await typingBuffer(page, id)).toBeUndefined();
});

test('← Quay lại vẫn giữ chữ đang gõ; mở lại bấm Bỏ thì về bản phiếu và không hỏi nữa', async ({ page }) => {
  await login(page);
  const id = await createSynced(page, 'Hộ bỏ dở');
  await recordRow(page, 'Hộ bỏ dở').getByTestId('record-title').click();
  await membersInput(page).fill('9');
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expectBuffered(page, id, 'members', 9);

  await recordRow(page, 'Hộ bỏ dở').getByTestId('record-title').click();
  await expect(banner(page)).toBeVisible();
  await banner(page).getByRole('button', { name: 'Bỏ' }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(membersInput(page)).toHaveValue('3');
  await expect.poll(() => typingBuffer(page, id)).toBeUndefined();

  await page.reload();
  await expect(nameInput(page)).toHaveValue('Hộ bỏ dở');
  await expect(banner(page)).toHaveCount(0);
});

test('phiếu bị sửa ở máy khác trong lúc gõ: trường chỉ mình sửa được khôi phục, trường cùng sửa giữ bản mới và báo', async ({
  page,
  request,
}) => {
  await login(page);
  const id = await createSynced(page, 'Hộ gộp dở');
  await recordRow(page, 'Hộ gộp dở').getByTestId('record-title').click();
  await nameInput(page).fill('Hộ gộp dở máy này');
  await membersInput(page).fill('5');
  await expectBuffered(page, id, 'members', 5);

  // Máy B sửa cùng trường tên và thêm nguồn nước; máy này kéo bản mới về (phiếu không có op nên pull ghi)
  await serverPut(request, id, 1, { householdName: 'Hộ gộp dở máy B', members: 3, waterSource: 'Giếng' });
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect.poll(async () => (await localRecord(page, id))?.data.householdName).toBe('Hộ gộp dở máy B');

  await page.reload();
  await banner(page).getByRole('button', { name: 'Khôi phục' }).click();
  await expect(nameInput(page)).toHaveValue('Hộ gộp dở máy B');
  await expect(membersInput(page)).toHaveValue('5');
  await expect(page.locator('select[name=waterSource]')).toHaveValue('Giếng');
  const kept = page.getByTestId('typing-kept');
  await expect(kept).toContainText('Đã khôi phục. Trường sau đã được sửa ở nơi khác nên giữ bản mới, nhập lại nếu cần:');
  await expect(kept.getByRole('listitem')).toHaveText(['Tên chủ hộ: bạn đã nhập "Hộ gộp dở máy này"']);
  await kept.getByRole('button', { name: 'Đóng' }).click();
  await expect(kept).toHaveCount(0);
  expect(await opsOf(page, id)).toHaveLength(0);
});

test('phiếu đang xung đột (chỉ đọc) không ghi bộ đệm', async ({ page, context, request }) => {
  await login(page);
  const id = await createSynced(page, 'Hộ xung đột dở');
  await goConflict(page, context, request, id, 'Hộ xung đột dở');

  await page.goto(`/#/fill/household-survey/${id}`);
  await expect(page.getByTestId('record-in-conflict')).toBeVisible();
  await expect(nameInput(page)).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('record-in-conflict')).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  expect(await typingBuffer(page, id)).toBeUndefined();
});

test('ảnh đã chọn chưa Lưu: tải lại, Khôi phục thì ảnh vẫn còn', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await nameInput(page).fill('Hộ ảnh dở');
  const image = await makeImage(page, { width: 400, height: 300, type: 'image/jpeg', quality: 0.9 });
  await page.getByTestId('photo-input-housePhoto').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(page.getByTestId('photo-thumb')).toHaveCount(1);
  const id = idFromUrl(page);
  await expect.poll(async () => ((await typingBuffer(page, id))?.data.housePhoto as string[] | undefined)?.length).toBe(1);

  await page.reload();
  await expect(page.getByTestId('photo-thumb')).toHaveCount(0);
  await banner(page).getByRole('button', { name: 'Khôi phục' }).click();
  await expect(page.getByTestId('photo-thumb')).toHaveCount(1);
  await expect(nameInput(page)).toHaveValue('Hộ ảnh dở');
});

/** Máy này sửa tên khi offline và Lưu, máy B sửa cùng trường trên server: phiếu thành `conflict`. */
async function goConflict(page: Page, context: BrowserContext, request: APIRequestContext, id: string, name: string) {
  await context.setOffline(true);
  await recordRow(page, name).getByTestId('record-title').click();
  await nameInput(page).fill(`${name} máy A`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await serverPut(request, id, 1, { householdName: `${name} máy B`, members: 3 });
  await context.setOffline(false);
  await expect(recordRow(page, name).getByRole('link', { name: 'Cần xử lý xung đột' })).toBeVisible({ timeout: 15_000 });
}
