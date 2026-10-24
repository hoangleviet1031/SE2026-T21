import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { API, PROJECT, TOKENS, authHeaders, login, readStore } from './helpers';

// Xoá vs sửa (design §4.5, ADR 0001 quy tắc 6, ticket TV3-08): luôn hỏi người dùng, không chọn sẵn,
// nút Áp dụng khoá tới khi trả lời. C4: máy xoá, server sửa. C5: máy sửa, server xoá.

const DB = `field-survey-p-${PROJECT}`;
const APPLY = 'Áp dụng và đồng bộ';

function recordRow(page: Page, name: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
}

/** Tạo phiếu và chờ lên server (version 1). Trả id phiếu. */
async function createSynced(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.locator('input[name=members]').fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();
  const row = recordRow(page, name);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const href = await row.getByRole('link').first().getAttribute('href');
  return href?.split('/').pop() ?? '';
}

/** Lan (supervisor) ghi phiếu trên server, đóng vai máy kia. */
async function lanPut(request: APIRequestContext, id: string, body: { deleted: boolean; data: object }) {
  const res = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 1, ...body },
  });
  expect(res.status()).toBe(200);
}

async function serverRecord(request: APIRequestContext, id: string) {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.lan) })).json();
  return pulled.records.find((r: { id: string }) => r.id === id) as {
    version: number;
    deleted: boolean;
    data: Record<string, unknown>;
  };
}

async function localRecord(page: Page, id: string) {
  return ((await readStore(page, DB, 'records')) as { id: string }[]).find((r) => r.id === id);
}

/** C4: máy này xoá phiếu khi offline, Lan sửa trên server, có mạng lại thì thành xung đột. */
async function localDeleteRemoteEdit(page: Page, context: BrowserContext, request: APIRequestContext, name: string) {
  await login(page);
  const id = await createSynced(page, name);
  await context.setOffline(true);
  await recordRow(page, name).getByRole('link').first().click();
  await page.getByRole('button', { name: 'Xoá phiếu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá', exact: true }).click();
  await lanPut(request, id, { deleted: false, data: { householdName: name, members: 8 } });
  await context.setOffline(false);
  return id;
}

/** C5: máy này sửa khi offline, Lan xoá phiếu trên server, có mạng lại thì thành xung đột. */
async function localEditRemoteDelete(page: Page, context: BrowserContext, request: APIRequestContext, name: string) {
  await login(page);
  const id = await createSynced(page, name);
  await context.setOffline(true);
  await recordRow(page, name).getByRole('link').first().click();
  await page.locator('input[name=members]').fill('5');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await lanPut(request, id, { deleted: true, data: { householdName: name, members: 3 } });
  await context.setOffline(false);
  return id;
}

/** Mở màn hình xung đột từ danh sách, kiểm câu hỏi và Áp dụng đang khoá vì chưa trả lời. */
async function openDialog(page: Page, name: string, question: RegExp) {
  const badge = recordRow(page, name).getByRole('link', { name: 'Cần xử lý xung đột' });
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await badge.click();
  const dialog = page.getByTestId('delete-conflict');
  await expect(dialog).toContainText(question);
  await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: APPLY })).toBeDisabled();
  // Câu hỏi đã nói rõ giữ bản nào: không có thẻ chọn từng trường
  await expect(page.getByTestId('conflict-field')).toHaveCount(0);
  // Không dùng bản gộp nên không báo "N trường đã được gộp tự động" (TV1-12 b2)
  await expect(page.getByTestId('conflict-explain')).not.toContainText('gộp');
  return dialog;
}

test('C4: máy xoá, server sửa; chọn "Giữ phiếu" thì server có phiếu chưa xoá với bản của Lan', async ({
  page,
  context,
  request,
}) => {
  const name = `Hộ C4 giữ ${Date.now()}`;
  const id = await localDeleteRemoteEdit(page, context, request, name);
  const dialog = await openDialog(page, name, /Bạn đã xoá phiếu này nhưng lan vừa sửa nó\. Giữ phiếu \(với bản của lan\) hay vẫn xoá\?/);

  await dialog.getByRole('radio', { name: 'Giữ phiếu (với bản của lan)' }).check();
  await expect(page.getByRole('button', { name: APPLY })).toBeEnabled();
  await page.getByRole('button', { name: APPLY }).click();

  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const saved = await serverRecord(request, id);
  expect(saved).toMatchObject({ version: 3, deleted: false, data: { householdName: name, members: 8 } });
});

test('C4: máy xoá, server sửa; chọn "Vẫn xoá" thì server deleted: true, phiếu biến khỏi máy', async ({
  page,
  context,
  request,
}) => {
  const name = `Hộ C4 xoá ${Date.now()}`;
  const id = await localDeleteRemoteEdit(page, context, request, name);
  const dialog = await openDialog(page, name, /Bạn đã xoá phiếu này nhưng lan vừa sửa nó/);

  await dialog.getByRole('radio', { name: 'Vẫn xoá' }).check();
  await page.getByRole('button', { name: APPLY }).click();

  await expect.poll(async () => (await serverRecord(request, id)).deleted, { timeout: 15_000 }).toBe(true);
  // Tombstone mang bản mới nhất của Lan, không ghi đè phần Lan vừa sửa
  expect((await serverRecord(request, id)).data).toMatchObject({ members: 8 });
  await expect.poll(async () => localRecord(page, id), { timeout: 15_000 }).toBeUndefined();
});

test('C5: máy sửa, server xoá; chọn "Khôi phục" thì server có phiếu chưa xoá với bản của mình', async ({
  page,
  context,
  request,
}) => {
  const name = `Hộ C5 khôi phục ${Date.now()}`;
  const id = await localEditRemoteDelete(page, context, request, name);
  const dialog = await openDialog(page, name, /lan đã xoá phiếu này nhưng bạn vừa sửa\. Khôi phục với bản của bạn hay bỏ\?/);

  await dialog.getByRole('radio', { name: 'Khôi phục với bản của bạn' }).check();
  await page.getByRole('button', { name: APPLY }).click();

  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const saved = await serverRecord(request, id);
  expect(saved).toMatchObject({ version: 3, deleted: false, data: { householdName: name, members: 5 } });
});

test('C5: máy sửa, server xoá; chọn "Bỏ" thì phiếu vẫn bị xoá, biến khỏi máy', async ({ page, context, request }) => {
  const name = `Hộ C5 bỏ ${Date.now()}`;
  const id = await localEditRemoteDelete(page, context, request, name);
  const dialog = await openDialog(page, name, /lan đã xoá phiếu này nhưng bạn vừa sửa/);

  await dialog.getByRole('radio', { name: 'Bỏ' }).check();
  await page.getByRole('button', { name: APPLY }).click();

  await expect.poll(async () => localRecord(page, id), { timeout: 15_000 }).toBeUndefined();
  expect((await serverRecord(request, id)).deleted).toBe(true);
});
