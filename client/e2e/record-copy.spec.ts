import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import {
  API,
  PROJECT,
  TOKENS,
  authHeaders,
  createProject,
  login,
  makeImage,
  putRow,
  readStore,
  setMembership,
} from './helpers';

// Nhân bản phiếu ở màn hình 4 (design §4.1 "Nhân bản phiếu", ui.md màn hình 4; Could, cắt được). Bản sao là phiếu
// mới chưa Lưu nằm trong bộ đệm của id mới: không có phiếu, không có op tới khi bấm Lưu (CLAUDE.md bất biến 2, 3).

const DB = `field-survey-p-${PROJECT}`;

type StoredRecord = {
  id: string;
  formVersion: number;
  data: Record<string, unknown>;
  syncState: string;
};
type StoredOp = { opId: string; recordId: string };
type MetaRow = { key: string; value: { data: Record<string, unknown>; base: Record<string, unknown> } };
type ServerRecord = { id: string; version: number; createdBy: string; data: Record<string, unknown> };

const uniq = (name: string) => `${name} ${crypto.randomUUID().slice(0, 8)}`;
const nameInput = (page: Page) => page.locator('input[name=householdName]');
const membersInput = (page: Page) => page.locator('input[name=members]');
const copyButton = (page: Page) => page.getByRole('button', { name: 'Nhân bản phiếu' });
const copyNote = (page: Page) => page.getByTestId('copy-note');
const restoreBanner = (page: Page) => page.getByTestId('typing-restore');
const idFromUrl = (page: Page) => page.url().split('/').pop() ?? '';

function recordRow(page: Page, text: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: text });
}

const records = async (page: Page, db = DB) => (await readStore(page, db, 'records')) as StoredRecord[];
const ops = async (page: Page) => (await readStore(page, DB, 'outbox')) as StoredOp[];
const typingRows = async (page: Page) =>
  ((await readStore(page, DB, 'meta')) as MetaRow[]).filter((r) => r.key.startsWith('typing:'));

async function serverRecords(request: APIRequestContext, token: string): Promise<ServerRecord[]> {
  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(token) })).json();
  return pulled.records as ServerRecord[];
}

/** Tạo một phiếu và chờ lên server. Trả id phiếu. */
async function createSynced(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await nameInput(page).fill(name);
  await membersInput(page).fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();
  const row = recordRow(page, name);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  return (await row.getByRole('link').first().getAttribute('href'))?.split('/').pop() ?? '';
}

async function openRecord(page: Page, name: string) {
  await recordRow(page, name).getByTestId('record-title').click();
}

/** Bấm nhân bản và chờ tới trang bản sao. Trả id bản sao. */
async function copyFrom(page: Page, sourceId: string): Promise<string> {
  await copyButton(page).click();
  await expect(copyNote(page)).toHaveText('Đây là bản sao, chưa lưu. Ảnh và vị trí không được chép.');
  const id = idFromUrl(page);
  expect(id).not.toBe(sourceId);
  return id;
}

test('chép chữ, số, chọn, ngày; không chép ảnh và vị trí; trước Lưu chưa có phiếu và op; Lưu thì có phiếu mới ở server', async ({
  page,
  context,
  request,
}) => {
  const name = uniq('Hộ đủ trường');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 10.7769, longitude: 106.7009, accuracy: 12 });
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await nameInput(page).fill(name);
  await membersInput(page).fill('4');
  await page.locator('select[name=waterSource]').selectOption('Giếng');
  await page.getByRole('checkbox', { name: 'Tivi' }).check();
  await page.locator('input[name=visitDate]').fill('2026-11-04');
  const image = await makeImage(page, { width: 400, height: 300, type: 'image/jpeg', quality: 0.9 });
  await page.getByTestId('photo-input-housePhoto').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(page.getByTestId('photo-thumb')).toHaveCount(1);
  const gps = page.getByRole('group', { name: 'Vị trí' });
  await gps.getByRole('button', { name: 'Lấy vị trí' }).click();
  await expect(gps.getByText('10.77690, 106.70090 (±12 m)')).toBeVisible();
  const sourceId = idFromUrl(page);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  await openRecord(page, name);
  const copyId = await copyFrom(page, sourceId);
  await expect(nameInput(page)).toHaveValue(name);
  await expect(membersInput(page)).toHaveValue('4');
  await expect(page.locator('select[name=waterSource]')).toHaveValue('Giếng');
  await expect(page.getByRole('checkbox', { name: 'Tivi' })).toBeChecked();
  await expect(page.locator('input[name=visitDate]')).toHaveValue('2026-11-04');
  await expect(page.getByTestId('photo-thumb')).toHaveCount(0);
  await expect(gps.getByText('10.77690')).toHaveCount(0);
  // Phiếu mới chưa Lưu thì không có nút nhân bản, không có Xoá
  await expect(copyButton(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xoá phiếu' })).toHaveCount(0);
  expect((await records(page)).find((r) => r.id === copyId)).toBeUndefined();
  expect((await ops(page)).filter((o) => o.recordId === copyId)).toHaveLength(0);

  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name)).toHaveCount(2);
  for (const row of await recordRow(page, name).all()) {
    await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  }
  const onServer = (await serverRecords(request, TOKENS.minh)).filter((r) => r.data.householdName === name);
  expect(onServer.map((r) => r.id).sort()).toEqual([sourceId, copyId].sort());
  const copy = onServer.find((r) => r.id === copyId);
  const source = onServer.find((r) => r.id === sourceId);
  expect(copy).toMatchObject({ version: 1, createdBy: 'u_minh', data: { members: 4, waterSource: 'Giếng', assets: ['Tivi'] } });
  expect(copy?.data).not.toHaveProperty('housePhoto');
  expect(copy?.data).not.toHaveProperty('location');
  expect(source).toMatchObject({ version: 1, data: { location: { lat: 10.7769, lng: 106.7009 } } });
  expect(source?.data.housePhoto).toHaveLength(1);
  expect((await typingRows(page)).find((r) => r.key === `typing:${copyId}`)).toBeUndefined();
});

test('sửa bản sao không đổi phiếu gốc', async ({ page, request }) => {
  const name = uniq('Hộ gốc');
  await login(page);
  const sourceId = await createSynced(page, name);
  await openRecord(page, name);
  const copyId = await copyFrom(page, sourceId);
  const copyName = uniq('Hộ bản sao');
  await nameInput(page).fill(copyName);
  await membersInput(page).fill('9');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, copyName).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  const local = await records(page);
  expect(local.find((r) => r.id === sourceId)?.data).toMatchObject({ householdName: name, members: 3 });
  expect(local.find((r) => r.id === copyId)?.data).toMatchObject({ householdName: copyName, members: 9 });
  const source = (await serverRecords(request, TOKENS.minh)).find((r) => r.id === sourceId);
  expect(source).toMatchObject({ version: 1, data: { householdName: name, members: 3 } });
});

test('phiếu gốc đang gõ dở: bản sao mang chữ đang hiện, phiếu gốc không đổi và mở lại vẫn khôi phục được', async ({
  page,
  request,
}) => {
  const name = uniq('Hộ gõ dở');
  await login(page);
  const sourceId = await createSynced(page, name);
  await openRecord(page, name);
  // Bấm ngay sau khi gõ, chưa đủ 1 s tự lưu: phần đang chờ phải được ghi trước khi rời trang
  await membersInput(page).fill('7');
  await copyFrom(page, sourceId);
  await expect(membersInput(page)).toHaveValue('7');
  expect((await typingRows(page)).find((r) => r.key === `typing:${sourceId}`)?.value.data.members).toBe(7);

  const copyName = uniq('Hộ từ bản gõ dở');
  await nameInput(page).fill(copyName);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, copyName)).toBeVisible();

  // Phiếu gốc không tự thành bản đã lưu
  const local = (await records(page)).find((r) => r.id === sourceId);
  expect(local).toMatchObject({ syncState: 'synced', data: { members: 3 } });
  expect((await ops(page)).filter((o) => o.recordId === sourceId)).toHaveLength(0);
  expect((await serverRecords(request, TOKENS.minh)).find((r) => r.id === sourceId)?.version).toBe(1);

  await openRecord(page, name);
  // Đang hỏi Khôi phục thì form khoá, chưa nhân bản được
  await expect(restoreBanner(page)).toBeVisible();
  await expect(copyButton(page)).toHaveCount(0);
  await restoreBanner(page).getByRole('button', { name: 'Khôi phục' }).click();
  await expect(membersInput(page)).toHaveValue('7');
  await expect(copyButton(page)).toBeVisible();
});

test('trang bị ẩn ngay lúc chuyển sang bản sao: bộ đệm của bản sao không nhận dữ liệu phiếu gốc', async ({
  page,
  context,
}) => {
  const name = uniq('Hộ ẩn trang');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 10.7769, longitude: 106.7009, accuracy: 12 });
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await nameInput(page).fill(name);
  const gps = page.getByRole('group', { name: 'Vị trí' });
  await gps.getByRole('button', { name: 'Lấy vị trí' }).click();
  await expect(gps.getByText('10.77690, 106.70090 (±12 m)')).toBeVisible();
  const sourceId = idFromUrl(page);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  await openRecord(page, name);
  await expect(copyButton(page)).toBeVisible();
  // Có chữ đang gõ thì lần ghi lẫn sang id mới mới thật sự ghi: chữ giống hệt phiếu thì needsBuffer bỏ qua, bẫy không nổ
  await membersInput(page).fill('5');

  // Giả lập chuyển app đúng lúc đổi trang (Android hay tắt app lúc này): liên tục báo trang bị ẩn trong 500 ms sau
  // khi đổi hash, và ghi lại mọi lần ghi bộ đệm. Phải bám IndexedDB vì lần ghi sai có thể bị lần tự lưu sau đè mất.
  const puts = await page.evaluate(async () => {
    const seen: { key: string; data: Record<string, unknown>; base: Record<string, unknown> }[] = [];
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const row = value as { key?: unknown; value?: { data: Record<string, unknown>; base: Record<string, unknown> } };
      if (typeof row.key === 'string' && row.key.startsWith('typing:') && row.value) {
        seen.push({ key: row.key, data: row.value.data, base: row.value.base });
      }
      return key === undefined ? realPut.call(this, value) : realPut.call(this, value, key);
    };
    const finished = new Promise<void>((resolve) => {
      window.addEventListener(
        'hashchange',
        () => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          const until = performance.now() + 500;
          const channel = new MessageChannel();
          channel.port1.onmessage = () => {
            document.dispatchEvent(new Event('visibilitychange'));
            if (performance.now() < until) {
              channel.port2.postMessage(null);
              return;
            }
            Reflect.deleteProperty(document, 'visibilityState');
            channel.port1.close();
            resolve();
          };
          channel.port2.postMessage(null);
        },
        { once: true },
      );
    });
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Nhân bản phiếu');
    button?.click();
    await finished;
    IDBObjectStore.prototype.put = realPut;
    return seen;
  });

  const copyId = idFromUrl(page);
  expect(copyId).not.toBe(sourceId);
  const toCopy = puts.filter((p) => p.key === `typing:${copyId}`);
  expect(toCopy.length).toBeGreaterThan(0);
  for (const put of toCopy) {
    expect(put.data).not.toHaveProperty('location');
    expect(put.base).toEqual({});
  }
  await expect(nameInput(page)).toHaveValue(name);
  await expect(gps.getByText('10.77690')).toHaveCount(0);
  await expect(page.getByTestId('typing-restore')).toHaveCount(0);
  await expect(membersInput(page)).toHaveValue('5');
  expect((await typingRows(page)).find((r) => r.key === `typing:${sourceId}`)?.value.data.members).toBe(5);
  expect((await ops(page)).filter((o) => o.recordId === sourceId || o.recordId === copyId)).toHaveLength(0);
});

test('hai lần chạm liên tiếp chỉ tạo một bản sao', async ({ page }) => {
  const name = uniq('Hộ bấm hai lần');
  await login(page);
  await createSynced(page, name);
  await openRecord(page, name);
  await expect(copyButton(page)).toBeVisible();
  // Hai lần bấm trong cùng một nhịp, trước khi React kịp khoá nút
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Nhân bản phiếu');
    button?.click();
    button?.click();
  });
  await expect(copyNote(page)).toBeVisible();
  await expect(nameInput(page)).toHaveValue(name);
  expect(await typingRows(page)).toHaveLength(1);
});

test('không ghi được bản sao vào máy: ở lại phiếu gốc, báo lỗi, không có gì đổi; bấm lại được thì hết báo', async ({ page }) => {
  const name = uniq('Hộ máy đầy');
  await login(page);
  const sourceId = await createSynced(page, name);
  await openRecord(page, name);
  await expect(copyButton(page)).toBeVisible();
  // Lần ghi bộ đệm đầu tiên báo đầy bộ nhớ như IndexedDB thật, các lần sau ghi bình thường
  await page.evaluate(() => {
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const row = value as { key?: unknown };
      if (typeof row.key === 'string' && row.key.startsWith('typing:')) {
        IDBObjectStore.prototype.put = realPut;
        throw new DOMException('Bộ nhớ đầy', 'QuotaExceededError');
      }
      return key === undefined ? realPut.call(this, value) : realPut.call(this, value, key);
    };
  });

  await copyButton(page).click();
  await expect(page.getByTestId('copy-error')).toHaveText('Không nhân bản được phiếu. Thử lại sau.');
  await expect(copyButton(page)).toBeEnabled();
  expect(idFromUrl(page)).toBe(sourceId);
  expect(await typingRows(page)).toHaveLength(0);
  expect((await records(page)).filter((r) => r.data.householdName === name)).toHaveLength(1);

  const copyId = await copyFrom(page, sourceId);
  await expect(page.getByTestId('copy-error')).toHaveCount(0);
  await expect(nameInput(page)).toHaveValue(name);
  expect((await typingRows(page)).map((r) => r.key)).toEqual([`typing:${copyId}`]);
});

test('rời trang chưa Lưu: lên dải trang chủ, mở lại hỏi Khôi phục / Bỏ; Bỏ thì hết, không có phiếu, không có op', async ({
  page,
}) => {
  const name = uniq('Hộ bỏ bản sao');
  await login(page);
  const sourceId = await createSynced(page, name);
  await openRecord(page, name);
  const copyId = await copyFrom(page, sourceId);
  await page.getByRole('link', { name: '← Quay lại' }).click();

  const strip = page.getByTestId('typing-unsaved');
  await strip.getByRole('link').filter({ hasText: name }).click();
  await expect(restoreBanner(page)).toBeVisible();
  await expect(copyNote(page)).toHaveCount(0);
  await restoreBanner(page).getByRole('button', { name: 'Bỏ' }).click();
  await expect(restoreBanner(page)).toHaveCount(0);
  await expect.poll(async () => (await typingRows(page)).length).toBe(0);

  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(recordRow(page, name)).toHaveCount(1);
  await expect(strip).toHaveCount(0);
  expect((await records(page)).find((r) => r.id === copyId)).toBeUndefined();
  expect((await ops(page)).filter((o) => o.recordId === copyId)).toHaveLength(0);
});

test('offline: nhân bản và Lưu ra "Chờ đồng bộ", op có opId và phiếu riêng; có mạng thì server nhận đúng', async ({
  page,
  context,
  request,
}) => {
  const name = uniq('Hộ offline gốc');
  const copyName = uniq('Hộ offline sao');
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await nameInput(page).fill(name);
  const sourceId = idFromUrl(page);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  await openRecord(page, name);
  const copyId = await copyFrom(page, sourceId);
  await nameInput(page).fill(copyName);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, copyName).getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  const queued = await ops(page);
  const sourceOp = queued.find((o) => o.recordId === sourceId);
  const copyOp = queued.find((o) => o.recordId === copyId);
  expect(sourceOp?.opId).toBeTruthy();
  expect(copyOp?.opId).toBeTruthy();
  expect(copyOp?.opId).not.toBe(sourceOp?.opId);

  await context.setOffline(false);
  await expect(recordRow(page, copyName).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const onServer = await serverRecords(request, TOKENS.minh);
  expect(onServer.find((r) => r.id === copyId)).toMatchObject({ version: 1, data: { householdName: copyName } });
  expect(onServer.find((r) => r.id === sourceId)).toMatchObject({ version: 1, data: { householdName: name } });
});

test('điều tra viên không nhân bản được phiếu người khác; phiếu Lỗi có nút; phiếu đã xoá thì không', async ({ page }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const row = (id: string, name: string, extra: Record<string, unknown>) => ({
    id,
    formId: 'household-survey',
    formVersion: 1,
    data: { householdName: name },
    deleted: false,
    baseData: { householdName: name },
    baseVersion: 1,
    syncState: 'synced',
    updatedAt: new Date().toISOString(),
    ...extra,
  });
  // Không có trên server nên vòng đồng bộ không đụng tới (như record-owner.spec.ts)
  const other = uniq('Hộ của lan');
  const failed = uniq('Hộ bị lỗi');
  const deletedId = crypto.randomUUID();
  await putRow(page, DB, 'records', row(crypto.randomUUID(), other, { createdBy: 'u_lan', createdByName: 'lan' }));
  await putRow(page, DB, 'records', row(crypto.randomUUID(), failed, { syncState: 'error', createdBy: 'u_minh' }));
  await putRow(page, DB, 'records', row(deletedId, uniq('Hộ đã xoá'), { deleted: true, createdBy: 'u_minh' }));
  await page.reload();

  await openRecord(page, other);
  await expect(page.getByRole('button', { name: 'Lưu' })).toBeVisible();
  await expect(copyButton(page)).toHaveCount(0);

  await page.getByRole('link', { name: '← Quay lại' }).click();
  await openRecord(page, failed);
  await expect(copyButton(page)).toBeVisible();

  await page.goto(`/#/fill/household-survey/${deletedId}`);
  await expect(page.getByTestId('record-deleted')).toBeVisible();
  await expect(nameInput(page)).toBeDisabled();
  await expect(copyButton(page)).toHaveCount(0);
});

test('giám sát viên nhân bản phiếu của điều tra viên: người tạo bản sao lấy theo token', async ({ page, request }) => {
  const name = uniq('Hộ của minh');
  const copyName = uniq('Bản sao của lan');
  const id = crypto.randomUUID();
  const created = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.minh), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 0, deleted: false, data: { householdName: name } },
  });
  expect(created.status()).toBe(201);

  await login(page, 'lan');
  // lan thuộc hai dự án; /me sắp theo id nên app mở demo-nongnghiep trước (như home.spec.ts), phiếu nằm ở demo-yte
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name: /Y tế xã \(demo\)/ }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName('Y tế xã (demo)');
  await openRecord(page, name);
  const copyId = await copyFrom(page, id);
  await nameInput(page).fill(copyName);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, copyName).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  const onServer = await serverRecords(request, TOKENS.lan);
  expect(onServer.find((r) => r.id === copyId)?.createdBy).toBe('u_lan');
  expect(onServer.find((r) => r.id === id)?.createdBy).toBe('u_minh');
});

test('phiếu đang xung đột không có nút; phiếu mới chưa lưu không có nút', async ({ page, context, request }) => {
  const name = uniq('Hộ xung đột');
  await login(page);
  const id = await createSynced(page, name);
  await goConflict(page, context, request, id, name);
  await page.goto(`/#/fill/household-survey/${id}`);
  await expect(page.getByTestId('record-in-conflict')).toBeVisible();
  await expect(copyButton(page)).toHaveCount(0);

  await page.goto('/#/');
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await expect(page.getByRole('button', { name: 'Lưu' })).toBeVisible();
  await expect(copyButton(page)).toHaveCount(0);
});

test('xoá phiếu gốc khi bản sao chưa Lưu: bản sao không dính trạng thái đã xoá, Lưu được thành phiếu mới', async ({
  page,
  request,
}) => {
  const name = uniq('Hộ gốc bị xoá');
  await login(page);
  const sourceId = await createSynced(page, name);
  await openRecord(page, name);
  const copyId = await copyFrom(page, sourceId);
  await expect(nameInput(page)).toBeEnabled();
  await expect.poll(async () => (await typingRows(page)).map((r) => r.key)).toContain(`typing:${copyId}`);
  await page.getByRole('link', { name: '← Quay lại' }).click();

  await openRecord(page, name);
  await page.getByRole('button', { name: 'Xoá phiếu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá' }).click();
  await expect(recordRow(page, name)).toHaveCount(0);

  await page.getByTestId('typing-unsaved').getByRole('link').filter({ hasText: name }).click();
  await restoreBanner(page).getByRole('button', { name: 'Khôi phục' }).click();
  await expect(nameInput(page)).toBeEnabled();
  await expect(page.getByTestId('record-deleted')).toHaveCount(0);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const copy = (await serverRecords(request, TOKENS.minh)).find((r) => r.id === copyId);
  expect(copy).toMatchObject({ version: 1, data: { householdName: name } });
});

test('nháp ở lại trang: bản sao Lưu thành nháp, dải mất, nhân bản tiếp được', async ({ page }) => {
  const name = uniq('Hộ gốc nháp');
  await login(page);
  const sourceId = await createSynced(page, name);
  await openRecord(page, name);
  const copyId = await copyFrom(page, sourceId);

  await nameInput(page).fill('');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await expect(page.getByTestId('error-householdName')).toBeVisible();
  await expect(copyNote(page)).toHaveCount(0);
  expect((await records(page)).find((r) => r.id === copyId)?.syncState).toBe('draft');
  expect((await ops(page)).filter((o) => o.recordId === copyId)).toHaveLength(0);

  // Bản sao đã là phiếu nháp nên nhân bản tiếp được, và phiếu mới là id khác
  await nameInput(page).fill(`${name} lần hai`);
  const secondId = await copyFrom(page, copyId);
  await expect(nameInput(page)).toHaveValue(`${name} lần hai`);
  expect(secondId).not.toBe(sourceId);
});

/** Máy này sửa tên khi offline và Lưu, máy B sửa cùng trường trên server: phiếu thành `conflict`. */
async function goConflict(page: Page, context: BrowserContext, request: APIRequestContext, id: string, name: string) {
  await context.setOffline(true);
  await openRecord(page, name);
  await nameInput(page).fill(`${name} máy A`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const res = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 1, deleted: false, data: { householdName: `${name} máy B`, members: 3 } },
  });
  expect(res.status()).toBe(200);
  await context.setOffline(false);
  await expect(recordRow(page, name).getByRole('link', { name: 'Cần xử lý xung đột' })).toBeVisible({ timeout: 15_000 });
}

test.describe('theo bản form mới nhất', () => {
  let project = '';
  const api = (path: string) => `http://localhost:3001/api/projects/${project}${path}`;

  test.beforeEach(async ({ request }) => {
    project = `b-${crypto.randomUUID().slice(0, 8)}`;
    await createProject(request, project, `Nhân bản ${project}`);
    await setMembership(request, project, 'u_lan', 'supervisor');
  });

  test.afterEach(async ({ request }) => {
    await setMembership(request, project, 'u_lan', null);
  });

  async function saveForm(request: APIRequestContext, fields: Record<string, unknown>[]) {
    const res = await request.post(api('/forms'), {
      headers: authHeaders(TOKENS.lan),
      data: { id: 'ho', title: 'Hộ dân', fields },
    });
    expect(res.status()).toBe(201);
  }

  test('phiếu v1, form đã lên v2: bản sao dùng v2, bỏ trường đã ẩn; thiếu trường, ảnh, vị trí bắt buộc thì Lưu thành nháp', async ({
    page,
    request,
  }) => {
    const ten = { id: 'ten', type: 'text', label: 'Tên' };
    const ghiChu = { id: 'ghiChu', type: 'text', label: 'Ghi chú' };
    await saveForm(request, [ten, ghiChu]);
    const sourceId = crypto.randomUUID();
    const created = await request.put(api(`/records/${sourceId}`), {
      headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
      data: { formId: 'ho', formVersion: 1, baseVersion: 0, deleted: false, data: { ten: 'Phiếu v1', ghiChu: 'Nhà cấp 4' } },
    });
    expect(created.status()).toBe(201);
    await saveForm(request, [
      ten,
      { ...ghiChu, hidden: true },
      { id: 'diaChi', type: 'text', label: 'Địa chỉ', required: true },
      { id: 'anh', type: 'photo', label: 'Ảnh', required: true },
      { id: 'viTri', type: 'gps', label: 'Toạ độ', required: true },
    ]);

    await login(page, 'lan');
    const db = `field-survey-p-${project}`;
    // Chờ app tạo xong CSDL dự án: readStore mở CSDL chưa có thì lỗi AbortError, expect.poll không thử lại
    await expect(page.getByTestId('records').getByText('Phiếu v1')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => ((await readStore(page, db, 'forms')) as { version: number }[]).map((f) => f.version)).toContain(2);
    await page.getByTestId('records').getByText('Phiếu v1').click();
    await expect(page.locator('input[name=ghiChu]')).toHaveValue('Nhà cấp 4');

    await copyButton(page).click();
    await expect(copyNote(page)).toBeVisible();
    const copyId = idFromUrl(page);
    await expect(page.locator('input[name=ten]')).toHaveValue('Phiếu v1');
    await expect(page.locator('input[name=diaChi]')).toHaveValue('');
    await expect(page.locator('input[name=ghiChu]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByTestId('draft-notice')).toBeVisible();
    await expect(page.getByTestId('error-diaChi')).toBeVisible();
    await expect(page.getByTestId('error-anh')).toBeVisible();
    await expect(page.getByTestId('error-viTri')).toBeVisible();

    const local = await records(page, db);
    const copy = local.find((r) => r.id === copyId);
    expect(copy).toMatchObject({ formVersion: 2, syncState: 'draft', data: { ten: 'Phiếu v1' } });
    expect(copy?.data).not.toHaveProperty('ghiChu');
    expect(local.find((r) => r.id === sourceId)).toMatchObject({
      formVersion: 1,
      syncState: 'synced',
      data: { ten: 'Phiếu v1', ghiChu: 'Nhà cấp 4' },
    });
  });
});
