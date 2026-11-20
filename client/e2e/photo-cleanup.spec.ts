import { createHash } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, PROJECT, TOKENS, answerConfirm, authHeaders, login, makeImage, readStore } from './helpers';

// O11 (design §4.2, §5.6, §8; ui.md màn hình 8; requirements US-03): nút "Dọn ảnh đã tải lên" ở Cài đặt chỉ
// xoá ảnh server đã có (`done`), xoá cả dòng nên mở lại phiếu thì ảnh tự tải về như ảnh của máy khác (O9).
// Ảnh chưa gửi không bị đụng. minh là điều tra viên, lan là giám sát viên ở dự án Y tế xã.

const DB = `field-survey-p-${PROJECT}`;
const TEST_API = 'http://localhost:3001/api/__test';
const FIELD = 'housePhoto';
const EMPTY = 'Chưa có ảnh đã tải lên nào trên máy.';
const NEED_NETWORK = '⚠ Cần kết nối để xem ảnh này';

test.beforeEach(async ({ request }) => {
  await request.delete(`${TEST_API}/faults`);
  await request.delete(`${TEST_API}/stats`);
});

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const uniqueName = (prefix: string) => `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
const smallPhoto = (page: Page) => makeImage(page, { width: 320, height: 240, type: 'image/jpeg', quality: 0.9 });

/** Viết lại cách ghi dung lượng của app (formatBytes) để kiểm con số trong câu chữ một cách độc lập. */
function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const [value, unit] = bytes < 1024 ** 2 ? [bytes / 1024, 'KB'] : [bytes / 1024 ** 2, 'MB'];
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} ${unit}`;
}

const confirmText = (count: number, bytes: number) =>
  `Xoá ${count} ảnh đã tải lên khỏi máy này (${sizeText(bytes)})? Ảnh vẫn còn trên máy chủ, mở lại phiếu khi có mạng thì tự tải về. Ảnh chưa gửi được giữ nguyên.`;
const doneText = (count: number, bytes: number) => `Đã dọn ${count} ảnh (${sizeText(bytes)}).`;

interface StoredPhoto {
  id: string;
  uploadState: string;
  size: number;
  sha256: string;
}

/** Mọi dòng ảnh trên máy, đọc bằng API gốc của trình duyệt chứ không qua Dexie của app. */
function storedPhotos(page: Page): Promise<StoredPhoto[]> {
  return page.evaluate(
    (dbName) =>
      new Promise<StoredPhoto[]>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('attachments', 'readonly').objectStore('attachments').getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = async () => {
            open.result.close();
            const rows = req.result as { id: string; uploadState: string; blob: Blob }[];
            const out: StoredPhoto[] = [];
            for (const row of rows) {
              const digest = await crypto.subtle.digest('SHA-256', await row.blob.arrayBuffer());
              out.push({
                id: row.id,
                uploadState: row.uploadState,
                size: row.blob.size,
                sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''),
              });
            }
            resolve(out);
          };
        };
      }),
    DB,
  );
}

const storedPhoto = async (page: Page, id: string) => (await storedPhotos(page)).find((p) => p.id === id);

interface LoggedRequest {
  method: string;
  path: string;
  status: number;
}

async function requestLog(request: APIRequestContext): Promise<LoggedRequest[]> {
  return ((await (await request.get(`${TEST_API}/stats`)).json()) as { requests: LoggedRequest[] }).requests;
}

const downloads = (log: LoggedRequest[], photoId: string) =>
  log.filter((r) => r.method === 'GET' && r.path.endsWith(`/attachments/${photoId}`));
const uploadCalls = (log: LoggedRequest[], photoId: string) =>
  log.filter((r) => new RegExp(`/attachments/${photoId}/(status|chunks/\\d+|complete)$`).test(r.path));
const recordPuts = (log: LoggedRequest[]) => log.filter((r) => r.method === 'PUT' && /\/records\/[^/]+$/.test(r.path));

/** Kích thêm `rounds` vòng đồng bộ rồi chờ server nhận đủ lượt pull (như photo-download.spec.ts). */
async function runSyncRounds(page: Page, request: APIRequestContext, rounds = 2) {
  const pulls = async () => (await requestLog(request)).filter((r) => r.method === 'GET' && r.path.endsWith('/records')).length;
  for (let i = 0; i < rounds; i++) {
    const before = await pulls();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(pulls, { timeout: 15_000 }).toBeGreaterThan(before);
  }
}

const recordRow = (page: Page, name: string) => page.getByTestId('records').getByRole('listitem').filter({ hasText: name });

/** Tạo phiếu có một ảnh ở màn hình 4 rồi Lưu. Trả id ảnh. */
async function createRecordWithPhoto(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByTestId(`photo-input-${FIELD}`).setInputFiles({ name: 'anh.jpg', mimeType: 'image/jpeg', buffer: await smallPhoto(page) });
  await expect(page.getByTestId('photo-thumb')).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name)).toHaveCount(1);
  const records = (await readStore(page, DB, 'records')) as { data: { householdName?: string; housePhoto?: string[] } }[];
  const ids = records.find((r) => r.data.householdName === name)?.data.housePhoto ?? [];
  expect(ids).toHaveLength(1);
  return ids[0] ?? '';
}

async function openRecord(page: Page, name: string) {
  await recordRow(page, name).getByRole('link', { name }).click({ timeout: 20_000 });
  await expect(page.getByTestId('record-form')).toBeVisible();
}

async function openSettings(page: Page) {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
}

const backToList = (page: Page) => page.getByRole('link', { name: '← Quay lại' }).click();
const cleanupButton = (page: Page) => page.getByTestId('cleanup-photos-button');

/** Ảnh hiện thật: thẻ img đã giải mã được blob, không chỉ có thẻ. */
async function expectDecodedImage(page: Page) {
  const img = page.getByTestId('photo-thumb').first().locator('img');
  await expect(img).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
}

test('O11: dọn ảnh mình chụp đã lên server: Huỷ thì còn nguyên; xác nhận thì dòng ảnh mất, phiếu không đổi, không có op; mở lại phiếu thì ảnh tự tải về', async ({
  page,
  request,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const name = uniqueName('Dọn ảnh');
  const photoId = await createRecordWithPhoto(page, name);
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 30_000 });
  const before = await storedPhoto(page, photoId);
  expect(before?.uploadState).toBe('done');
  const size = before?.size ?? 0;
  expect(size).toBeGreaterThan(0);
  const recordsBefore = await readStore(page, DB, 'records');

  await openSettings(page);
  await expect(cleanupButton(page)).toHaveText('Dọn ảnh đã tải lên');
  await expect(cleanupButton(page)).toBeEnabled();
  await expect(page.getByTestId('cleanup-photos-empty')).toHaveCount(0);
  // Nút nằm trong khối Dung lượng
  await expect(page.getByTestId('settings-storage').locator('..').getByTestId('cleanup-photos-button')).toBeVisible();

  // Huỷ hoặc Esc ở hộp xác nhận thì không xoá gì
  await cleanupButton(page).click();
  await answerConfirm(page, confirmText(1, size), 'Huỷ');
  await cleanupButton(page).click();
  await answerConfirm(page, confirmText(1, size), 'Esc');
  expect(await storedPhoto(page, photoId)).toEqual(before);
  await expect(page.getByTestId('cleanup-photos-done')).toHaveCount(0);

  await request.delete(`${TEST_API}/stats`);
  await cleanupButton(page).click();
  await answerConfirm(page, confirmText(1, size), 'Dọn ảnh');
  await expect(page.getByTestId('cleanup-photos-done')).toHaveText(doneText(1, size));
  await expect(page.getByRole('status').filter({ hasText: doneText(1, size) })).toHaveCount(1);
  await expect(page.getByTestId('cleanup-photos-error')).toHaveCount(0);
  expect(await storedPhotos(page)).toEqual([]);
  // Không còn gì để dọn: nút khoá, trình đọc màn hình tới nút thì nghe luôn lý do
  await expect(cleanupButton(page)).toBeDisabled();
  await expect(cleanupButton(page)).toHaveAccessibleDescription(EMPTY);

  // Dọn ảnh không đụng phiếu và outbox, không gửi gì lên server, đăng xuất không bị chặn
  expect(await readStore(page, DB, 'records')).toEqual(recordsBefore);
  expect(await readStore(page, DB, 'outbox')).toEqual([]);
  await expect(page.getByTestId('logout-blocked')).toHaveCount(0);
  await runSyncRounds(page, request);
  let log = await requestLog(request);
  expect(uploadCalls(log, photoId)).toEqual([]);
  expect(recordPuts(log)).toEqual([]);
  expect(downloads(log, photoId)).toEqual([]);

  await backToList(page);
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ');
  await openRecord(page, name);
  await expectDecodedImage(page);
  await expect(page.getByTestId('record-state')).toHaveText('Đã đồng bộ');
  // Tải về đúng ảnh đã gửi, ghi lại thành `done`: lần sau dọn tiếp được
  expect(await storedPhoto(page, photoId)).toEqual(before);
  log = await requestLog(request);
  expect(downloads(log, photoId).map((r) => r.status)).toEqual([200]);
  expect(uploadCalls(log, photoId)).toEqual([]);
  expect(await readStore(page, DB, 'outbox')).toEqual([]);
});

test('O11: ảnh chưa gửi không bị dọn; ảnh đã dọn mở lúc offline thì báo cần mạng, có mạng tự tải lại', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const sentName = uniqueName('Ảnh đã gửi');
  const sentId = await createRecordWithPhoto(page, sentName);
  await expect(recordRow(page, sentName).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 30_000 });
  const sent = await storedPhoto(page, sentId);

  await context.setOffline(true);
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');
  const unsentName = uniqueName('Ảnh chưa gửi');
  const unsentId = await createRecordWithPhoto(page, unsentName);
  const unsent = await storedPhoto(page, unsentId);
  expect(unsent?.uploadState).toBe('pending');

  // Offline vẫn dọn được; hộp chỉ đếm ảnh server đã có
  await openSettings(page);
  await cleanupButton(page).click();
  await answerConfirm(page, confirmText(1, sent?.size ?? 0), 'Dọn ảnh');
  await expect(page.getByTestId('cleanup-photos-done')).toHaveText(doneText(1, sent?.size ?? 0));
  expect(await storedPhotos(page)).toEqual([unsent]);
  await expect(cleanupButton(page)).toBeDisabled();

  // Ảnh đã dọn, chưa có mạng: ô ảnh như phiếu máy khác tạo (O9), không có nút bỏ ảnh
  await backToList(page);
  await openRecord(page, sentName);
  await expect(page.getByTestId(`photo-fetch-error-${FIELD}`)).toHaveText([NEED_NETWORK]);
  await expect(page.getByTestId('photo-missing')).toHaveText('Ảnh');
  await expect(page.getByRole('button', { name: 'Bỏ ảnh 1' })).toHaveCount(0);

  await context.setOffline(false);
  await expectDecodedImage(page);
  await expect(page.getByTestId(`photo-fetch-error-${FIELD}`)).toHaveCount(0);
  expect(await storedPhoto(page, sentId)).toEqual(sent);

  // Ảnh chưa gửi vẫn lên server đúng từng byte
  await backToList(page);
  await expect(recordRow(page, unsentName).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 30_000 });
  const res = await request.get(`${API}/attachments/${unsentId}`, { headers: authHeaders(TOKENS.minh) });
  expect(res.status()).toBe(200);
  expect(sha256(Buffer.from(await res.body()))).toBe(unsent?.sha256);
});

test('chưa có ảnh đã tải lên: nút khoá kèm lý do; trình duyệt không có storage.estimate vẫn có khối Dung lượng và nút', async ({
  page,
  context,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByTestId('settings-storage')).toContainText('Đã dùng');
  await expect(cleanupButton(page)).toBeDisabled();
  await expect(page.getByTestId('cleanup-photos-empty')).toHaveText(EMPTY);
  await expect(cleanupButton(page)).toHaveAccessibleDescription(EMPTY);

  await context.addInitScript(() => Reflect.deleteProperty(Object.getPrototypeOf(navigator.storage), 'estimate'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dung lượng' })).toBeVisible();
  await expect(cleanupButton(page)).toBeDisabled();
  await expect(page.getByTestId('cleanup-photos-empty')).toHaveText(EMPTY);
  await expect(page.getByTestId('settings-storage')).toHaveCount(0);
  await expect(page.getByTestId('storage-bar')).toHaveCount(0);
});

/** Đẩy phiếu qua API, đóng vai máy khác: máy trong test không có blob của các ảnh này. */
async function pushRecord(request: APIRequestContext, name: string, photoId: string): Promise<string> {
  const id = crypto.randomUUID();
  const res = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.minh), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 0, deleted: false, data: { householdName: name, housePhoto: [photoId] } },
  });
  expect(res.status()).toBe(201);
  return id;
}

/** Phiếu của minh có một ảnh đã lên server (một chunk, ảnh thử nhỏ hơn 256 KB). */
async function seedUploaded(page: Page, request: APIRequestContext, name: string) {
  const photoId = crypto.randomUUID();
  const image = await smallPhoto(page);
  const recordId = await pushRecord(request, name, photoId);
  const chunk = await request.put(`${API}/attachments/${photoId}/chunks/0`, {
    headers: { ...authHeaders(TOKENS.minh), 'Content-Type': 'application/octet-stream' },
    data: image,
  });
  expect(chunk.status()).toBe(201);
  const done = await request.post(`${API}/attachments/${photoId}/complete`, {
    headers: authHeaders(TOKENS.minh),
    data: { recordId, totalChunks: 1, mimeType: 'image/jpeg', sha256: sha256(image) },
  });
  expect(done.status()).toBe(201);
  return { recordId, photoId, image };
}

test('O11: ảnh tải về để xem cũng dọn được, kể cả ảnh của phiếu đã bị xoá trên server (tombstone)', async ({ page, request }) => {
  await page.goto('/');
  const keptName = uniqueName('Ảnh xem');
  const deletedName = uniqueName('Ảnh phiếu xoá');
  const kept = await seedUploaded(page, request, keptName);
  const gone = await seedUploaded(page, request, deletedName);

  // lan mặc định mở dự án Nông nghiệp (/me sắp theo id), phải đổi sang Y tế xã nơi lan là giám sát viên
  await login(page, 'lan');
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name: /Y tế xã \(demo\)/ }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName('Y tế xã (demo)');
  for (const name of [keptName, deletedName]) {
    await openRecord(page, name);
    await expectDecodedImage(page);
    await backToList(page);
  }
  expect((await storedPhotos(page)).map((p) => p.uploadState)).toEqual(['done', 'done']);

  // Phiếu bị xoá ở máy khác: pull đem tombstone về, dòng ảnh của phiếu đó còn nằm lại trên máy
  const del = await request.put(`${API}/records/${gone.recordId}`, {
    headers: { ...authHeaders(TOKENS.minh), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 1, deleted: true, data: { householdName: deletedName, housePhoto: [gone.photoId] } },
  });
  expect(del.status()).toBe(200);
  await request.delete(`${TEST_API}/stats`);
  await runSyncRounds(page, request);
  await expect(recordRow(page, deletedName)).toHaveCount(0);
  expect(await storedPhoto(page, gone.photoId)).toBeDefined();

  const bytes = kept.image.length + gone.image.length;
  await openSettings(page);
  await cleanupButton(page).click();
  await answerConfirm(page, confirmText(2, bytes), 'Dọn ảnh');
  await expect(page.getByTestId('cleanup-photos-done')).toHaveText(doneText(2, bytes));
  expect(await storedPhotos(page)).toEqual([]);
  expect(await readStore(page, DB, 'outbox')).toEqual([]);

  await backToList(page);
  await expect(recordRow(page, keptName).getByTestId('sync-state')).toHaveText('Đã đồng bộ');
  await openRecord(page, keptName);
  await expectDecodedImage(page);
  expect((await storedPhoto(page, kept.photoId))?.sha256).toBe(sha256(kept.image));
});
