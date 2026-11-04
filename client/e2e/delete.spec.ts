import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, PROJECT, TOKENS, authHeaders, login, putRow, readStore } from './helpers';

// Xoá phiếu (design §5.7, TV2-13): chưa thể tới server thì xoá hẳn trên máy; có thể đã tới server
// thì xoá mềm, gửi op xoá, server xác nhận xong mới xoá khỏi máy. Ca O7, O8 ở §10.1.
// Hộp xác nhận là ConfirmDialog trong app (TV1-13), không phải confirm() của trình duyệt.

const DB = `field-survey-p-${PROJECT}`;
const FAULTS = 'http://localhost:3001/api/__test/faults';
// Ảnh PNG 1×1, đủ để đi qua bước nén và vào bảng attachments
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface StoredRecord {
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  syncState: string;
}
interface StoredOp {
  recordId: string;
  data: Record<string, unknown>;
  deleted: boolean;
  attempts: number;
}

const records = async (page: Page) => (await readStore(page, DB, 'records')) as StoredRecord[];
const ops = async (page: Page, id: string) =>
  ((await readStore(page, DB, 'outbox')) as StoredOp[]).filter((o) => o.recordId === id);
const photos = async (page: Page, id: string) =>
  ((await readStore(page, DB, 'attachments')) as { recordId: string }[]).filter((a) => a.recordId === id);

/** Tên phiếu riêng cho mỗi lần chạy: cùng tài khoản minh nên phiếu của lần chạy trước cũng được pull về. */
const uniq = (name: string) => `${name} ${crypto.randomUUID().slice(0, 8)}`;

function recordRow(page: Page, text: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: text });
}

/** Tạo phiếu có tên và một ảnh, bấm Lưu. Trả id phiếu (đọc từ link trong danh sách). */
async function createWithPhoto(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByTestId('photo-input-housePhoto').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(page.getByTestId('photo-thumb')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const link = recordRow(page, name).getByRole('link').first();
  await expect(link).toBeVisible();
  return (await link.getAttribute('href'))!.split('/').pop()!;
}

const CONFIRM_TEXT = 'Xoá phiếu này? Không hoàn tác được trên máy.';

/**
 * Bấm "Xoá phiếu" rồi trả lời hộp xác nhận trong app (ConfirmDialog). Kiểm câu chữ trước khi trả lời;
 * trả lời xong thì hộp phải đóng.
 */
async function clickDelete(page: Page, answer: 'accept' | 'dismiss' = 'accept') {
  await page.getByRole('button', { name: 'Xoá phiếu' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(CONFIRM_TEXT, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: answer === 'accept' ? 'Xoá' : 'Huỷ', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function deleteFromForm(page: Page, name: string) {
  await recordRow(page, name).getByRole('link').first().click();
  await clickDelete(page);
}

async function serverRecord(request: APIRequestContext, id: string) {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.lan) })).json();
  return pulled.records.find((r: { id: string }) => r.id === id) as
    | { version: number; deleted: boolean; data: Record<string, unknown> }
    | undefined;
}

/** Ghi lại mọi request tới API phiếu có chứa id này. */
function watchRequests(page: Page, id: string): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes(id)) seen.push(`${r.method()} ${r.url()}`);
  });
  return seen;
}

test('O7: xoá phiếu chưa từng gửi thì phiếu, op, ảnh biến khỏi máy; online lên không có request nào', async ({
  page,
  context,
}) => {
  await login(page);
  const keepName = uniq('Hộ O7 giữ lại');
  const name = uniq('Hộ O7 xoá');
  // Chờ vòng đồng bộ đầu tải biểu mẫu về rồi mới ngắt mạng
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await context.setOffline(true);
  // Phiếu khác có ảnh, để kiểm việc xoá không đụng tới nó
  const otherId = await createWithPhoto(page, keepName);
  const id = await createWithPhoto(page, name);
  expect(await ops(page, id)).toHaveLength(1);
  expect(await photos(page, id)).toHaveLength(1);
  const seen = watchRequests(page, id);

  await deleteFromForm(page, name);

  await expect(recordRow(page, name)).toHaveCount(0);
  expect((await records(page)).find((r) => r.id === id)).toBeUndefined();
  expect(await ops(page, id)).toHaveLength(0);
  expect(await photos(page, id)).toHaveLength(0);
  // Phiếu khác còn nguyên
  expect((await records(page)).find((r) => r.id === otherId)).toBeDefined();
  expect(await photos(page, otherId)).toHaveLength(1);

  await context.setOffline(false);
  await expect(recordRow(page, keepName).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  expect(seen).toEqual([]);
});

test('O7: bấm Huỷ ở hộp xác nhận thì phiếu, op, ảnh còn nguyên, ở lại trang phiếu', async ({ page, context }) => {
  await login(page);
  const name = uniq('Hộ O7 huỷ');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await context.setOffline(true);
  const id = await createWithPhoto(page, name);
  const before = (await records(page)).find((r) => r.id === id);

  await recordRow(page, name).getByRole('link').first().click();
  await clickDelete(page, 'dismiss');
  // Esc cũng là Huỷ
  await page.getByRole('button', { name: 'Xoá phiếu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Xoá phiếu' })).toBeVisible();
  expect((await records(page)).find((r) => r.id === id)).toEqual(before);
  expect(await ops(page, id)).toHaveLength(1);
  expect(await photos(page, id)).toHaveLength(1);
});

test('N18: Huỷ hoặc Esc ở hộp Xoá phiếu thì con trỏ về lại nút Xoá phiếu, không rơi về đầu trang', async ({ page }) => {
  await login(page);
  const name = uniq('Hộ N18');
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await recordRow(page, name).getByRole('link').first().click();

  // Mở hộp bằng bàn phím như người dùng không có chuột
  const del = page.getByRole('button', { name: 'Xoá phiếu' });
  await del.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Huỷ' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(del).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(del).toBeFocused();
});

test('O8: xoá phiếu đã đồng bộ thì server có tombstone, máy xoá phiếu và ảnh sau khi server xác nhận', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const keepName = uniq('Hộ O8 giữ lại');
  const name = uniq('Hộ O8 xoá');
  const otherId = await createWithPhoto(page, keepName);
  const id = await createWithPhoto(page, name);
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  // Xoá khi offline để thấy trạng thái giữa: phiếu ẩn khỏi danh sách nhưng còn trên máy, chờ gửi
  await context.setOffline(true);
  await deleteFromForm(page, name);
  await expect(recordRow(page, name)).toHaveCount(0);
  const pending = (await records(page)).find((r) => r.id === id);
  expect(pending).toMatchObject({ deleted: true, syncState: 'pending' });
  expect(await ops(page, id)).toMatchObject([{ deleted: true, attempts: 0 }]);

  await context.setOffline(false);
  await expect.poll(async () => (await records(page)).some((r) => r.id === id), { timeout: 15_000 }).toBe(false);
  expect(await ops(page, id)).toHaveLength(0);
  expect(await photos(page, id)).toHaveLength(0);

  // Máy khác (lan, giám sát viên) pull thấy tombstone
  const saved = await serverRecord(request, id);
  expect(saved).toMatchObject({ version: 2, deleted: true, data: { householdName: name } });

  // Vòng đồng bộ sau (pull nhận lại tombstone của chính phiếu này) không đưa phiếu trở lại máy
  await page.reload();
  await expect(recordRow(page, keepName).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const cursor = (await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json()).cursor;
  await expect
    .poll(async () => {
      const meta = (await readStore(page, DB, 'meta')) as { key: string; value: { cursor: number } }[];
      return meta.find((m) => m.key === 'pull')?.value.cursor;
    }, { timeout: 15_000 })
    .toBe(cursor);
  expect((await records(page)).some((r) => r.id === id)).toBe(false);
  expect((await records(page)).find((r) => r.id === otherId)).toBeDefined();
  expect(await photos(page, otherId)).toHaveLength(1);
});

test('server đã ghi nhưng mất response (op đã gửi, baseVersion 0): xoá mềm, server kết thúc với tombstone', async ({
  page,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ mất response');
  // Chờ vòng đồng bộ đầu tải biểu mẫu xong: lỗi tiêm cũng cắt request pull nên bật sớm thì form không về
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  // Mọi request phiếu đều bị cắt sau khi server ghi: op giữ attempts ≥ 1, phiếu vẫn baseVersion 0
  await request.post(FAULTS, { data: { mode: 'drop', count: 100 } });
  try {
    const id = await createWithPhoto(page, name);
    await expect.poll(async () => (await ops(page, id))[0]?.attempts ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);

    await deleteFromForm(page, name);
    await expect(recordRow(page, name)).toHaveCount(0);
    // Không được xoá hẳn: server có thể đã có phiếu. Op đã gửi giữ nguyên, op xoá thêm phía sau.
    expect((await records(page)).find((r) => r.id === id)).toMatchObject({ deleted: true });
    const queued = await ops(page, id);
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({ deleted: false });
    expect(queued[1]).toMatchObject({ deleted: true, attempts: 0 });

    await request.delete(FAULTS);
    await expect.poll(async () => (await serverRecord(request, id))?.deleted, { timeout: 20_000 }).toBe(true);
    await expect.poll(async () => (await records(page)).some((r) => r.id === id), { timeout: 15_000 }).toBe(false);
    expect(await photos(page, id)).toHaveLength(0);
  } finally {
    await request.delete(FAULTS);
  }
});

test('xoá phiếu đang là nháp: op xoá mang dữ liệu hợp lệ cuối cùng, không mang dữ liệu nháp', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ nháp xoá');
  const id = await createWithPhoto(page, name);
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  await context.setOffline(true);
  await recordRow(page, name).getByRole('link').first().click();
  // Xoá tên chủ hộ (bắt buộc): lưu thành nháp, ở lại trang
  await page.locator('input[name=householdName]').fill('');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await clickDelete(page);

  expect(await ops(page, id)).toMatchObject([{ deleted: true, data: { householdName: name } }]);
  expect((await records(page)).find((r) => r.id === id)).toMatchObject({
    deleted: true,
    syncState: 'pending',
    data: { householdName: name },
  });

  const bodies: unknown[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes(id)) bodies.push(r.postDataJSON());
  });
  await context.setOffline(false);
  await expect.poll(async () => (await serverRecord(request, id))?.deleted, { timeout: 15_000 }).toBe(true);
  expect(bodies).toMatchObject([{ deleted: true, data: { householdName: name } }]);
});

test('phiếu đang xung đột không xoá được: không có nút Xoá, có banner, phiếu và outbox không đổi', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ xung đột');
  const id = await createWithPhoto(page, name);
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  await context.setOffline(true);
  await recordRow(page, name).getByRole('link').first().click();
  await page.locator('input[name=householdName]').fill(`${name} Máy A`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const photoIds = (await records(page)).find((r) => r.id === id)?.data.housePhoto;
  const put = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: {
      formId: 'household-survey',
      formVersion: 1,
      baseVersion: 1,
      deleted: false,
      data: { householdName: `${name} Máy B`, housePhoto: photoIds },
    },
  });
  expect(put.status()).toBe(200);
  await context.setOffline(false);
  await expect(recordRow(page, name).getByRole('link', { name: 'Cần xử lý xung đột' })).toBeVisible({
    timeout: 15_000,
  });
  const before = (await records(page)).find((r) => r.id === id);

  await page.goto(`/#/fill/household-survey/${id}`);
  await expect(page.getByTestId('record-in-conflict')).toContainText('Phiếu này cần xử lý xung đột trước');
  await expect(page.getByRole('button', { name: 'Xoá phiếu' })).toHaveCount(0);
  expect((await records(page)).find((r) => r.id === id)).toEqual(before);
  expect(await ops(page, id)).toHaveLength(0);
  expect(await photos(page, id)).toHaveLength(1);
});

test('hộp xác nhận xoá đang mở thì phiếu thành xung đột: hộp đóng, hết xung đột cũng không tự hiện lại', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ hộp xoá');
  const id = await createWithPhoto(page, name);
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  // Máy A sửa offline; người khác sửa trên server cùng lúc
  await context.setOffline(true);
  await recordRow(page, name).getByRole('link').first().click();
  await page.locator('input[name=householdName]').fill(`${name} Máy A`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const photoIds = (await records(page)).find((r) => r.id === id)?.data.housePhoto;
  const put = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: {
      formId: 'household-survey',
      formVersion: 1,
      baseVersion: 1,
      deleted: false,
      data: { householdName: `${name} Máy B`, housePhoto: photoIds },
    },
  });
  expect(put.status()).toBe(200);

  // Đang mở hộp xoá thì có mạng lại, vòng đồng bộ biến phiếu thành conflict
  await page.goto(`/#/fill/household-survey/${id}`);
  await page.getByRole('button', { name: 'Xoá phiếu' }).click();
  await expect(page.getByRole('dialog')).toContainText(CONFIRM_TEXT);
  await context.setOffline(false);
  await expect(page.getByTestId('record-in-conflict')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Tab khác xử lý xung đột: trang phiếu hết chỉ đọc, hộp xoá không tự hiện lại
  const other = await context.newPage();
  await other.goto(`/#/conflict/${id}`);
  await other.getByTestId('conflict-table').getByLabel(`${name} Máy A`).check();
  await other.getByRole('button', { name: 'Áp dụng và đồng bộ' }).click();
  await expect(page.getByTestId('record-in-conflict')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Xoá phiếu' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// Mở lại phiếu đã xoá (design §5.7, ca O10): phiếu còn trên máy thì form khoá, không có Lưu và Xoá, để không
// ai bỏ xoá mà không được hỏi (bất biến 1). Xung đột xoá vs sửa vẫn đi đường riêng (delete-conflict.spec.ts).
const DELETED_TEXT = 'Phiếu này đã bị xoá nên không sửa được nữa.';
const nameField = (page: Page) => page.locator('input[name=householdName]');
const fillUrl = (id: string) => `/#/fill/household-survey/${id}`;

/** Phiếu đã xoá mở ra đúng dạng khoá. Chờ ô nhập hiện trước để "không có Lưu" không qua chỉ vì trang chưa vẽ. */
async function expectLocked(page: Page) {
  await expect(nameField(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xoá phiếu' })).toHaveCount(0);
  await expect(page.getByTestId('record-deleted')).toHaveText(DELETED_TEXT);
  await expect(nameField(page)).toBeDisabled();
  await expect(page.getByRole('link', { name: '← Quay lại' })).toBeVisible();
}

/** Xoá rồi chờ về hẳn danh sách: hộp đóng trước khi xoá xong, đi tiếp ngay thì `navigate` kéo trang về lại danh sách. */
async function deleteAndGoHome(page: Page, name: string) {
  await deleteFromForm(page, name);
  await expect(page.getByRole('button', { name: 'Tạo phiếu mới' })).toBeVisible();
  await expect(recordRow(page, name)).toHaveCount(0);
}

async function createSyncedWithPhoto(page: Page, name: string): Promise<string> {
  const id = await createWithPhoto(page, name);
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  return id;
}

test('O10: xoá khi offline rồi bấm Back thì về danh sách, không về lại phiếu', async ({ page, context }) => {
  await login(page);
  const name = uniq('Hộ O10 back offline');
  const id = await createSyncedWithPhoto(page, name);
  await context.setOffline(true);
  await deleteAndGoHome(page, name);

  await page.goBack();
  await expect(page).not.toHaveURL(new RegExp(id));
  await expect(page.getByRole('button', { name: 'Tạo phiếu mới' })).toBeVisible();
});

test('O10: xoá khi online, op đã xác nhận, bấm Back không ra form trống dưới id cũ', async ({ page }) => {
  await login(page);
  const name = uniq('Hộ O10 back online');
  const id = await createSyncedWithPhoto(page, name);
  await deleteAndGoHome(page, name);
  await expect.poll(async () => (await records(page)).some((r) => r.id === id), { timeout: 15_000 }).toBe(false);

  await page.goBack();
  await expect(page).not.toHaveURL(new RegExp(id));
  await expect(page.getByRole('button', { name: 'Lưu' })).toHaveCount(0);
});

test('O10: op xoá còn chờ gửi, mở lại địa chỉ cũ thì form khoá; phiếu và op không đổi, online thì xoá như thường', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ O10 chờ gửi');
  const id = await createSyncedWithPhoto(page, name);
  await context.setOffline(true);
  await deleteAndGoHome(page, name);
  const before = (await records(page)).find((r) => r.id === id);
  const opsBefore = await ops(page, id);
  expect(opsBefore).toMatchObject([{ deleted: true, attempts: 0 }]);

  await page.goto(fillUrl(id));
  await expectLocked(page);
  await expect(nameField(page)).toHaveValue(name);
  expect((await records(page)).find((r) => r.id === id)).toEqual(before);
  expect(await ops(page, id)).toEqual(opsBefore);

  await context.setOffline(false);
  await expect.poll(async () => (await serverRecord(request, id))?.deleted, { timeout: 15_000 }).toBe(true);
  expect(await serverRecord(request, id)).toMatchObject({ version: 2, deleted: true });
});

test('O10: op đã gửi mà mất response (attempts > 0), mở lại thì form khoá, không thêm op', async ({ page, request }) => {
  await login(page);
  const name = uniq('Hộ O10 mất response');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await request.post(FAULTS, { data: { mode: 'drop', count: 100 } });
  try {
    const id = await createWithPhoto(page, name);
    await expect.poll(async () => (await ops(page, id))[0]?.attempts ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
    await deleteAndGoHome(page, name);
    expect(await ops(page, id)).toMatchObject([{ deleted: false }, { deleted: true }]);

    await page.goto(fillUrl(id));
    await expectLocked(page);
    expect(await ops(page, id)).toMatchObject([{ deleted: false }, { deleted: true }]);

    await request.delete(FAULTS);
    await expect.poll(async () => (await serverRecord(request, id))?.deleted, { timeout: 20_000 }).toBe(true);
  } finally {
    await request.delete(FAULTS);
  }
});

test('O10: đang mở phiếu đã xoá mà op được xác nhận (phiếu rời máy): vẫn khoá, không hiện lại Lưu', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ O10 rời máy');
  const id = await createSyncedWithPhoto(page, name);
  await context.setOffline(true);
  await deleteAndGoHome(page, name);
  await page.goto(fillUrl(id));
  await expectLocked(page);

  await context.setOffline(false);
  await expect.poll(async () => (await records(page)).some((r) => r.id === id), { timeout: 15_000 }).toBe(false);
  await expectLocked(page);
  await expect(nameField(page)).toHaveValue(name);
  expect(await serverRecord(request, id)).toMatchObject({ deleted: true });
});

test('O10: người khác xoá, pull về tombstone, mở địa chỉ cũ thì form khoá, không có op, server vẫn xoá', async ({
  page,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ O10 tombstone');
  const id = await createSyncedWithPhoto(page, name);
  const put = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 1, deleted: true, data: { householdName: name } },
  });
  expect(put.status()).toBe(200);
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect.poll(async () => (await records(page)).find((r) => r.id === id)?.deleted).toBe(true);

  await page.goto(fillUrl(id));
  await expectLocked(page);
  expect(await ops(page, id)).toHaveLength(0);
  expect(await serverRecord(request, id)).toMatchObject({ version: 2, deleted: true });
});

test('O10: op xoá bị 4xx: form khoá nhưng vẫn có [Thử lại], bấm thì server có tombstone', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ O10 lỗi xoá');
  const id = await createSyncedWithPhoto(page, name);
  await context.setOffline(true);
  await deleteAndGoHome(page, name);
  await request.post(FAULTS, { data: { mode: '400', count: 1 } });
  try {
    await context.setOffline(false);
    await expect.poll(async () => (await records(page)).find((r) => r.id === id)?.syncState, { timeout: 15_000 }).toBe('error');

    await page.goto(fillUrl(id));
    await expectLocked(page);
    await expect(page.getByTestId('sync-error')).toBeVisible();

    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect.poll(async () => (await serverRecord(request, id))?.deleted, { timeout: 15_000 }).toBe(true);
  } finally {
    await request.delete(FAULTS);
  }
});

test('O10: địa chỉ cũ của phiếu đã rời máy ra form trống; nhập rồi Lưu thì app hỏi, server không tự bỏ xoá (N24)', async ({
  page,
  request,
}) => {
  await login(page);
  const name = uniq('Hộ O10 form trống');
  const id = await createSyncedWithPhoto(page, name);
  await deleteAndGoHome(page, name);
  await expect.poll(async () => (await records(page)).some((r) => r.id === id), { timeout: 15_000 }).toBe(false);

  await page.goto(fillUrl(id));
  await expect(nameField(page)).toHaveValue('');
  const typed = `${name} nhập lại`;
  await nameField(page).fill(typed);
  await page.getByRole('button', { name: 'Lưu' }).click();

  await expect(recordRow(page, typed).getByRole('link', { name: 'Cần xử lý xung đột' })).toBeVisible({ timeout: 15_000 });
  expect(await serverRecord(request, id)).toMatchObject({ deleted: true, data: { householdName: name } });
});

test('O10: tab kia xoá khi tab này đang gõ: tab này khoá, chữ vẫn trên màn hình', async ({ page, context }) => {
  await login(page);
  const name = uniq('Hộ O10 hai tab');
  const id = await createSyncedWithPhoto(page, name);
  await page.goto(fillUrl(id));
  await expect(nameField(page)).toHaveValue(name);

  const other = await context.newPage();
  await other.goto(fillUrl(id));
  await other.getByRole('button', { name: 'Xoá phiếu' }).click();
  await expect(other.getByRole('dialog')).toBeVisible();

  const typed = `${name} đang gõ`;
  await nameField(page).fill(typed);
  await other.getByRole('dialog').getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect.poll(async () => (await records(page)).some((r) => r.id === id), { timeout: 15_000 }).toBe(false);
  await other.close();

  await expectLocked(page);
  await expect(nameField(page)).toHaveValue(typed);
});

test('O10: phiếu đã rời máy còn bộ đệm: chỉ có [Bỏ], bấm xong báo đã xoá, không còn form và không tạo lại phiếu', async ({
  page,
}) => {
  await login(page);
  const name = uniq('Hộ O10 còn bộ đệm');
  const id = await createSyncedWithPhoto(page, name);
  await deleteAndGoHome(page, name);
  await expect.poll(async () => (await records(page)).some((r) => r.id === id), { timeout: 15_000 }).toBe(false);
  // Bộ đệm do tab khác ghi trước khi phiếu bị xoá: gốc khác rỗng nên biết đây không phải phiếu mới
  await putRow(page, DB, 'meta', {
    key: `typing:${id}`,
    value: {
      formId: 'household-survey',
      formVersion: 1,
      data: { householdName: `${name} đang gõ` },
      base: { householdName: name },
      savedAt: new Date().toISOString(),
    },
  });

  await page.goto(fillUrl(id));
  const restore = page.getByTestId('typing-restore');
  await expect(restore).toContainText('Phiếu này đã bị xoá nên không khôi phục được nội dung đang nhập.');
  await expect(page.getByTestId('record-deleted')).toHaveCount(0);
  await restore.getByRole('button', { name: 'Bỏ' }).click();

  await expect(page.getByTestId('record-deleted')).toHaveText(DELETED_TEXT);
  // Không còn gì để xem: ẩn form thay vì một form trống bị khoá
  await expect(page.getByTestId('record-form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lưu' })).toHaveCount(0);
  expect((await records(page)).some((r) => r.id === id)).toBe(false);
  expect(await ops(page, id)).toHaveLength(0);
});

test('O10: hộp xác nhận xoá đang mở mà tab kia đã xoá phiếu thì hộp đóng, form khoá', async ({ page, context }) => {
  await login(page);
  const name = uniq('Hộ O10 hộp mở');
  const id = await createSyncedWithPhoto(page, name);
  await page.goto(fillUrl(id));
  await page.getByRole('button', { name: 'Xoá phiếu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const other = await context.newPage();
  await other.goto(fillUrl(id));
  await clickDelete(other);
  // Hộp đóng trước khi xoá xong: đóng tab ngay thì lệnh xoá chưa kịp chạy
  await expect(other.getByRole('button', { name: 'Tạo phiếu mới' })).toBeVisible();
  await other.close();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectLocked(page);
});

/** Ghi lại nếu dải đã xoá từng xuất hiện trong DOM, dù chỉ một khung hình: đánh dấu lên thẻ html, không bị trang vẽ lại. */
async function watchDeletedBanner(page: Page) {
  await page.evaluate(() => {
    new MutationObserver((batch) => {
      for (const m of batch) {
        for (const n of m.addedNodes) {
          if (n instanceof HTMLElement && (n.matches('[data-testid=record-deleted]') || n.querySelector('[data-testid=record-deleted]'))) {
            document.documentElement.dataset.deletedBannerSeen = 'true';
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const deletedBannerSeen = (page: Page) => page.locator('html').getAttribute('data-deleted-banner-seen');

test('O10: xoá xong dải đã xoá không nhấp nháy trước khi về danh sách (xoá mềm và xoá hẳn)', async ({ page, context }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const synced = uniq('Hộ O10 nhấp nháy mềm');
  await createSyncedWithPhoto(page, synced);
  await context.setOffline(true);
  const local = uniq('Hộ O10 nhấp nháy hẳn');
  await createWithPhoto(page, local);
  await watchDeletedBanner(page);

  await deleteAndGoHome(page, synced);
  await deleteAndGoHome(page, local);
  expect(await deletedBannerSeen(page)).toBeNull();
});
