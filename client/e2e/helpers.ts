import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Hàm dùng chung cho E2E. Tài khoản, mật khẩu, token và dự án khớp server/src/seedDemo.ts
// (server E2E chạy với SEED_DEMO=1).

export const DEMO_PASSWORD = 'demo-password';
/** Phiên demo cố định do seed tạo, để test gọi API thẳng (đóng vai người khác) không phải đăng nhập. */
export const TOKENS = {
  admin: 'demo-token-admin',
  lan: 'demo-token-lan',
  minh: 'demo-token-minh',
  chu: 'demo-token-chu',
} as const;
export const PROJECT = 'demo-yte';
export const API = `http://localhost:3001/api/projects/${PROJECT}`;

/** Header xác thực cho request gọi thẳng API (đóng vai người dùng khác). */
export const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Mở app và đăng nhập bằng tên + mật khẩu (ADR 0003 §1). Mỗi test có context mới nên luôn phải đăng nhập. */
export async function login(page: Page, username = 'minh', password = DEMO_PASSWORD) {
  await page.goto('/');
  await fillLogin(page, username, password);
  await expect(page.getByTestId('login-username')).toHaveCount(0);
}

/** Điền tab Đăng nhập rồi bấm Tiếp tục, không chờ kết quả. */
export async function fillLogin(page: Page, username: string, password = DEMO_PASSWORD) {
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
}

/** Tên mọi CSDL IndexedDB của origin, đọc bằng API gốc của trình duyệt. */
export function databaseNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''));
}

/** Đọc mọi dòng của một bảng trong CSDL có sẵn (không tạo CSDL mới nếu chưa có). */
export function readStore(page: Page, dbName: string, store: string): Promise<unknown[]> {
  return page.evaluate(
    ({ dbName, store }) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        // CSDL chưa có thì open sẽ tạo mới; huỷ bước nâng cấp để không tạo CSDL rỗng thay app
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => reject(open.error ?? new Error(`chưa có CSDL ${dbName}`));
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(store)) {
            db.close();
            return reject(new Error(`CSDL ${dbName} không có bảng ${store}`));
          }
          const req = db.transaction(store, 'readonly').objectStore(store).getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
        };
      }),
    { dbName, store },
  );
}

/** Ghi một dòng vào bảng có sẵn bằng API gốc. App không thấy thay đổi này cho tới khi tải lại trang. */
export function putRow(page: Page, dbName: string, store: string, row: unknown): Promise<void> {
  return page.evaluate(
    ({ dbName, store, row }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => reject(open.error ?? new Error(`chưa có CSDL ${dbName}`));
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { dbName, store, row },
  );
}

/** Đổi thành viên qua route kiểm thử (server E2E chạy với ENABLE_TEST_ROUTES=1). `null` = rút khỏi dự án. */
export async function setMembership(
  request: APIRequestContext,
  projectId: string,
  userId: string,
  role: 'surveyor' | 'supervisor' | 'owner' | null,
) {
  const url = `http://localhost:3001/api/__test/memberships/${projectId}/${userId}`;
  const res = role ? await request.put(url, { data: { role } }) : await request.delete(url);
  expect(res.ok()).toBe(true);
}

/**
 * Dự án riêng cho một test, chưa có thành viên. Đi qua route kiểm thử vì từ TV2-15 admin không tạo
 * dự án được nữa (tổ chức chỉ tạo khi duyệt yêu cầu, id `p-…` do server sinh); test cần id `b-…` để
 * dự án đứng trước `demo-…` trong /me.
 */
export async function createProject(request: APIRequestContext, projectId: string, name: string) {
  const res = await request.put(`http://localhost:3001/api/__test/projects/${projectId}`, { data: { name } });
  expect(res.ok()).toBe(true);
}

/** Ảnh thử vẽ bằng canvas. `texture` thêm hình và nhiễu hạt mịn để file JPEG nặng như ảnh chụp thật. */
export async function makeImage(
  page: Page,
  opts: { width: number; height: number; type: 'image/jpeg' | 'image/png'; quality?: number; texture?: boolean },
): Promise<Buffer> {
  const base64 = await page.evaluate(async ({ width, height, type, quality, texture }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('không có canvas 2D');
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#2563eb');
    gradient.addColorStop(1, '#f59e0b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    // Mốc nhận chiều ảnh sau khi xoay: góc trên trái màu đỏ.
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, Math.ceil(width / 4), Math.ceil(height / 4));
    if (texture) {
      for (let i = 0; i < 2000; i++) {
        ctx.fillStyle = `hsla(${Math.random() * 360}, 60%, 50%, 0.35)`;
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height, 10 + Math.random() * 120, 0, Math.PI * 2);
        ctx.fill();
      }
      const pixels = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 24;
        pixels.data[i] = (pixels.data[i] ?? 0) + n;
        pixels.data[i + 1] = (pixels.data[i + 1] ?? 0) + n;
        pixels.data[i + 2] = (pixels.data[i + 2] ?? 0) + n;
      }
      ctx.putImageData(pixels, 0, 0);
    }
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    if (!blob) throw new Error('canvas.toBlob trả null');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }, opts);
  return Buffer.from(base64, 'base64');
}

/**
 * Trả lời hộp xác nhận trong app (`ConfirmDialog`, thay `window.confirm`): kiểm đúng câu hỏi rồi bấm
 * nút có nhãn `answer`, hoặc nhấn Esc (tương đương Huỷ). Hộp đóng sau khi trả lời.
 */
export async function answerConfirm(page: Page, message: string, answer: string | 'Esc') {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(message, { exact: true })).toBeVisible();
  if (answer === 'Esc') await page.keyboard.press('Escape');
  else await dialog.getByRole('button', { name: answer, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
