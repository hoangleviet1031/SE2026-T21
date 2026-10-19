import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, fillLogin, readStore } from './helpers';

// TV1-14, design §4.7 (Tài khoản), ui.md màn hình 1; ca U7 (§10.1). Thay spec màn hình nhập mã của TV1-02.
// Server đếm đăng nhập sai theo IP (10 lần/15 phút) và đăng ký thành công (5 lần/giờ), cả bộ E2E dùng
// chung một server: file này chỉ có một lần sai mật khẩu và một lần đăng ký thành công.

async function storedToken(page: Page): Promise<unknown> {
  const rows = (await readStore(page, 'field-survey-account', 'account')) as { key: string; value: unknown }[];
  return rows.find((r) => r.key === 'token')?.value;
}

async function openRegister(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Tạo tài khoản' }).click();
}

async function fillRegister(page: Page, v: { username: string; name: string; password: string; password2: string }) {
  await page.getByTestId('login-username').fill(v.username);
  await page.getByTestId('register-name').fill(v.name);
  await page.getByTestId('login-password').fill(v.password);
  await page.getByTestId('register-password2').fill(v.password2);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
}

test('U7: tạo tài khoản trên app là đăng nhập luôn; tải lại vẫn đăng nhập', async ({ page }) => {
  // Server E2E có thể được dùng lại giữa các lần chạy: tên mới mỗi lần
  const username = `u7.${crypto.randomUUID().slice(0, 8)}`;
  await openRegister(page);
  await fillRegister(page, { username, name: 'Người U7', password: 'mat-khau-u7', password2: 'mat-khau-u7' });

  await expect(page.getByTestId('login-username')).toHaveCount(0);
  // Tài khoản mới chưa thuộc tổ chức nào: trang chủ là màn hình Tổ chức (TV1-15)
  await expect(page.getByTestId('orgs-username')).toHaveText(username);

  await page.reload();
  await expect(page.getByTestId('orgs-username')).toHaveText(username);
  await expect(page.getByTestId('login-username')).toHaveCount(0);
});

test('U7: offline lần đầu: báo cần kết nối mạng, không lưu gì, không vào được trang chủ', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('login-username')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng');

  await fillLogin(page, 'minh');
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng');
  await page.getByRole('tab', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng');

  // Có mạng lại rồi tải lại: nếu lúc offline đã lưu token thì sẽ vào thẳng trang chủ
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByTestId('login-username')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('đăng nhập bằng tên + mật khẩu vào trang chủ; tải lại vẫn ở trang chủ', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Đăng nhập' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Tạo phiếu mới' })).toHaveCount(0);

  // Tên gõ chữ hoa vẫn là cùng tài khoản (server lưu chữ thường)
  await fillLogin(page, '  Minh ', DEMO_PASSWORD);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await expect(page.getByTestId('login-username')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await expect(page.getByTestId('login-username')).toHaveCount(0);
});

test('sai mật khẩu: báo "Sai tên đăng nhập hoặc mật khẩu", không lưu token', async ({ page }) => {
  await page.goto('/');
  await fillLogin(page, 'minh', 'khong-phai-mat-khau');
  await expect(page.getByRole('alert')).toHaveText('⚠ Sai tên đăng nhập hoặc mật khẩu');
  expect(await storedToken(page)).toBeUndefined();
  await expect(page.getByTestId('login-username')).toBeVisible();
});

test('tạo tài khoản: báo lỗi từng ô trước khi gửi; tên đã có người dùng thì báo từ server', async ({ page }) => {
  const ok = { username: 'chua.ai.dung', name: 'Ai đó', password: '12345678', password2: '12345678' };
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/auth/register')) requests.push(r.url());
  });
  await openRegister(page);

  await fillRegister(page, { ...ok, username: 'Minh Nguyễn' });
  await expect(page.getByRole('alert')).toHaveText('⚠ Tên đăng nhập chỉ gồm chữ thường, số, dấu . và _ (3–32 ký tự)');
  await fillRegister(page, { ...ok, name: 'a'.repeat(101) });
  await expect(page.getByRole('alert')).toHaveText('⚠ Tên hiển thị tối đa 100 ký tự');
  await fillRegister(page, { ...ok, password: '1234567', password2: '1234567' });
  await expect(page.getByRole('alert')).toHaveText('⚠ Mật khẩu cần từ 8 đến 128 ký tự');
  await fillRegister(page, { ...ok, password2: '12345679' });
  await expect(page.getByRole('alert')).toHaveText('⚠ Mật khẩu nhập lại không khớp');
  expect(requests).toEqual([]);

  // Tên của tài khoản demo: server trả 409 username_taken (không tính vào giới hạn đăng ký)
  await fillRegister(page, { ...ok, username: 'minh' });
  await expect(page.getByRole('alert')).toHaveText('⚠ Tên đăng nhập đã có người dùng');
  expect(requests).toHaveLength(1);
  expect(await storedToken(page)).toBeUndefined();

  // Đổi tab thì xoá thông báo cũ
  await page.getByRole('tab', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
