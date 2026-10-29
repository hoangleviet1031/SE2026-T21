import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import type { MeResponse, ProjectRequest } from '@field-survey/shared';
import { DEMO_PASSWORD, TOKENS, answerConfirm, authHeaders, createProject, databaseNames, login } from './helpers';

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

/**
 * Mở trang quản trị và đăng nhập admin demo, trả token phiên của trang. Chỉ trả về khi A1 đã tải xong:
 * request còn dở mà test thu hồi phiên thì nó về 401, trang tự về form đăng nhập giữa lúc test đang bấm
 * (CI chập chờn ở #72, #78). Tín hiệu giao diện chưa đủ: bảng A1 tự báo số "(n)" lên thanh trên nên link
 * "Yêu cầu (n)" có thể hiện khi request đếm của thanh trên còn chưa về, nên chờ thêm hết request admin.
 */
async function openAdmin(page: Page): Promise<string> {
  // Set chứ không đếm: request nào cũng chỉ thêm và bỏ đúng một lần, không âm khi sự kiện về lệch thứ tự
  const inFlight = new Set<Request>();
  const start = (r: Request) => {
    if (r.url().includes('/api/admin/')) inFlight.add(r);
  };
  const done = (r: Request) => inFlight.delete(r);
  page.on('request', start);
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  await page.goto('/admin/');
  const token = await adminSignIn(page, 'admin');
  await expect(page.getByTestId('admin-user')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Yêu cầu \(\d+\)$/ })).toBeVisible();
  await expect(page.getByText('Đang tải…')).toHaveCount(0);
  await expect.poll(() => inFlight.size).toBe(0);
  page.off('request', start);
  page.off('requestfinished', done);
  page.off('requestfailed', done);
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

test('Q10: admin vào trang quản trị, chuyển A1/A2/A3, tải lại vẫn đăng nhập; không manifest, không SW, không IndexedDB', async ({
  page,
}) => {
  await page.goto('/admin/');
  await adminSignIn(page, 'admin');

  await expect(page.getByRole('heading', { name: 'Yêu cầu mở tổ chức' })).toBeVisible();
  await expect(page.getByTestId('admin-user')).toHaveText('admin');

  await page.getByRole('link', { name: 'Tài khoản' }).click();
  await expect(page.getByRole('heading', { name: 'Tài khoản' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/#\/users$/);
  await expect(page.getByRole('link', { name: 'Tài khoản' })).toHaveAttribute('aria-current', 'page');

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
  // Dòng biến mất cùng nút vừa bấm: focus về dòng kết quả, không rơi về đầu trang (góp ý #76)
  await expect(page.getByTestId('admin-notice')).toBeFocused();
  const res = await request.get(`${BASE}/project-requests`, { headers: authHeaders(TOKENS.lan) });
  const mine = (await res.json()) as ProjectRequest[];
  expect(mine.find((r) => r.name === name)).toMatchObject({ status: 'rejected', reason: 'Trùng tên tổ chức đã có' });
});

test('Q10: A1 duyệt → người gửi là Owner; A2 khoá (có xác nhận) → mất khỏi /me, mở lại; Thêm Owner', async ({
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
  await expect(requestRow(page, name)).toHaveCount(0);
  await expect(page.getByTestId('admin-notice')).toBeFocused();
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
  // Huỷ hoặc Esc: con trỏ về lại nút Khoá, không rơi về đầu trang (tech-debt N18)
  await expect(row.getByRole('button', { name: 'Khoá' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row.getByTestId('project-status')).toHaveText('Đang dùng');
  await expect(row.getByRole('button', { name: 'Khoá' })).toBeFocused();

  await row.getByRole('button', { name: 'Khoá' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Khoá' }).click();
  await expect(row.getByTestId('project-status')).toHaveText('Đã khoá');
  expect((await me(request, userToken)).projects.map((p) => p.id)).not.toContain(projectId);

  await row.getByRole('button', { name: 'Mở' }).click();
  await expect(row.getByTestId('project-status')).toHaveText('Đang dùng');
  // Nút Mở thành nút Khoá (phần tử khác): focus về dòng kết quả
  await expect(page.getByTestId('admin-notice')).toHaveText(`Đã mở: ${name}`);
  await expect(page.getByTestId('admin-notice')).toBeFocused();
  expect((await me(request, userToken)).projects.map((p) => p.id)).toContain(projectId);

  // Thêm Owner ở tổ chức chưa có Owner (như tổ chức có từ trước migration 4)
  const orphan = `x-${id}`;
  await createProject(request, orphan, `Chưa có Owner ${id}`);
  await page.reload();
  const orphanRow = page.getByTestId(`project-row-${orphan}`);
  await expect(orphanRow.getByTestId('project-owners')).toHaveText('Chưa có Owner');
  const ownerButton = orphanRow.getByRole('button', { name: 'Thêm Owner…' });
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
  // Hàng mở rộng đóng cùng nút vừa bấm: focus về dòng kết quả
  await expect(ownerExpand).toHaveCount(0);
  await expect(page.getByTestId('admin-notice')).toBeFocused();
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

/** Đăng nhập bằng API, trả mã HTTP (và token nếu được) để kiểm mật khẩu cũ/mới sau thao tác ở A3. */
async function apiLogin(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${BASE}/auth/login`, { data: { username, password } });
  return { status: res.status(), token: res.ok() ? ((await res.json()) as { token: string }).token : '' };
}

const userRow = (page: Page, username: string) => page.getByTestId(`user-row-${username}`);

const lockMessage = (username: string) =>
  `Khoá tài khoản "${username}"? Mọi phiên đăng nhập bị thu hồi, người này không đăng nhập được nữa. Trang này không mở khoá được.`;

test('Q10 A3: tìm tài khoản; cấp lại mật khẩu (có xác nhận) hiện mật khẩu tạm một lần; thu hồi phiên; khoá (có xác nhận)', async ({
  page,
  request,
}) => {
  // Một lượt đăng ký (giới hạn 5/giờ/IP, cả lượt E2E dùng 4): làm mọi thao tác trên cùng tài khoản, khoá sau cùng
  const id = suffix();
  const username = `a3${id}`.slice(0, 32);
  const reg = await request.post(`${BASE}/auth/register`, {
    data: { username, name: 'Người A3', password: 'mat-khau-a3' },
  });
  expect(reg.status()).toBe(201);
  const firstToken = ((await reg.json()) as { token: string }).token;

  await openAdmin(page);
  await page.getByRole('link', { name: 'Tài khoản' }).click();
  await expect(page.getByTestId('admin-users')).toBeVisible();
  // Tìm theo một phần tên đăng nhập, không phân biệt hoa thường
  await page.getByLabel('Tìm theo tên đăng nhập').fill(id.toUpperCase());
  await page.getByRole('button', { name: 'Tìm' }).click();
  // Một dòng tiêu đề + đúng một tài khoản
  await expect(page.getByTestId('admin-users').getByRole('row')).toHaveCount(2);
  const row = userRow(page, username);
  await expect(row).toContainText('Người A3');
  await expect(row.getByTestId('user-status')).toHaveText('Đang dùng');

  // Cấp lại mật khẩu: Huỷ thì không đổi gì; xác nhận thì mật khẩu cũ hết dùng, phiên cũ vẫn còn
  const resetMsg = `Cấp mật khẩu tạm cho "${username}"? Mật khẩu cũ hết dùng được; các máy đang đăng nhập vẫn giữ phiên.`;
  await row.getByRole('button', { name: 'Cấp lại mật khẩu' }).click();
  await answerConfirm(page, resetMsg, 'Huỷ');
  await expect(page.getByTestId('temp-password')).toHaveCount(0);
  expect((await apiLogin(request, username, 'mat-khau-a3')).status).toBe(200);

  const resetRes = page.waitForResponse((r) => r.url().endsWith('/reset-password'));
  await row.getByRole('button', { name: 'Cấp lại mật khẩu' }).click();
  await answerConfirm(page, resetMsg, 'Cấp lại mật khẩu');
  expect((await resetRes).headers()['cache-control']).toBe('no-store');
  await expect(page.getByTestId('admin-notice')).toHaveText(`Đã cấp mật khẩu tạm cho ${username}`);
  await expect(page.getByTestId(`user-expand-${username}`)).toHaveText(/^Mật khẩu tạm: \S{12} \(chỉ hiện một lần\)$/);
  const temp = (await page.getByTestId('temp-password').textContent()) ?? '';
  expect((await apiLogin(request, username, 'mat-khau-a3')).status).toBe(401);
  const second = await apiLogin(request, username, temp);
  expect(second.status).toBe(200);
  expect(await meStatus(request, firstToken)).toBe(200);
  // Mật khẩu tạm không bị lưu trên máy
  expect(await storedSession(page)).not.toContain(temp);

  // Thu hồi phiên: không hỏi lại; mọi phiên mất, mật khẩu tạm biến khỏi trang, vẫn đăng nhập lại được
  await row.getByRole('button', { name: 'Thu hồi phiên' }).click();
  await expect(page.getByTestId('admin-notice')).toHaveText(`Đã thu hồi phiên: ${username}`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('temp-password')).toHaveCount(0);
  expect(await meStatus(request, firstToken)).toBe(401);
  expect(await meStatus(request, second.token)).toBe(401);
  const third = await apiLogin(request, username, temp);
  expect(third.status).toBe(200);

  // Khoá: hỏi lại bằng nút đỏ; xong dòng còn trạng thái, hết nút, focus về dòng kết quả
  await row.getByRole('button', { name: 'Khoá' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Khoá', exact: true })).toHaveClass(/danger/);
  await answerConfirm(page, lockMessage(username), 'Khoá');
  await expect(page.getByTestId('admin-notice')).toHaveText(`Đã khoá: ${username}`);
  await expect(page.getByTestId('admin-notice')).toBeFocused();
  await expect(row.getByTestId('user-status')).toHaveText('Đã khoá');
  await expect(row.getByRole('button')).toHaveCount(0);
  expect(await meStatus(request, third.token)).toBe(401);
  expect((await apiLogin(request, username, temp)).status).toBe(401);

  await page.getByLabel('Tìm theo tên đăng nhập').fill('khong-co-ai-ten-nay');
  await page.getByRole('button', { name: 'Tìm' }).click();
  await expect(page.getByText('Không tìm thấy tài khoản nào')).toBeVisible();
});

test('Q10 A3: admin tự khoá hay tự thu hồi phiên của mình thì báo lỗi, vẫn giữ đăng nhập', async ({ page, request }) => {
  const token = await openAdmin(page);
  await page.getByRole('link', { name: 'Tài khoản' }).click();
  await page.getByLabel('Tìm theo tên đăng nhập').fill('admin');
  await page.getByRole('button', { name: 'Tìm' }).click();
  const row = userRow(page, 'admin');
  const selfError = '⚠ Không tự khoá hay tự thu hồi phiên của chính mình được';

  await row.getByRole('button', { name: 'Thu hồi phiên' }).click();
  await expect(page.getByTestId('admin-notice')).toHaveText(selfError);
  await expect(page.getByTestId('admin-notice')).toHaveAttribute('role', 'alert');

  await row.getByRole('button', { name: 'Khoá' }).click();
  await answerConfirm(page, lockMessage('admin'), 'Khoá');
  await expect(page.getByTestId('admin-notice')).toHaveText(selfError);
  await expect(row.getByTestId('user-status')).toHaveText('Đang dùng');
  await expect(page.getByTestId('admin-user')).toBeVisible();
  expect(await meStatus(request, token)).toBe(200);

  // 360px: bảng A3 cuộn ngang trong khung, cả trang không cuộn ngang
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

/** Lần tải danh sách (GET) của trang trả lỗi giả; thao tác khác vẫn tới server thật. */
async function failListLoad(page: Page, path: RegExp, status: number, body: string) {
  await page.route(path, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status, contentType: 'application/json', body })
      : route.continue(),
  );
}

const CODED_ERROR = JSON.stringify({ error: 'invalid_body' });

// Lần tải đầu lỗi thì chỉ còn dòng lỗi; trước đây danh sách chưa có nên trang hiện "Đang tải…" mãi
test('A1 tải lần đầu lỗi có mã: báo lỗi, không kẹt "Đang tải…"', async ({ page }) => {
  await failListLoad(page, /\/api\/admin\/project-requests(\?|$)/, 400, CODED_ERROR);
  await page.goto('/admin/');
  await adminSignIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Yêu cầu mở tổ chức' })).toBeVisible();
  await expect(page.getByTestId('admin-notice')).toHaveText('⚠ Thông tin chưa hợp lệ, kiểm tra lại');
  await expect(page.getByText('Đang tải…')).toHaveCount(0);
});

test('A2 tải lần đầu lỗi có mã: báo lỗi, không kẹt "Đang tải…"', async ({ page }) => {
  await openAdmin(page);
  await failListLoad(page, /\/api\/admin\/projects(\?|$)/, 400, CODED_ERROR);
  await page.getByRole('link', { name: 'Tổ chức' }).click();
  await expect(page.getByTestId('admin-notice')).toHaveText('⚠ Thông tin chưa hợp lệ, kiểm tra lại');
  await expect(page.getByText('Đang tải…')).toHaveCount(0);
});

test('A2 tải lần đầu máy chủ lỗi (5xx): báo lỗi, không kẹt "Đang tải…"', async ({ page }) => {
  await openAdmin(page);
  await failListLoad(page, /\/api\/admin\/projects(\?|$)/, 500, '{}');
  await page.getByRole('link', { name: 'Tổ chức' }).click();
  await expect(page.getByTestId('admin-notice')).toHaveText('⚠ Máy chủ đang lỗi, thử lại sau');
  await expect(page.getByText('Đang tải…')).toHaveCount(0);
});

test('A3 tải lần đầu lỗi có mã: báo lỗi, không kẹt "Đang tải…"; bấm Tìm thì tải lại được', async ({ page }) => {
  await openAdmin(page);
  const users = /\/api\/admin\/users(\?|$)/;
  await failListLoad(page, users, 400, CODED_ERROR);
  await page.getByRole('link', { name: 'Tài khoản' }).click();
  await expect(page.getByTestId('admin-notice')).toHaveText('⚠ Thông tin chưa hợp lệ, kiểm tra lại');
  await expect(page.getByText('Đang tải…')).toHaveCount(0);

  await page.unroute(users);
  await page.getByLabel('Tìm theo tên đăng nhập').fill('admin');
  await page.getByRole('button', { name: 'Tìm' }).click();
  await expect(userRow(page, 'admin')).toBeVisible();
  await expect(page.getByTestId('admin-notice')).toHaveCount(0);
});

// N14: trước đây lần tải đầu về sau [Tìm] thì danh sách đầy đủ đè kết quả tìm. Không đếm số dòng (dữ liệu ca
// khác có thể khớp chuỗi tìm) và không đăng ký tài khoản mới (bộ E2E đã dùng hết 5 lượt/giờ/IP): tìm tài khoản
// demo `minh`, kiểm dòng `lan` (chỉ có trong danh sách đầy đủ) không hiện ra sau khi lần tải đầu về.
test('A3: bấm Tìm lúc danh sách lần đầu còn đang tải thì bảng chỉ giữ kết quả tìm (N14)', async ({ page }) => {
  await openAdmin(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const firstLoad = /\/api\/admin\/users$/;
  await page.route(firstLoad, async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole('link', { name: 'Tài khoản' }).click();
  await expect(page.getByText('Đang tải…')).toBeVisible();

  await page.getByLabel('Tìm theo tên đăng nhập').fill('minh');
  await page.getByRole('button', { name: 'Tìm' }).click();
  await expect(userRow(page, 'minh')).toBeVisible();

  const firstDone = page.waitForResponse(firstLoad);
  release();
  await firstDone;
  await expect(userRow(page, 'lan')).toHaveCount(0);
  await expect(userRow(page, 'minh')).toBeVisible();
});
