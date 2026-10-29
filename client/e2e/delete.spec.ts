import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, PROJECT, TOKENS, authHeaders, login, readStore } from './helpers';

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
