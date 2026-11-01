import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { login } from './helpers';

// Đổi mật khẩu ở trang Cài đặt (design §4.7, ui.md màn hình 8, US-13). Tài khoản riêng cho từng test, tạo qua
// API: đổi mật khẩu thu hồi mọi phiên khác, dùng tài khoản demo thì token demo các spec khác đang dùng mất hiệu
// lực. Mỗi test một IP giả qua X-Forwarded-For (server tin header này vì request đến từ loopback, design §9),
// để không ăn vào giới hạn đăng ký 5/giờ và giới hạn đăng nhập sai của 127.0.0.1 mà spec khác dùng chung.

const BASE = 'http://localhost:3001/api';
const PASSWORD = 'mat-khau-cu-e2e';
const NEW_PASSWORD = 'mat-khau-moi-e2e';

let username = '';
let ip = '';

test.beforeEach(async ({ page, request }) => {
  const id = crypto.randomUUID().slice(0, 8);
  username = `doimk${id}`;
  ip = `10.${parseInt(id.slice(0, 2), 16)}.${parseInt(id.slice(2, 4), 16)}.${parseInt(id.slice(4, 6), 16)}`;
  const reg = await request.post(`${BASE}/auth/register`, {
    data: { username, name: 'Người đổi mật khẩu', password: PASSWORD },
    headers: { 'X-Forwarded-For': ip },
  });
  expect(reg.status()).toBe(201);
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': ip });
});

function apiLogin(request: APIRequestContext, password: string) {
  return request.post(`${BASE}/auth/login`, { data: { username, password }, headers: { 'X-Forwarded-For': ip } });
}

const toggle = (page: Page) => page.getByRole('button', { name: 'Đổi mật khẩu…', exact: true });
const submit = (page: Page) => page.getByRole('button', { name: 'Đổi mật khẩu', exact: true });

async function openSettings(page: Page) {
  await login(page, username, PASSWORD);
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
}

async function fillPasswords(page: Page, current: string, next: string, next2 = next) {
  await page.getByLabel('Mật khẩu hiện tại').fill(current);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(next);
  await page.getByLabel('Nhập lại mật khẩu mới').fill(next2);
}

test('sai mật khẩu hiện tại thì báo lỗi, ở lại trang; đổi đúng thì đóng khối, mật khẩu mới dùng được', async ({
  page,
  request,
}) => {
  await openSettings(page);
  await expect(page.getByLabel('Mật khẩu hiện tại')).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Mật khẩu hiện tại')).toBeFocused();

  await fillPasswords(page, 'sai-mat-khau', NEW_PASSWORD);
  await submit(page).click();
  await expect(page.getByTestId('change-password-error')).toHaveText('⚠ Mật khẩu hiện tại không đúng');
  // 403 không phải 401: vẫn đăng nhập, vẫn ở Cài đặt, khối vẫn mở
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  await expect(page.getByLabel('Mật khẩu hiện tại')).toBeVisible();

  await fillPasswords(page, PASSWORD, NEW_PASSWORD);
  await submit(page).click();
  await expect(page.getByTestId('change-password-done')).toHaveText('Đã đổi mật khẩu. Các máy khác cần đăng nhập lại.');
  await expect(page.getByLabel('Mật khẩu hiện tại')).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page)).toBeFocused();

  expect((await apiLogin(request, PASSWORD)).status()).toBe(401);
  expect((await apiLogin(request, NEW_PASSWORD)).status()).toBe(200);
  // Phiên của máy này giữ nguyên: tải lại vẫn ở trong app
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  await expect(page.getByTestId('settings-username')).toHaveText(username);

  // Mở lại: ô trống, dòng "Đã đổi" mất
  await toggle(page).click();
  await expect(page.getByLabel('Mật khẩu hiện tại')).toHaveValue('');
  await expect(page.getByTestId('change-password-done')).toHaveCount(0);
});

test('Huỷ đóng khối và xoá chữ đã gõ; nhập lại không khớp thì báo lỗi, không gửi', async ({ page }) => {
  await openSettings(page);
  await toggle(page).click();
  await fillPasswords(page, PASSWORD, NEW_PASSWORD);
  await page.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page.getByLabel('Mật khẩu hiện tại')).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page)).toBeFocused();

  await toggle(page).click();
  await expect(page.getByLabel('Mật khẩu hiện tại')).toHaveValue('');
  await expect(page.getByLabel('Mật khẩu mới', { exact: true })).toHaveValue('');

  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/auth/change-password')) sent.push(r.url());
  });
  await fillPasswords(page, PASSWORD, NEW_PASSWORD, 'khac-mat-khau');
  await submit(page).click();
  await expect(page.getByTestId('change-password-error')).toHaveText('⚠ Mật khẩu nhập lại không khớp');
  await fillPasswords(page, PASSWORD, 'ngan');
  await submit(page).click();
  await expect(page.getByTestId('change-password-error')).toHaveText('⚠ Mật khẩu cần từ 8 đến 128 ký tự');
  expect(sent).toEqual([]);
});

test('offline: nút Đổi mật khẩu khoá, báo cần kết nối mạng', async ({ page, context }) => {
  await openSettings(page);
  await toggle(page).click();
  await context.setOffline(true);
  await expect(page.getByTestId('change-password-offline')).toHaveText('Cần kết nối mạng để đổi mật khẩu');
  await expect(submit(page)).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId('change-password-offline')).toHaveCount(0);
  await expect(submit(page)).toBeEnabled();
});
