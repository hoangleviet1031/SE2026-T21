import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { DEMO_PASSWORD, authHeaders, databaseNames, login } from './helpers';

// TV1-16: trang quản trị `/admin/` tách khỏi PWA (design §4.9, ADR 0003 §8). Phần 1: khung trang và
// đăng nhập (Q10 vế "tài khoản thường bị từ chối" và "không có IndexedDB"); A1, A2 ở phần 2.

const SESSION_KEY = 'field-survey-admin-session';

async function meStatus(request: APIRequestContext, token: string): Promise<number> {
  return (await request.get('http://localhost:3001/api/me', { headers: authHeaders(token) })).status();
}

/** Điền form đăng nhập trang quản trị, trả token server cấp (kể cả khi trang từ chối lưu). */
async function adminSignIn(page: Page, username: string): Promise<string> {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  await page.getByTestId('admin-username').fill(username);
  await page.getByTestId('admin-password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

const storedSession = (page: Page) => page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);

test('Q10: tài khoản thường bị từ chối, không lưu token, phiên vừa cấp bị huỷ, không có IndexedDB', async ({
  page,
  request,
}) => {
  await page.goto('/admin/');
  const token = await adminSignIn(page, 'minh');

  await expect(page.getByRole('alert')).toHaveText('⚠ Tài khoản này không phải quản trị');
  await expect(page.getByTestId('admin-username')).toBeVisible();
  expect(await storedSession(page)).toBeNull();
  await expect.poll(() => meStatus(request, token)).toBe(401);
  expect(await databaseNames(page)).toEqual([]);
});

test('Q10: admin vào trang quản trị, chuyển A1/A2, tải lại vẫn đăng nhập; không manifest, không SW, không IndexedDB', async ({
  page,
}) => {
  await page.goto('/admin/');
  await adminSignIn(page, 'admin');

  await expect(page.getByRole('heading', { name: 'Yêu cầu mở tổ chức' })).toBeVisible();
  await expect(page.getByTestId('admin-user')).toHaveText('admin');
  // Không có mục Tài khoản (A3) tới khi có API của TV2-17
  await expect(page.getByRole('link', { name: 'Tài khoản' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Tổ chức' }).click();
  await expect(page.getByRole('heading', { name: 'Tổ chức' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/#\/projects$/);

  // sessionStorage còn trong tab: tải lại không phải đăng nhập lại
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tổ chức' })).toBeVisible();

  // Bố cục cho máy tính nhưng điện thoại 360px vẫn không bị cuộn ngang cả trang (design §4.9)
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  expect(await databaseNames(page)).toEqual([]);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test('Đăng xuất trang quản trị: huỷ phiên trên server, xoá token, về form đăng nhập', async ({ page, request }) => {
  await page.goto('/admin/');
  const token = await adminSignIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Yêu cầu mở tổ chức' })).toBeVisible();

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByTestId('admin-username')).toBeVisible();
  expect(await storedSession(page)).toBeNull();
  expect(await meStatus(request, token)).toBe(401);
});

test('Máy đã dùng app khảo sát (SW đang chạy): /admin/ vẫn ra trang quản trị, không bị SW trả trang PWA', async ({
  page,
}) => {
  await login(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const before = await databaseNames(page);

  await page.goto('/admin/');
  await expect(page.getByTestId('admin-username')).toBeVisible();
  await expect(page.getByTestId('login-username')).toHaveCount(0);
  await adminSignIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Yêu cầu mở tổ chức' })).toBeVisible();
  // Trang quản trị không tạo thêm CSDL nào (CSDL của app khảo sát cùng origin vẫn còn nguyên)
  expect((await databaseNames(page)).sort()).toEqual(before.sort());
});
