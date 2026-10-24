import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { MeResponse, ProjectRequest } from '@field-survey/shared';
import { DEMO_PASSWORD, TOKENS, authHeaders, createProject, databaseNames, login } from './helpers';

// TV1-16: trang quản trị `/admin/` tách khỏi PWA (design §4.9, ADR 0003 §8), ca Q10 (§10.1): tài khoản
// thường bị từ chối, admin duyệt ở A1, khoá ở A2, trang admin không có IndexedDB.
// Server E2E dùng chung cả lượt chạy: bảng A1 có cả yêu cầu của spec khác, nên tìm dòng theo tên duy
// nhất, không đếm dòng. Không duyệt hay thêm Owner cho tài khoản demo (đổi /me của spec khác): dùng một
// tài khoản đăng ký mới (giới hạn đăng ký 5 lần/giờ/IP, cả lượt E2E đang dùng 3).

const SESSION_KEY = 'field-survey-admin-session';
const BASE = 'http://localhost:3001/api';

const suffix = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

/** Gửi yêu cầu mở tổ chức, trả id để tìm hàng mở rộng của dòng đó ở A1. */
async function sendRequest(request: APIRequestContext, token: string, name: string, note?: string): Promise<string> {
  const res = await request.post(`${BASE}/project-requests`, { headers: authHeaders(token), data: { name, note } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as ProjectRequest).id;
}

// Lỗi của người dùng chữ đỏ không nền; mất mạng, phiên hết nền vàng (TV1-12 b2, ui.md A0)
const WARN_BG = 'rgb(255, 241, 194)';
const RED = 'rgb(192, 38, 26)';

async function me(request: APIRequestContext, token: string): Promise<MeResponse> {
  const res = await request.get(`${BASE}/me`, { headers: authHeaders(token) });
  expect(res.status()).toBe(200);
  return res.json();
}

/** Mở trang quản trị và đăng nhập admin demo, trả token phiên của trang. */
async function openAdmin(page: Page): Promise<string> {
  await page.goto('/admin/');
  const token = await adminSignIn(page, 'admin');
  await expect(page.getByTestId('admin-user')).toBeVisible();
  return token;
}

const requestRow = (page: Page, name: string) =>
  page.getByTestId('admin-requests').getByRole('row').filter({ hasText: name });

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
  await expect(page.getByRole('alert')).toHaveCSS('color', RED);
  await expect(page.getByRole('alert')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
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
  // Gõ thiếu "/" cuối: SW không được trả index.html của PWA (denylist khớp cả `/admin`), để request tới
  // máy chủ; Caddy chuyển sang `/admin/` (deploy.md §7). `vite preview` không chuyển hướng như Caddy nên
  // chỉ kiểm được response không đến từ SW.
  const bare = await page.goto('/admin');
  expect(bare?.fromServiceWorker()).toBe(false);
  await page.goto('/admin/');
  await adminSignIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Yêu cầu mở tổ chức' })).toBeVisible();
  // Trang quản trị không tạo CSDL nào: cùng origin nên vẫn thấy CSDL của app khảo sát (vòng đồng bộ có
  // thể vừa tạo thêm CSDL dự án), nhưng không có tên nào khác
  const after = await databaseNames(page);
  expect(after).toEqual(expect.arrayContaining(before));
  expect(after.filter((n) => !n.startsWith('field-survey-'))).toEqual([]);
});

test('Q10: A1 từ chối bắt buộc lý do; người gửi thấy lý do', async ({ page, request }) => {
  const name = `Từ chối Q10 ${suffix()}`;
  const requestId = await sendRequest(request, TOKENS.lan, name, 'Khảo sát 200 hộ');
  await openAdmin(page);

  const row = requestRow(page, name);
  await expect(row).toContainText('lan (lan)');
  await expect(row).toContainText('Khảo sát 200 hộ');
  // Ô lý do mở ở hàng riêng ngay dưới dòng (TV1-12 b2): vào thẳng ô; Huỷ thì về lại nút [Từ chối…]
  const expand = page.getByTestId(`request-expand-${requestId}`);
  await row.getByRole('button', { name: 'Từ chối…' }).click();
  await expect(expand.getByTestId('reject-reason')).toBeFocused();
  await expand.getByRole('button', { name: 'Huỷ' }).click();
  await expect(expand).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Từ chối…' })).toBeFocused();

  await row.getByRole('button', { name: 'Từ chối…' }).click();
  const confirm = expand.getByRole('button', { name: 'Xác nhận từ chối' });
  await expect(confirm).toBeDisabled();
  await expand.getByTestId('reject-reason').fill('   ');
  await expect(confirm).toBeDisabled();
  await expand.getByTestId('reject-reason').fill('Trùng tên tổ chức đã có');
  await confirm.click();

  await expect(page.getByTestId('admin-notice')).toHaveText(`Đã từ chối: ${name}`);
  await expect(page.getByTestId('admin-notice')).toHaveRole('status');
  await expect(requestRow(page, name)).toHaveCount(0);
  const res = await request.get(`${BASE}/project-requests`, { headers: authHeaders(TOKENS.lan) });
  const mine = (await res.json()) as ProjectRequest[];
  expect(mine.find((r) => r.name === name)).toMatchObject({ status: 'rejected', reason: 'Trùng tên tổ chức đã có' });
});

test('Q10: A1 duyệt → người gửi là Owner; A2 khoá (có xác nhận) → mất khỏi /me, mở lại; Đổi Owner', async ({
  page,
  request,
}) => {
  const id = suffix();
  const username = `q10${id}`.slice(0, 32);
  const reg = await request.post(`${BASE}/auth/register`, {
    data: { username, name: 'Người Q10', password: 'mat-khau-q10' },
  });
  expect(reg.status()).toBe(201);
  const userToken = ((await reg.json()) as { token: string }).token;
  const name = `Duyệt Q10 ${id}`;
  await sendRequest(request, userToken, name);

  await openAdmin(page);
  await expect(page.getByRole('link', { name: /^Yêu cầu \(\d+\)$/ })).toBeVisible();
  await requestRow(page, name).getByRole('button', { name: 'Duyệt' }).click();
  await expect(page.getByTestId('admin-notice')).toHaveText(new RegExp(`^Đã duyệt: ${name} \\(mã p-[a-z0-9]{8}\\)$`));
  await expect(requestRow(page, name)).toHaveCount(0);
  const project = (await me(request, userToken)).projects.find((p) => p.name === name);
  expect(project?.role).toBe('owner');
  const projectId = project?.id ?? '';

  // A2: khoá có hỏi lại; huỷ thì không đổi gì
  await page.getByRole('link', { name: 'Tổ chức' }).click();
  const row = page.getByTestId(`project-row-${projectId}`);
  await expect(row.getByTestId('project-owners')).toHaveText(username);
  await expect(row.getByTestId('project-status')).toHaveText('Đang dùng');
  await row.getByRole('button', { name: 'Khoá' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Mọi thành viên sẽ không đồng bộ được với tổ chức này.');
  await dialog.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row.getByTestId('project-status')).toHaveText('Đang dùng');

  await row.getByRole('button', { name: 'Khoá' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Khoá' }).click();
  await expect(row.getByTestId('project-status')).toHaveText('Đã khoá');
  expect((await me(request, userToken)).projects.map((p) => p.id)).not.toContain(projectId);

  await row.getByRole('button', { name: 'Mở' }).click();
  await expect(row.getByTestId('project-status')).toHaveText('Đang dùng');
  expect((await me(request, userToken)).projects.map((p) => p.id)).toContain(projectId);

  // Đổi Owner ở tổ chức chưa có Owner (như tổ chức có từ trước migration 4)
  const orphan = `x-${id}`;
  await createProject(request, orphan, `Chưa có Owner ${id}`);
  await page.reload();
  const orphanRow = page.getByTestId(`project-row-${orphan}`);
  await expect(orphanRow.getByTestId('project-owners')).toHaveText('Chưa có Owner');
  const ownerButton = orphanRow.getByRole('button', { name: 'Đổi Owner…' });
  await expect(ownerButton).toHaveAttribute('aria-expanded', 'false');
  await ownerButton.click();
  await expect(ownerButton).toHaveAttribute('aria-expanded', 'true');
  // Ô nhập ở hàng riêng ngay dưới dòng (TV1-12 b2), nút trỏ tới hàng đó
  const ownerExpand = page.getByTestId(`project-expand-${orphan}`);
  await expect(ownerButton).toHaveAttribute('aria-controls', `project-expand-${orphan}`);
  await expect(ownerExpand).toHaveAttribute('id', `project-expand-${orphan}`);
  await expect(ownerExpand).toContainText('Owner cũ vẫn giữ quyền; muốn bỏ thì Owner rút ở màn hình Thành viên.');
  await ownerExpand.getByTestId('owner-username').fill('khongcoai_q10');
  await ownerExpand.getByRole('button', { name: 'Thêm làm Owner' }).click();
  await expect(page.getByTestId('admin-notice')).toHaveText('⚠ Không có tài khoản hoặc tổ chức này');
  await ownerExpand.getByTestId('owner-username').fill(` ${username.toUpperCase()} `);
  await ownerExpand.getByRole('button', { name: 'Thêm làm Owner' }).click();
  await expect(orphanRow.getByTestId('project-owners')).toHaveText(username);
  expect((await me(request, userToken)).projects.find((p) => p.id === orphan)?.role).toBe('owner');
});

test('Phiên admin bị thu hồi giữa chừng: về form đăng nhập, báo đăng nhập lại', async ({ page, request }) => {
  const token = await openAdmin(page);
  await expect(page.getByRole('heading', { name: 'Yêu cầu mở tổ chức' })).toBeVisible();
  const res = await request.post(`${BASE}/auth/logout`, { headers: authHeaders(token) });
  expect(res.status()).toBe(204);

  await page.getByRole('link', { name: 'Tổ chức' }).click();
  await expect(page.getByTestId('admin-username')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('⚠ Phiên đăng nhập hết hạn, đăng nhập lại');
  await expect(page.getByRole('alert')).toHaveCSS('background-color', WARN_BG);
  expect(await storedSession(page)).toBeNull();
});

test('Máy chủ lỗi (5xx): trang quản trị báo "Máy chủ đang lỗi, thử lại sau", vẫn giữ đăng nhập', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => route.fulfill({ status: 500, body: 'lỗi' }));
  await page.goto('/admin/');
  await page.getByTestId('admin-username').fill('admin');
  await page.getByTestId('admin-password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toHaveText('⚠ Máy chủ đang lỗi, thử lại sau');
  await page.unroute('**/api/auth/login');

  await adminSignIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Yêu cầu mở tổ chức' })).toBeVisible();
  await page.route('**/api/admin/**', (route) => route.fulfill({ status: 500, body: 'lỗi' }));
  await page.getByRole('link', { name: 'Tổ chức' }).click();
  await expect(page.getByTestId('admin-notice')).toHaveText('⚠ Máy chủ đang lỗi, thử lại sau');
  await expect(page.getByTestId('admin-user')).toBeVisible();
});

test('b2: mạng rớt lúc đăng nhập trang quản trị: "Cần kết nối mạng" nền vàng', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => route.abort('internetdisconnected'));
  await page.goto('/admin/');
  await page.getByTestId('admin-username').fill('admin');
  await page.getByTestId('admin-password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng');
  await expect(page.getByRole('alert')).toHaveCSS('background-color', WARN_BG);
});
