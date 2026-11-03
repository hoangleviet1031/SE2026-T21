import { createHash } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { API, PROJECT, TOKENS, answerConfirm, authHeaders, databaseNames, login, makeImage, readStore } from './helpers';

// O9 (design §5.6, §8; ui.md màn hình 4; requirements US-03): mở phiếu máy khác tạo thì tải ảnh về để xem,
// ô ảnh vẫn chỉ đọc IndexedDB. Ảnh tải về là `done`: không upload lại, không đổi nhãn phiếu, không tạo op.
// minh là điều tra viên, lan là giám sát viên ở dự án Y tế xã.

const DB = `field-survey-p-${PROJECT}`;
const TEST_API = 'http://localhost:3001/api/__test';
const FIELD = 'housePhoto';
const NEED_NETWORK = '⚠ Cần kết nối để xem ảnh này';
const NOT_UPLOADED = '⚠ Ảnh chưa được tải lên';
const SERVER_ERROR = '⚠ Máy chủ đang lỗi, thử lại sau';

test.beforeEach(async ({ request }) => {
  await request.delete(`${TEST_API}/faults`);
  await request.delete(`${TEST_API}/stats`);
});
test.afterEach(async ({ request }) => {
  await request.delete(`${TEST_API}/faults`);
});

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const uniqueName = (prefix: string) => `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
const smallPhoto = (page: Page) => makeImage(page, { width: 320, height: 240, type: 'image/jpeg', quality: 0.9 });

/** Đẩy phiếu qua API, đóng vai máy khác: máy trong test không có blob của các ảnh này. */
async function pushRecord(request: APIRequestContext, token: string, name: string, photoIds: string[]): Promise<string> {
  const id = crypto.randomUUID();
  const res = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(token), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 0, deleted: false, data: { householdName: name, housePhoto: photoIds } },
  });
  expect(res.status()).toBe(201);
  return id;
}

/** Upload một ảnh một chunk lên server như máy tạo phiếu (ảnh thử nhỏ hơn 256 KB). */
async function uploadPhoto(request: APIRequestContext, token: string, recordId: string, photoId: string, image: Buffer) {
  const chunk = await request.put(`${API}/attachments/${photoId}/chunks/0`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/octet-stream' },
    data: image,
  });
  expect(chunk.status()).toBe(201);
  const done = await request.post(`${API}/attachments/${photoId}/complete`, {
    headers: authHeaders(token),
    data: { recordId, totalChunks: 1, mimeType: 'image/jpeg', sha256: sha256(image) },
  });
  expect(done.status()).toBe(201);
}

/** Phiếu của minh có ảnh đã lên server. Trả id ảnh và bytes để so với blob tải về. */
async function seedUploaded(page: Page, request: APIRequestContext, name: string) {
  const photoId = crypto.randomUUID();
  const image = await smallPhoto(page);
  const recordId = await pushRecord(request, TOKENS.minh, name, [photoId]);
  await uploadPhoto(request, TOKENS.minh, recordId, photoId, image);
  await request.delete(`${TEST_API}/stats`);
  return { recordId, photoId, image };
}

/** lan mặc định mở dự án Nông nghiệp (/me sắp theo id), phải đổi sang Y tế xã nơi lan là giám sát viên. */
async function openAsSupervisor(page: Page) {
  await login(page, 'lan');
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name: /Y tế xã \(demo\)/ }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName('Y tế xã (demo)');
}

const recordRow = (page: Page, name: string) => page.getByTestId('records').getByRole('listitem').filter({ hasText: name });

async function openRecord(page: Page, name: string) {
  await recordRow(page, name).getByRole('link', { name }).click({ timeout: 20_000 });
  await expect(page.getByTestId('record-form')).toBeVisible();
}

const backToList = (page: Page) => page.getByRole('link', { name: '← Quay lại' }).click();
const thumb = (page: Page) => page.getByTestId('photo-thumb');
const removeButton = (page: Page) => page.getByRole('button', { name: 'Bỏ ảnh 1' });
const failures = (page: Page) => page.getByTestId(`photo-fetch-error-${FIELD}`);
const fetchStatus = (page: Page) => page.getByTestId(`photo-fetch-status-${FIELD}`);

/** Ảnh hiện thật: thẻ img đã giải mã được blob, không chỉ có thẻ. */
async function expectDecodedImage(page: Page, nth = 0) {
  const img = thumb(page).nth(nth).locator('img');
  await expect(img).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
}

interface StoredRow {
  uploadState: string;
  mimeType: string;
  fieldId: string;
  recordId: string;
  uploadedChunks: number[];
  hasCreatedAt: boolean;
  hasNextAttemptAt: boolean;
  sha256: string;
}

/** Dòng ảnh trên máy, đọc bằng API gốc; `undefined` khi chưa có. */
function storedRow(page: Page, id: string): Promise<StoredRow | undefined> {
  return page.evaluate(
    ({ dbName, id }) =>
      new Promise<StoredRow | undefined>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('attachments', 'readonly').objectStore('attachments').get(id);
          req.onerror = () => reject(req.error);
          req.onsuccess = async () => {
            open.result.close();
            const row = req.result as (Omit<StoredRow, 'sha256'> & { blob: Blob; createdAt?: number; nextAttemptAt?: number }) | undefined;
            if (!row) return resolve(undefined);
            const digest = await crypto.subtle.digest('SHA-256', await row.blob.arrayBuffer());
            resolve({
              uploadState: row.uploadState,
              mimeType: row.mimeType,
              fieldId: row.fieldId,
              recordId: row.recordId,
              uploadedChunks: row.uploadedChunks,
              hasCreatedAt: row.createdAt !== undefined,
              hasNextAttemptAt: row.nextAttemptAt !== undefined,
              sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''),
            });
          };
        };
      }),
    { dbName: DB, id },
  );
}

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

/** Mọi request chuyển ảnh lên server: `status`, `chunks`, `complete`. */
const uploadCalls = (log: LoggedRequest[], photoId: string) =>
  log.filter((r) => new RegExp(`/attachments/${photoId}/(status|chunks/\\d+|complete)$`).test(r.path));

const recordPuts = (log: LoggedRequest[], recordId: string) =>
  log.filter((r) => r.method === 'PUT' && r.path.endsWith(`/records/${recordId}`));

/** Kích thêm `rounds` vòng đồng bộ rồi chờ server nhận đủ lượt pull: thay cho chờ cứng 30 s giữa hai vòng. */
async function runSyncRounds(page: Page, request: APIRequestContext, rounds = 2) {
  const pulls = async () => (await requestLog(request)).filter((r) => r.method === 'GET' && r.path.endsWith('/records')).length;
  for (let i = 0; i < rounds; i++) {
    const before = await pulls();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(pulls, { timeout: 15_000 }).toBeGreaterThan(before);
  }
}

test('O9: giám sát viên mở phiếu máy khác tạo: thấy ảnh thật, nhãn "Đã đồng bộ", không upload lại, không có op, đăng xuất được', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const name = uniqueName('Ảnh O9');
  const { recordId, photoId, image } = await seedUploaded(page, request, name);
  await openAsSupervisor(page);
  await openRecord(page, name);

  await expectDecodedImage(page);
  await expect(page.getByRole('img', { name: 'Ảnh 1' })).toBeVisible();
  await expect(removeButton(page)).toBeVisible();
  await expect(fetchStatus(page)).toHaveText('');
  await expect(failures(page)).toHaveCount(0);
  expect(await storedRow(page, photoId)).toEqual({
    uploadState: 'done',
    mimeType: 'image/jpeg',
    fieldId: FIELD,
    recordId,
    uploadedChunks: [],
    hasCreatedAt: false,
    hasNextAttemptAt: false,
    sha256: sha256(image),
  });
  await expect(page.getByTestId('record-state')).toHaveText('Đã đồng bộ');

  const recordsBefore = (await readStore(page, DB, 'records')) as { id: string; data: unknown; baseVersion: number }[];
  await runSyncRounds(page, request);
  const log = await requestLog(request);
  expect(downloads(log, photoId).map((r) => r.status)).toEqual([200]);
  expect(uploadCalls(log, photoId)).toEqual([]);
  expect(recordPuts(log, recordId)).toEqual([]);
  expect(await readStore(page, DB, 'outbox')).toEqual([]);
  const recordsAfter = (await readStore(page, DB, 'records')) as { id: string; data: unknown; baseVersion: number; syncState: string }[];
  const before = recordsBefore.find((r) => r.id === recordId);
  const after = recordsAfter.find((r) => r.id === recordId);
  expect(after?.data).toEqual(before?.data);
  expect(after?.baseVersion).toBe(before?.baseVersion);
  expect(after?.syncState).toBe('synced');

  await backToList(page);
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ');

  // Ảnh tải về không phải dữ liệu chưa gửi (design §5.6): đăng xuất không bị chặn
  await page.goto('/#/settings');
  await expect(page.getByTestId('logout-blocked')).toHaveCount(0);
  await page.getByTestId('logout-button').click();
  await answerConfirm(page, 'Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.', 'Đăng xuất');
  await expect(page.getByTestId('login-username')).toBeVisible();
  expect(await databaseNames(page)).not.toContain(DB);
});

test('O9: đã tải một lần thì mở lại khi offline vẫn thấy ảnh, kể cả sau khi tải lại trang', async ({ page, context, request }) => {
  await page.goto('/');
  const name = uniqueName('Ảnh offline');
  const { photoId } = await seedUploaded(page, request, name);
  await openAsSupervisor(page);
  await openRecord(page, name);
  await expectDecodedImage(page);
  await backToList(page);
  // Chờ SW nắm trang để tải lại được khi offline (như offline.spec.ts)
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');
  await page.reload();
  await openRecord(page, name);
  await expectDecodedImage(page);
  await expect(failures(page)).toHaveCount(0);
  await context.setOffline(false);
  expect(downloads(await requestLog(request), photoId)).toHaveLength(1);
});

test('O9: lần đầu offline báo cần mạng, không gọi request; có mạng lại tự tải', async ({ page, context, request }) => {
  await page.goto('/');
  const name = uniqueName('Ảnh chưa có mạng');
  const { photoId } = await seedUploaded(page, request, name);
  await openAsSupervisor(page);
  await expect(recordRow(page, name)).toHaveCount(1, { timeout: 20_000 });
  await context.setOffline(true);
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');

  await openRecord(page, name);
  await expect(failures(page)).toHaveText([NEED_NETWORK]);
  await expect(page.getByTestId('photo-missing')).toHaveText('Ảnh');
  await expect(removeButton(page)).toHaveCount(0);
  expect(await storedRow(page, photoId)).toBeUndefined();
  expect(downloads(await requestLog(request), photoId)).toEqual([]);

  await context.setOffline(false);
  await expectDecodedImage(page);
  await expect(failures(page)).toHaveCount(0);
  await expect(removeButton(page)).toBeVisible();
  expect(downloads(await requestLog(request), photoId)).toHaveLength(1);
});

test('O9: rời phiếu lúc offline, có mạng mở lại thì tải được', async ({ page, context, request }) => {
  await page.goto('/');
  const name = uniqueName('Ảnh mở lại');
  await seedUploaded(page, request, name);
  await openAsSupervisor(page);
  await expect(recordRow(page, name)).toHaveCount(1, { timeout: 20_000 });
  await context.setOffline(true);
  await openRecord(page, name);
  await expect(failures(page)).toHaveText([NEED_NETWORK]);
  await backToList(page);

  await context.setOffline(false);
  await openRecord(page, name);
  await expectDecodedImage(page);
});

test('O9: 404 báo một dòng cho nhiều ảnh, ô đọc được tên, không gọi lặp, phiếu không đổi, không tràn ở 360px', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const name = uniqueName('Ảnh chưa lên');
  const missing = [crypto.randomUUID(), crypto.randomUUID()];
  const recordId = await pushRecord(request, TOKENS.minh, name, missing);
  await request.delete(`${TEST_API}/stats`);
  await openAsSupervisor(page);
  await openRecord(page, name);

  await expect(failures(page)).toHaveText([NOT_UPLOADED]);
  await expect(page.getByRole('alert').filter({ hasText: 'Ảnh chưa được tải lên' })).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Ảnh 1' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Ảnh 2' })).toBeVisible();
  await expect(removeButton(page)).toHaveCount(0);
  await expect(fetchStatus(page)).toHaveText('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Đánh dấu thẻ câu lỗi: liveQuery chạy lại mà DOM đổi thì role="alert" sẽ báo lặp
  await failures(page).evaluate((el) => el.setAttribute('data-e2e-mark', '1'));

  await runSyncRounds(page, request);
  // Thêm ảnh của máy này làm danh sách đổi và liveQuery chạy lại
  await page.getByTestId(`photo-input-${FIELD}`).setInputFiles({ name: 'moi.jpg', mimeType: 'image/jpeg', buffer: await smallPhoto(page) });
  await expectDecodedImage(page, 2);
  await expect(failures(page)).toHaveAttribute('data-e2e-mark', '1');

  const log = await requestLog(request);
  for (const id of missing) expect(downloads(log, id).map((r) => r.status)).toEqual([404]);
  for (const id of missing) expect(await storedRow(page, id)).toBeUndefined();
  expect(recordPuts(log, recordId)).toEqual([]);
  expect(await readStore(page, DB, 'outbox')).toEqual([]);
});

test('O9: 5xx báo lỗi máy chủ, không tự thử lại; mở lại phiếu sau khi hết lỗi thì tải được', async ({ page, request }) => {
  await page.goto('/');
  const name = uniqueName('Ảnh lỗi 500');
  const { recordId, photoId } = await seedUploaded(page, request, name);
  await request.post(`${TEST_API}/faults`, { data: { mode: '500', count: 1000, match: `/attachments/${photoId}` } });
  await openAsSupervisor(page);
  await openRecord(page, name);

  await expect(failures(page)).toHaveText([SERVER_ERROR]);
  await runSyncRounds(page, request);
  const log = await requestLog(request);
  expect(downloads(log, photoId).map((r) => r.status)).toEqual([500]);
  expect(recordPuts(log, recordId)).toEqual([]);
  expect(await storedRow(page, photoId)).toBeUndefined();
  await expect(page.getByTestId('record-state')).toHaveText('Đã đồng bộ');

  await request.delete(`${TEST_API}/faults`);
  await backToList(page);
  await openRecord(page, name);
  await expectDecodedImage(page);
});

test('O9: điều tra viên không tải được ảnh ngoài phạm vi: báo như ảnh chưa lên, không có blob', async ({ page, request }) => {
  await page.goto('/');
  // Ảnh thuộc phiếu của lan; minh tự đẩy phiếu của mình trỏ tới id ảnh đó
  const secretId = crypto.randomUUID();
  const lanRecord = await pushRecord(request, TOKENS.lan, uniqueName('Phiếu của lan'), [secretId]);
  await uploadPhoto(request, TOKENS.lan, lanRecord, secretId, await smallPhoto(page));
  const name = uniqueName('Phiếu của minh');
  await pushRecord(request, TOKENS.minh, name, [secretId]);
  await request.delete(`${TEST_API}/stats`);

  await login(page, 'minh');
  await openRecord(page, name);
  await expect(failures(page)).toHaveText([NOT_UPLOADED]);
  expect(downloads(await requestLog(request), secretId).map((r) => r.status)).toEqual([404]);
  expect(await storedRow(page, secretId)).toBeUndefined();
});

test('O9: bỏ ảnh đã tải rồi Lưu thì tạo op bình thường, blob giữ trên máy', async ({ page, request }) => {
  await page.goto('/');
  const name = uniqueName('Ảnh bỏ');
  const { recordId, photoId } = await seedUploaded(page, request, name);
  await openAsSupervisor(page);
  await openRecord(page, name);
  await expectDecodedImage(page);

  await removeButton(page).click();
  await expect(thumb(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 20_000 });

  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.lan) })).json();
  const saved = pulled.records.find((r: { id: string }) => r.id === recordId);
  expect(saved.data.housePhoto).toEqual([]);
  expect(saved.version).toBe(2);
  expect((await storedRow(page, photoId))?.uploadState).toBe('done');
});

test('O9: bộ nhớ đầy lúc lưu ảnh tải về: báo câu §8, không có dòng', async ({ page, request }) => {
  await page.goto('/');
  const name = uniqueName('Ảnh đầy');
  const { photoId } = await seedUploaded(page, request, name);
  await openAsSupervisor(page);
  await expect(recordRow(page, name)).toHaveCount(1, { timeout: 20_000 });
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      if (this.name === 'attachments') throw new DOMException('đầy', 'QuotaExceededError');
      return add.apply(this, args);
    };
  });

  await openRecord(page, name);
  await expect(failures(page)).toHaveText(['⚠ Bộ nhớ đầy: đồng bộ rồi dọn ảnh đã tải lên']);
  await expect(removeButton(page)).toHaveCount(0);
  expect(await storedRow(page, photoId)).toBeUndefined();
});

test('O9: phiếu xung đột, chỉ đọc: vẫn tải và hiện ảnh, không có op', async ({ page, context, request }) => {
  await page.goto('/');
  const name = uniqueName('Ảnh xung đột');
  const { recordId, photoId } = await seedUploaded(page, request, name);
  await openAsSupervisor(page);
  await expect(recordRow(page, name)).toHaveCount(1, { timeout: 20_000 });

  // lan sửa khi offline, trong lúc đó minh sửa cùng trường trên server
  await context.setOffline(true);
  await openRecord(page, name);
  const nameInput = page.locator('input[name=householdName]');
  await nameInput.fill(`${name} máy lan`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const put = await request.put(`${API}/records/${recordId}`, {
    headers: { ...authHeaders(TOKENS.minh), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 1, deleted: false, data: { householdName: `${name} máy minh`, housePhoto: [photoId] } },
  });
  expect(put.status()).toBe(200);
  await context.setOffline(false);
  await expect(recordRow(page, name).getByRole('link', { name: 'Cần xử lý xung đột' })).toBeVisible({ timeout: 20_000 });

  await recordRow(page, name).getByRole('link', { name }).click();
  await expect(page.getByTestId('record-in-conflict')).toBeVisible();
  await expectDecodedImage(page);
  expect((await storedRow(page, photoId))?.uploadState).toBe('done');
  expect(await readStore(page, DB, 'outbox')).toEqual([]);
  await expect(page.getByTestId('record-state')).toHaveText('Cần xử lý xung đột');
});

test('O9: ảnh chờ gửi của chính máy này không bị tải đè; mở lại phiếu không gọi tải về', async ({ page, request }) => {
  await page.goto('/');
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  // Chặn upload để ảnh còn `pending`/`uploading` sau khi phiếu đã lên
  await request.post(`${TEST_API}/faults`, { data: { mode: '500', count: 1000, match: '/attachments' } });
  const name = uniqueName('Ảnh của máy này');
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByTestId(`photo-input-${FIELD}`).setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await smallPhoto(page) });
  await expectDecodedImage(page);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đang tải ảnh (1)', { timeout: 20_000 });

  const records = (await readStore(page, DB, 'records')) as { data: { householdName?: string; housePhoto?: string[] } }[];
  const photoId = records.find((r) => r.data.householdName === name)?.data.housePhoto?.[0] ?? '';
  const rowBefore = await storedRow(page, photoId);

  await openRecord(page, name);
  await expectDecodedImage(page);
  await expect(removeButton(page)).toBeVisible();
  await expect(failures(page)).toHaveCount(0);
  const rowAfter = await storedRow(page, photoId);
  expect(rowAfter?.sha256).toBe(rowBefore?.sha256);
  expect(rowAfter?.uploadState).not.toBe('done');
  expect(downloads(await requestLog(request), photoId)).toEqual([]);
});

// page.route không chặn được request đi qua service worker; các ca này chạy online nên tắt SW như api-errors.spec.ts
test.describe('response giả', () => {
  test.use({ serviceWorkers: 'block' });

  /** Giữ response tải ảnh tới khi gọi `release`, để thấy trạng thái đang tải. Đếm số request thật sự gửi đi. */
  async function holdDownload(page: Page, photoId: string, image: Buffer) {
    let calls = 0;
    let route: Route | undefined;
    await page.route(`**/api/projects/*/attachments/${photoId}`, (r) => {
      calls += 1;
      route = r;
    });
    return {
      calls: () => calls,
      release: async () => {
        await expect.poll(() => route !== undefined).toBe(true);
        await route?.fulfill({ status: 200, contentType: 'image/jpeg', body: image });
      },
    };
  }

  test('O9: đang tải: một vùng status cho cả trường, ô đọc được tên, không ×, không tràn 360px; mở lại lúc đang tải không gọi thêm', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    const name = uniqueName('Ảnh đang tải');
    const { photoId, image } = await seedUploaded(page, request, name);
    const held = await holdDownload(page, photoId, image);
    await openAsSupervisor(page);
    await openRecord(page, name);

    await expect(page.getByTestId('photo-missing')).toHaveText('Đang tải…');
    await expect(page.getByRole('img', { name: 'Ảnh 1' })).toBeVisible();
    await expect(fetchStatus(page)).toHaveText('Đang tải ảnh…');
    await expect(page.getByTestId('photo-thumb').getByRole('status')).toHaveCount(0);
    await expect(removeButton(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await expect(page.getByTestId('record-state')).toHaveText('Đã đồng bộ');

    await backToList(page);
    await openRecord(page, name);
    await held.release();
    await expectDecodedImage(page);
    await expect(fetchStatus(page)).toHaveText('');
    expect(held.calls()).toBe(1);
  });

  test('O9: 200 nhưng không phải ảnh (captive portal): không lưu, báo lỗi máy chủ', async ({ page, request }) => {
    await page.goto('/');
    const name = uniqueName('Ảnh captive');
    const { photoId } = await seedUploaded(page, request, name);
    await page.route(`**/api/projects/*/attachments/${photoId}`, (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<html>Đăng nhập wifi</html>' }),
    );
    await openAsSupervisor(page);
    await openRecord(page, name);
    await expect(failures(page)).toHaveText([SERVER_ERROR]);
    expect(await storedRow(page, photoId)).toBeUndefined();
  });

  test('O9: kết nối bị cắt giữa lúc tải: báo cần mạng, không lưu', async ({ page, request }) => {
    await page.goto('/');
    const name = uniqueName('Ảnh đứt');
    const { photoId } = await seedUploaded(page, request, name);
    await page.route(`**/api/projects/*/attachments/${photoId}`, (r) => r.abort('connectionreset'));
    await openAsSupervisor(page);
    await openRecord(page, name);
    await expect(failures(page)).toHaveText([NEED_NETWORK]);
    expect(await storedRow(page, photoId)).toBeUndefined();
  });

  test('O9: 403 not_member báo không còn thuộc tổ chức, không lưu', async ({ page, request }) => {
    await page.goto('/');
    const name = uniqueName('Ảnh rút');
    const { photoId } = await seedUploaded(page, request, name);
    await page.route(`**/api/projects/*/attachments/${photoId}`, (r) =>
      r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'not_member' }) }),
    );
    await openAsSupervisor(page);
    await openRecord(page, name);
    await expect(failures(page)).toHaveText(['⚠ Bạn không còn thuộc tổ chức này']);
    expect(await storedRow(page, photoId)).toBeUndefined();
  });

  test('O9: 401 về màn hình Đăng nhập kèm câu hết phiên', async ({ page, request }) => {
    await page.goto('/');
    const name = uniqueName('Ảnh hết phiên');
    const { photoId } = await seedUploaded(page, request, name);
    await page.route(`**/api/projects/*/attachments/${photoId}`, (r) =>
      r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) }),
    );
    await openAsSupervisor(page);
    // Không chờ form như openRecord: 401 có thể đưa về Đăng nhập ngay khi form vừa hiện
    await recordRow(page, name).getByRole('link', { name }).click({ timeout: 20_000 });
    await expect(page.getByTestId('login-username')).toBeVisible();
    await expect(page.getByText('Phiên đăng nhập hết hạn, đăng nhập lại')).toBeVisible();
    expect(await databaseNames(page)).toContain(DB);
  });

  test('O9: phiếu bị xoá lúc đang tải: không để lại dòng mồ côi', async ({ page, request }) => {
    await page.goto('/');
    const name = uniqueName('Ảnh phiếu xoá');
    const { photoId, image } = await seedUploaded(page, request, name);
    const held = await holdDownload(page, photoId, image);
    await openAsSupervisor(page);
    await openRecord(page, name);
    await expect(fetchStatus(page)).toHaveText('Đang tải ảnh…');

    await page.getByRole('button', { name: 'Xoá phiếu' }).click();
    await answerConfirm(page, 'Xoá phiếu này? Không hoàn tác được trên máy.', 'Xoá');
    await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
    await held.release();
    // Đồng bộ xong thì op xoá hết, phiếu biến khỏi máy
    await expect.poll(async () => readStore(page, DB, 'outbox'), { timeout: 20_000 }).toEqual([]);
    expect(await storedRow(page, photoId)).toBeUndefined();
  });

  test('O9: đăng xuất lúc đang tải: CSDL đã xoá không bị tạo lại', async ({ page, request }) => {
    await page.goto('/');
    const name = uniqueName('Ảnh đăng xuất');
    const { photoId, image } = await seedUploaded(page, request, name);
    const held = await holdDownload(page, photoId, image);
    await openAsSupervisor(page);
    await openRecord(page, name);
    await expect(fetchStatus(page)).toHaveText('Đang tải ảnh…');

    await page.goto('/#/settings');
    await page.getByTestId('logout-button').click();
    await answerConfirm(page, 'Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.', 'Đăng xuất');
    await expect(page.getByTestId('login-username')).toBeVisible();
    const finished = page.waitForEvent('requestfinished', (r) => r.url().endsWith(photoId));
    await held.release();
    // Chờ trang nhận xong response rồi thêm một vòng sự kiện, để lần ghi (nếu có) chạy trước khi kiểm
    await finished;
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(await databaseNames(page)).not.toContain(DB);
  });
});
