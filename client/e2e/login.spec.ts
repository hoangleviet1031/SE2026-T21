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
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await expect(page.getByTestId('login-username')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
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

// TV1-12 b2 (ui.md màn hình 1): mất mạng không phải lỗi của người dùng nên nền vàng; lỗi nhập chữ đỏ, không nền
const WARN_BG = 'rgb(255, 241, 194)';
const RED = 'rgb(192, 38, 26)';

test('b2: mạng rớt lúc bấm Tiếp tục cũng nền vàng như lúc ngoại tuyến; lỗi nhập chữ đỏ', async ({ page, context }) => {
  await page.goto('/');
  await page.route('**/api/auth/login', (route) => route.abort('internetdisconnected'));
  await fillLogin(page, 'minh', DEMO_PASSWORD);
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng');
  await expect(page.getByRole('alert')).toHaveCSS('background-color', WARN_BG);
  await page.unroute('**/api/auth/login');

  await context.setOffline(true);
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng');
  await expect(page.getByRole('alert')).toHaveCSS('background-color', WARN_BG);
  await context.setOffline(false);

  // Tab dạng công tắc vẫn báo đúng tab đang chọn
  await page.getByRole('tab', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('tab', { name: 'Tạo tài khoản' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Đăng nhập' })).toHaveAttribute('aria-selected', 'false');
  await fillRegister(page, { username: 'chua.ai.dung', name: 'Ai đó', password: '12345678', password2: '12345679' });
  await expect(page.getByRole('alert')).toHaveText('⚠ Mật khẩu nhập lại không khớp');
  await expect(page.getByRole('alert')).toHaveCSS('color', RED);
  await expect(page.getByRole('alert')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

// Tech-debt N16 (design §11.3, ui.md "Hệ thống thiết kế"): ô đang nhập phải viền đen + quầng vàng.
// Trước đây luật viền xám của .field cụ thể hơn luật focus nên chỉ còn quầng vàng nhạt.
test('N16: Tab tới ô Tên đăng nhập thì viền đổi đen, quầng vàng', async ({ page }) => {
  await page.goto('/');
  const username = page.getByLabel('Tên đăng nhập');
  await expect(username).toHaveCSS('border-top-color', 'rgb(138, 135, 128)');
  // Ô ngay sau hai tab Đăng nhập / Tạo tài khoản
  await page.getByRole('tab', { name: 'Tạo tài khoản' }).focus();
  await page.keyboard.press('Tab');
  await expect(username).toBeFocused();
  await expect(username).toHaveCSS('border-top-color', 'rgb(38, 37, 34)');
  await expect(username).toHaveCSS('outline', 'rgb(253, 229, 154) solid 3px');
});

// Design §11.3 (rà khả năng tiếp cận sau TV3-15): hai tab theo mẫu tab của WAI-ARIA. Phím mũi tên, Home, End
// đổi tab và chuyển con trỏ; chỉ tab đang chọn nằm trong thứ tự Tab; khung tab mang tên tab đang chọn.
test('tab: phím mũi tên, Home, End đổi tab và con trỏ; khung tab theo tab đang chọn', async ({ page }) => {
  await page.goto('/');
  const loginTab = page.getByRole('tab', { name: 'Đăng nhập' });
  const registerTab = page.getByRole('tab', { name: 'Tạo tài khoản' });
  const panelId = await page.getByRole('tabpanel', { name: 'Đăng nhập' }).getAttribute('id');
  expect(panelId).toBeTruthy();
  await expect(loginTab).toHaveAttribute('aria-controls', panelId ?? '');
  await expect(registerTab).not.toHaveAttribute('aria-controls');

  // Ghi lại sự kiện phím đã bị chặn mặc định chưa (Home/End mặc định cuộn trang). Gắn ở document nên chạy
  // sau React (React nghe ở gốc app)
  await page.evaluate(() => {
    const seen: Record<string, boolean> = {};
    Object.assign(window, { keySeen: seen });
    document.addEventListener('keydown', (e) => {
      seen[e.key] = e.defaultPrevented;
    });
  });
  await loginTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(registerTab).toBeFocused();
  await expect(registerTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Tên hiển thị')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Tạo tài khoản' })).toBeVisible();
  await expect(registerTab).toHaveAttribute('aria-controls', panelId ?? '');
  await expect(loginTab).not.toHaveAttribute('aria-controls');

  await page.keyboard.press('ArrowLeft');
  await expect(loginTab).toBeFocused();
  await expect(loginTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Tên hiển thị')).toHaveCount(0);

  await page.keyboard.press('End');
  await expect(registerTab).toBeFocused();
  await expect(registerTab).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(loginTab).toBeFocused();
  await expect(loginTab).toHaveAttribute('aria-selected', 'true');
  const keySeen = await page.evaluate(() => (window as Window & { keySeen?: Record<string, boolean> }).keySeen);
  expect(keySeen).toEqual({ ArrowRight: true, ArrowLeft: true, End: true, Home: true });
});

test('tab: Tab chỉ dừng ở tab đang chọn rồi vào thẳng ô đầu của khung', async ({ page }) => {
  await page.goto('/');
  const username = page.getByLabel('Tên đăng nhập');
  for (const name of ['Đăng nhập', 'Tạo tài khoản']) {
    const selected = page.getByRole('tab', { name });
    await selected.click();
    await expect(selected).toHaveAttribute('tabindex', '0');
    await username.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(selected).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    // Shift+Tab tiếp thì ra khỏi hàng tab, không dừng ở tab kia
    const other = page.getByRole('tab', { name: name === 'Đăng nhập' ? 'Tạo tài khoản' : 'Đăng nhập' });
    await expect(other).toHaveAttribute('tabindex', '-1');
    await expect(selected).not.toBeFocused();
    await expect(other).not.toBeFocused();
    await selected.focus();
    await page.keyboard.press('Tab');
    await expect(username).toBeFocused();
  }
});

// Design §11.3: câu lỗi gắn với ô bị lỗi (aria-invalid + aria-describedby) để trình đọc màn hình đọc khi tới ô.
// Chỉ gắn khi dòng lỗi đang hiện; không đổi viền ô (ui.md màn hình 1).
test('lỗi gắn với ô: ô sai có aria-invalid và mô tả là câu lỗi, ô khác không; hết lỗi thì bỏ', async ({ page, context }) => {
  const fields = {
    username: page.getByTestId('login-username'),
    name: page.getByTestId('register-name'),
    password: page.getByTestId('login-password'),
    password2: page.getByTestId('register-password2'),
  };
  type Key = keyof typeof fields;
  async function expectInvalid(bad: Key[], text: string, visible: Key[]) {
    for (const key of visible) {
      if (bad.includes(key)) {
        await expect(fields[key]).toHaveAttribute('aria-invalid', 'true');
        await expect(fields[key]).toHaveAccessibleDescription(`⚠ ${text}`);
      } else {
        await expect(fields[key]).not.toHaveAttribute('aria-invalid');
        await expect(fields[key]).not.toHaveAttribute('aria-describedby');
      }
    }
  }
  const all: Key[] = ['username', 'name', 'password', 'password2'];

  await openRegister(page);
  await fillRegister(page, { username: 'chua.ai.dung', name: 'Ai đó', password: '12345678', password2: '12345679' });
  await expectInvalid(['password2'], 'Mật khẩu nhập lại không khớp', all);
  // Không thêm viền đỏ: viền giữ như ô thường
  await expect(fields.password2).toHaveCSS('border-top-color', 'rgb(138, 135, 128)');

  // Tên của tài khoản demo: server trả 409 username_taken (không tính vào giới hạn đăng ký)
  await fillRegister(page, { username: 'minh', name: 'Ai đó', password: '12345678', password2: '12345678' });
  await expectInvalid(['username'], 'Tên đăng nhập đã có người dùng', all);

  // Mất mạng: dòng lỗi nhường chỗ cho "Cần kết nối mạng" nên ô hết báo lỗi; có mạng lại thì gắn lại
  await context.setOffline(true);
  await expect(page.getByRole('alert')).toHaveText('⚠ Cần kết nối mạng');
  await expectInvalid([], '', all);
  await context.setOffline(false);
  await expectInvalid(['username'], 'Tên đăng nhập đã có người dùng', all);

  // Đổi tab xoá lỗi thì bỏ luôn
  await page.getByRole('tab', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expectInvalid([], '', ['username', 'password']);

  // Sai tên hoặc mật khẩu gắn cả hai ô. Giả lời server để không tính thêm một lần đăng nhập sai (đầu file)
  await page.route('**/api/auth/login', (r) =>
    r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"invalid_credentials"}' }),
  );
  await fillLogin(page, 'minh', 'sai-mat-khau');
  await expectInvalid(['username', 'password'], 'Sai tên đăng nhập hoặc mật khẩu', ['username', 'password']);
  await page.unroute('**/api/auth/login');

  // Tài khoản quản trị cũng là dòng chữ đỏ nhưng không phải lỗi của ô nào
  await fillLogin(page, 'admin');
  await expect(page.getByRole('alert')).toHaveText('⚠ Tài khoản quản trị dùng trang /admin');
  await expectInvalid([], '', ['username', 'password']);
});
