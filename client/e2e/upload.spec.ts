import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { API, PROJECT, TOKENS, authHeaders, login, makeImage, readStore } from './helpers';

// Hàng đợi upload ảnh (design §5.6; ticket TV3-06, TV3-10). Ca O3, R4 ở design §10.1:
// - O3: phiếu có ảnh tạo khi offline, có mạng thì ảnh lên đủ, nhãn chỉ thành "Đã đồng bộ" khi ảnh xong.
// - R4: mất mạng giữa lúc upload ảnh thì tiếp tục từ chunk thiếu.

const DB = `field-survey-p-${PROJECT}`;
const TEST_API = 'http://localhost:3001/api/__test';
const CHUNK_BYTES = 256 * 1024;

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function setFault(request: APIRequestContext, body: object) {
  return request.post(`${TEST_API}/faults`, { data: body });
}

interface LoggedRequest {
  method: string;
  path: string;
  status: number;
}

async function requestLog(request: APIRequestContext): Promise<LoggedRequest[]> {
  return ((await (await request.get(`${TEST_API}/stats`)).json()) as { requests: LoggedRequest[] }).requests;
}

// Bộ tiêm lỗi và nhật ký là trạng thái chung của server E2E: dọn trước và sau mỗi ca.
test.beforeEach(async ({ request }) => {
  await request.delete(`${TEST_API}/faults`);
  await request.delete(`${TEST_API}/stats`);
});
test.afterEach(async ({ request }) => {
  await request.delete(`${TEST_API}/faults`);
});

/** Bytes của blob ảnh đang lưu trên máy, đọc thẳng IndexedDB. */
async function storedBytes(page: Page, id: string): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ dbName, id }) =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('attachments', 'readonly').objectStore('attachments').get(id);
          req.onerror = () => reject(req.error);
          req.onsuccess = async () => {
            open.result.close();
            const bytes = new Uint8Array(await (req.result as { blob: Blob }).blob.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            resolve(btoa(binary));
          };
        };
      }),
    { dbName: DB, id },
  );
  return Buffer.from(base64, 'base64');
}

/** Thay blob của ảnh bằng một tệp không phải ảnh, như ảnh bị hỏng trên máy. Server sẽ trả 415. */
async function corruptPhoto(page: Page, id: string): Promise<void> {
  await page.evaluate(
    ({ dbName, id }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('attachments', 'readwrite');
          const store = tx.objectStore('attachments');
          const req = store.get(id);
          req.onsuccess = () => store.put({ ...req.result, blob: new Blob(['khong phai anh'], { type: 'image/jpeg' }) });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { dbName: DB, id },
  );
}

/** Mở trang tạo phiếu, nhập tên, chọn lần lượt các ảnh, bấm Lưu. Trả dòng phiếu và id ảnh theo thứ tự chọn. */
async function createRecordWithPhotos(page: Page, name: string, photos: Buffer[]) {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  for (const [i, photo] of photos.entries()) {
    await page.getByTestId('photo-input-housePhoto').setInputFiles({ name: `anh-${i}.jpg`, mimeType: 'image/jpeg', buffer: photo });
    await expect(page.getByTestId('photo-thumb')).toHaveCount(i + 1, { timeout: 15_000 });
  }
  await page.getByRole('button', { name: 'Lưu' }).click();
  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  const records = (await readStore(page, DB, 'records')) as { data: { householdName?: string; housePhoto?: string[] } }[];
  const photoIds = records.find((r) => r.data.householdName === name)?.data.housePhoto ?? [];
  expect(photoIds).toHaveLength(photos.length);
  return { row, photoIds };
}

async function goOffline(page: Page, context: BrowserContext) {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');
}

/** Ảnh trên server khớp từng byte với blob trên máy (SHA-256 như server kiểm lúc complete). */
async function expectOnServer(page: Page, request: APIRequestContext, photoId: string) {
  const res = await request.get(`${API}/attachments/${photoId}`, { headers: authHeaders(TOKENS.minh) });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/jpeg');
  expect(sha256(Buffer.from(await res.body()))).toBe(sha256(await storedBytes(page, photoId)));
}

const smallPhoto = (page: Page) => makeImage(page, { width: 320, height: 240, type: 'image/jpeg', quality: 0.9 });

test('O3: 2 ảnh chụp khi offline lên đủ khi có mạng; nhãn "Đã đồng bộ" chỉ sau khi ảnh xong', async ({
  page,
  context,
  request,
}) => {
  await goOffline(page, context);
  const name = `Ảnh O3 ${Date.now()}`;
  const { row, photoIds } = await createRecordWithPhotos(page, name, [await smallPhoto(page), await smallPhoto(page)]);
  await expect(row.getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  // Chặn upload ảnh (phiếu vẫn lên được) để thấy trạng thái giữa: phiếu đã đồng bộ, ảnh thì chưa.
  await setFault(request, { mode: '500', count: 1000, match: '/attachments' });
  await context.setOffline(false);
  await expect(row.getByTestId('sync-state')).toHaveText('Đang tải ảnh (2)', { timeout: 20_000 });

  await request.delete(`${TEST_API}/faults`);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 30_000 });
  for (const id of photoIds) await expectOnServer(page, request, id);
});

/** Các PUT chunk của một ảnh theo nhật ký server, gom theo chỉ số chunk: danh sách status theo thứ tự gửi. */
function chunkPuts(log: LoggedRequest[], photoId: string): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const r of log) {
    const m = new RegExp(`/attachments/${photoId}/chunks/(\\d+)$`).exec(r.path);
    if (r.method !== 'PUT' || !m) continue;
    const i = Number(m[1]);
    out.set(i, [...(out.get(i) ?? []), r.status]);
  }
  return out;
}

/**
 * Ảnh nhiều chi tiết để sau khi nén vẫn > 256 KB, tức có từ 2 chunk trở lên. Đúng 1600×1200 để app
 * không thu nhỏ (thu nhỏ làm mịn nhiễu hạt, file nén còn dưới một chunk).
 */
const bigPhoto = (page: Page) =>
  makeImage(page, { width: 1600, height: 1200, type: 'image/jpeg', quality: 0.95, texture: true });

async function expectAtLeastTwoChunks(page: Page, photoId: string) {
  const size = (await storedBytes(page, photoId)).length;
  // Ảnh chỉ có 1 chunk thì không có "chunk thứ 2" để cắt: R4 sẽ xanh mà không kiểm gì.
  expect(size, 'ảnh sau nén phải lớn hơn một chunk').toBeGreaterThan(CHUNK_BYTES);
  return Math.ceil(size / CHUNK_BYTES);
}

test('R4: mất kết nối trước khi server ghi chunk thứ 2: gửi tiếp từ chunk thiếu, chunk 0 không gửi lại', async ({
  page,
  request,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await setFault(request, { mode: 'drop-before', count: 1, match: '/attachments', chunkIndex: 1 });

  const { row, photoIds } = await createRecordWithPhotos(page, `Ảnh R4 ${Date.now()}`, [await bigPhoto(page)]);
  const photoId = photoIds[0] ?? '';
  const total = await expectAtLeastTwoChunks(page, photoId);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 30_000 });

  const puts = chunkPuts(await requestLog(request), photoId);
  // Chunk 0 đã lên trước khi mất kết nối: lần thử lại hỏi status và không gửi lại nó.
  expect(puts.get(0)).toEqual([201]);
  // Chunk 1: lần đầu bị cắt (0), lần sau server ghi (201).
  expect(puts.get(1)).toEqual([0, 201]);
  for (let i = 2; i < total; i++) expect(puts.get(i)).toEqual([201]);
  await expectOnServer(page, request, photoId);
});

test('R4: mất kết nối sau khi server đã ghi chunk thứ 2: không gửi lại chunk đó, ảnh vẫn đúng', async ({
  page,
  request,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await setFault(request, { mode: 'drop', count: 1, match: '/attachments', chunkIndex: 1 });

  const { row, photoIds } = await createRecordWithPhotos(page, `Ảnh R4 drop ${Date.now()}`, [await bigPhoto(page)]);
  const photoId = photoIds[0] ?? '';
  const total = await expectAtLeastTwoChunks(page, photoId);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 30_000 });

  const puts = chunkPuts(await requestLog(request), photoId);
  // Server đã ghi chunk 1 nhưng client không nhận được response (0). Hỏi status thấy đã có nên không gửi lại.
  expect(puts.get(0)).toEqual([201]);
  expect(puts.get(1)).toEqual([0]);
  for (let i = 2; i < total; i++) expect(puts.get(i)).toEqual([201]);
  await expectOnServer(page, request, photoId);
});

test('ảnh bị server từ chối (415): "Lỗi ảnh" kèm nút; "Bỏ ảnh này" thì phiếu về "Đã đồng bộ" không còn ảnh', async ({
  page,
  context,
  request,
}) => {
  await goOffline(page, context);
  const name = `Ảnh lỗi ${Date.now()}`;
  const { row, photoIds } = await createRecordWithPhotos(page, name, [await smallPhoto(page)]);
  await expect(page.getByTestId('records').getByRole('listitem').filter({ hasText: name }).getByTestId('sync-state')).toHaveText(
    'Chờ đồng bộ',
  );
  await corruptPhoto(page, photoIds[0] ?? '');

  await context.setOffline(false);
  await expect(row.getByTestId('sync-state')).toHaveText('Lỗi ảnh', { timeout: 20_000 });
  const photoError = row.getByTestId('photo-error');
  await expect(photoError).toContainText('Tệp không phải ảnh JPEG, PNG hoặc WebP');
  await expect(photoError.getByRole('button', { name: 'Thử lại' })).toBeVisible();

  await photoError.getByRole('button', { name: 'Bỏ ảnh này' }).click();
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 20_000 });
  await expect(row.getByTestId('photo-error')).toHaveCount(0);

  const pulled = await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.minh) })).json();
  const saved = pulled.records.find((r: { data: { householdName?: string } }) => r.data.householdName === name);
  expect(saved.data.housePhoto).toEqual([]);
  expect(saved.version).toBe(2);
});
