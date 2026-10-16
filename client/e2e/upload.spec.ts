import { expect, test, type Page } from '@playwright/test';
import { API, PROJECT, TOKENS, authHeaders, login, readStore } from './helpers';

// Hàng đợi upload ảnh (design §5.6, ticket TV3-06). O3 ở design §10.1: phiếu có ảnh tạo khi
// offline, có mạng thì ảnh lên đủ, nhãn chỉ thành "Đã đồng bộ" khi ảnh xong.

const DB = `field-survey-p-${PROJECT}`;

/** JPEG nhỏ vẽ bằng canvas, trả bytes để đưa vào ô chọn ảnh. */
async function smallJpeg(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('không có canvas 2D');
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(40, 40, 120, 80);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) throw new Error('canvas.toBlob trả null');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  return Buffer.from(base64, 'base64');
}

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

/** Tạo phiếu có một ảnh khi đang offline, trả id ảnh và dòng phiếu trong danh sách. */
async function createOfflineRecordWithPhoto(page: Page, context: import('@playwright/test').BrowserContext, name: string) {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  const photo = await smallJpeg(page);
  await context.setOffline(true);
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByTestId('photo-input-housePhoto').setInputFiles({ name: 'nha.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByTestId('photo-thumb')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByTestId('photo-state')).toHaveText('Chờ tải lên');
  await page.getByRole('button', { name: 'Lưu' }).click();

  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
  await expect(row.getByTestId('sync-state')).toHaveText('Chờ đồng bộ');
  const records = (await readStore(page, DB, 'records')) as { data: { householdName?: string; housePhoto?: string[] } }[];
  const photoId = records.find((r) => r.data.householdName === name)?.data.housePhoto?.[0];
  expect(photoId).toBeDefined();
  return { row, photoId: photoId ?? '' };
}

test('O3: ảnh chụp khi offline lên đủ khi có mạng, đúng từng byte; nhãn "Đã đồng bộ" khi ảnh xong', async ({
  page,
  context,
  request,
}) => {
  const name = `Ảnh O3 ${Date.now()}`;
  const { row, photoId } = await createOfflineRecordWithPhoto(page, context, name);

  await context.setOffline(false);
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 20_000 });

  const onServer = await request.get(`${API}/attachments/${photoId}`, { headers: authHeaders(TOKENS.minh) });
  expect(onServer.status()).toBe(200);
  expect(onServer.headers()['content-type']).toBe('image/jpeg');
  expect(Buffer.from(await onServer.body()).equals(await storedBytes(page, photoId))).toBe(true);

  const [stored] = (await readStore(page, DB, 'attachments')).filter((a) => (a as { id: string }).id === photoId) as {
    uploadState: string;
  }[];
  expect(stored?.uploadState).toBe('done');
});

test('ảnh bị server từ chối (415): "Lỗi ảnh" kèm nút; "Bỏ ảnh này" thì phiếu về "Đã đồng bộ" không còn ảnh', async ({
  page,
  context,
  request,
}) => {
  const name = `Ảnh lỗi ${Date.now()}`;
  const { row, photoId } = await createOfflineRecordWithPhoto(page, context, name);
  await corruptPhoto(page, photoId);

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
