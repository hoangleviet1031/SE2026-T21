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
const LOGIN_API = 'http://localhost:3001/api/auth/login';

/** Header xác thực cho request gọi thẳng API (đóng vai người dùng khác). */
export const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Mở app và đăng nhập bằng tên + mật khẩu (ADR 0003 §1). Mỗi test có context mới nên luôn phải đăng nhập.
 * Màn hình tên + mật khẩu (TV1-14) chưa có: lấy token phiên qua /api/auth/login rồi nhập vào màn hình
 * nhập mã hiện tại. TV1-14 xong thì chỉ sửa thân hàm này, các spec giữ nguyên.
 */
export async function login(page: Page, username = 'minh', password = DEMO_PASSWORD) {
  const res = await page.request.post(LOGIN_API, { data: { username, password } });
  expect(res.status(), `đăng nhập ${username}`).toBe(200);
  const { token } = (await res.json()) as { token: string };
  await page.goto('/');
  await page.getByTestId('login-token').fill(token);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByTestId('login-token')).toHaveCount(0);
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
  role: 'surveyor' | 'supervisor' | null,
) {
  const url = `http://localhost:3001/api/__test/memberships/${projectId}/${userId}`;
  const res = role ? await request.put(url, { data: { role } }) : await request.delete(url);
  expect(res.ok()).toBe(true);
}
