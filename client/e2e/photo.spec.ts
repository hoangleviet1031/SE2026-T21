import { expect, test, type Page } from '@playwright/test';
import { PROJECT, login, makeImage, readStore } from './helpers';

// Nén ảnh khi chọn/chụp (design §4.4, §11.2, ticket TV3-03): cạnh dài ≤ 1600 px, JPEG ≤ 600 KB,
// xoay theo EXIF rồi bỏ EXIF (kể cả GPS, §9). Ảnh thử tạo ngay trong trình duyệt bằng canvas,
// không cần file ảnh nhị phân trong repo.

const DB = `field-survey-p-${PROJECT}`;
const PHOTO_INPUT = 'photo-input-housePhoto';

interface StoredPhoto {
  id: string;
  recordId: string;
  fieldId: string;
  mimeType: string;
  type: string;
  size: number;
  width: number;
  height: number;
  hasExif: boolean;
}

/**
 * Chèn đoạn EXIF (APP1) ngay sau SOI: Orientation và một mục GPS (GPSLatitudeRef = "N"), đủ để
 * kiểm app xoay đúng chiều và không giữ lại EXIF. TIFF big-endian, offset tính từ đầu header TIFF.
 */
function withExif(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 ở offset 8
    0x00, 0x02, // IFD0: 2 mục
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation (SHORT)
    0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, // GPSInfo -> offset 38
    0x00, 0x00, 0x00, 0x00, // hết IFD0
    0x00, 0x01, // GPS IFD: 1 mục
    0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x4e, 0x00, 0x00, 0x00, // GPSLatitudeRef = "N"
    0x00, 0x00, 0x00, 0x00,
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const length = payload.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** Ảnh đang lưu trong bảng attachments, kèm kích thước thật đọc từ blob. */
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
            const rows = req.result as { id: string; recordId: string; fieldId: string; mimeType: string; blob: Blob }[];
            const out: StoredPhoto[] = [];
            for (const row of rows) {
              const bitmap = await createImageBitmap(row.blob);
              const text = new TextDecoder('latin1').decode(await row.blob.arrayBuffer());
              out.push({
                id: row.id,
                recordId: row.recordId,
                fieldId: row.fieldId,
                mimeType: row.mimeType,
                type: row.blob.type,
                size: row.blob.size,
                width: bitmap.width,
                height: bitmap.height,
                hasExif: text.includes('Exif'),
              });
              bitmap.close();
            }
            resolve(out);
          };
        };
      }),
    DB,
  );
}

async function openNewRecord(page: Page, name: string) {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
}

async function choosePhoto(page: Page, buffer: Buffer, name = 'anh.jpg', mimeType = 'image/jpeg') {
  await page.getByTestId(PHOTO_INPUT).setInputFiles({ name, mimeType, buffer });
}

const thumbs = (page: Page) => page.getByTestId('photo-thumb');

test('ảnh 4 MB: lưu bản nén ≤ 600 KB, cạnh dài 1600, JPEG, không còn EXIF/GPS', async ({ page }) => {
  await openNewRecord(page, 'Ảnh lớn');
  const original = withExif(await makeImage(page, { width: 4000, height: 3000, type: 'image/jpeg', quality: 0.95, texture: true }), 1);
  expect(original.length).toBeGreaterThanOrEqual(4 * 1024 * 1024);
  expect(original.includes('Exif')).toBe(true);

  await choosePhoto(page, original);
  await expect(thumbs(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByRole('img', { name: 'Ảnh 1' })).toBeVisible();

  const [photo, ...rest] = await storedPhotos(page);
  expect(rest).toEqual([]);
  expect(photo).toMatchObject({ fieldId: 'housePhoto', mimeType: 'image/jpeg', type: 'image/jpeg', hasExif: false });
  expect(photo?.size).toBeLessThanOrEqual(600 * 1024);
  expect({ width: photo?.width, height: photo?.height }).toEqual({ width: 1600, height: 1200 });
});

test('xoay đúng chiều theo EXIF Orientation trước khi bỏ EXIF', async ({ page }) => {
  await openNewRecord(page, 'Ảnh xoay');
  // Orientation 6: ảnh lưu nằm ngang 400×200 nhưng phải hiển thị xoay 90°, tức 200×400.
  await choosePhoto(page, withExif(await makeImage(page, { width: 400, height: 200, type: 'image/jpeg', quality: 0.9 }), 6));
  await expect(thumbs(page)).toHaveCount(1, { timeout: 10_000 });

  const [photo] = await storedPhotos(page);
  expect({ width: photo?.width, height: photo?.height, hasExif: photo?.hasExif }).toEqual({
    width: 200,
    height: 400,
    hasExif: false,
  });
});

test('ảnh nhỏ PNG vẫn chuyển sang JPEG, giữ nguyên kích thước', async ({ page }) => {
  await openNewRecord(page, 'Ảnh nhỏ');
  await choosePhoto(page, await makeImage(page, { width: 300, height: 200, type: 'image/png' }), 'nho.png', 'image/png');
  await expect(thumbs(page)).toHaveCount(1, { timeout: 10_000 });

  const [photo] = await storedPhotos(page);
  expect(photo).toMatchObject({ type: 'image/jpeg', mimeType: 'image/jpeg', width: 300, height: 200 });
});

test('bỏ ảnh khỏi trường: phiếu chỉ còn ảnh giữ lại, blob của ảnh bỏ vẫn trên máy (§5.6)', async ({ page }) => {
  const name = 'Hai ảnh';
  await openNewRecord(page, name);
  const image = await makeImage(page, { width: 320, height: 240, type: 'image/jpeg', quality: 0.9 });
  await choosePhoto(page, image, 'a.jpg');
  await expect(thumbs(page)).toHaveCount(1, { timeout: 10_000 });
  const firstId = (await storedPhotos(page))[0]?.id;
  await choosePhoto(page, image, 'b.jpg');
  await expect(thumbs(page)).toHaveCount(2, { timeout: 10_000 });
  const secondId = (await storedPhotos(page)).map((p) => p.id).find((id) => id !== firstId);

  await page.getByRole('button', { name: 'Bỏ ảnh 1' }).click();
  await expect(thumbs(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();

  const records = (await readStore(page, DB, 'records')) as { data: { householdName?: string; housePhoto?: string[] } }[];
  const saved = records.find((r) => r.data.householdName === name);
  expect(secondId).toBeDefined();
  expect(saved?.data.housePhoto).toEqual([secondId]);
  // Bỏ ảnh chỉ bỏ id khỏi trường: cả hai blob vẫn còn trên máy.
  expect((await storedPhotos(page)).map((p) => p.id).sort()).toEqual([firstId, secondId].sort());
});

test('file không đọc được: báo lỗi, không lưu gì', async ({ page }) => {
  await openNewRecord(page, 'File hỏng');
  await choosePhoto(page, Buffer.from('đây không phải ảnh'), 'hong.jpg');
  await expect(page.getByTestId('photo-error-housePhoto')).toHaveText(
    '⚠ Không đọc được ảnh này. Hãy chụp lại hoặc chọn ảnh JPEG/PNG',
    { timeout: 10_000 },
  );
  await expect(thumbs(page)).toHaveCount(0);
  expect(await storedPhotos(page)).toEqual([]);
});
