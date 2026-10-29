import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEMO_PASSWORD, databaseNames, fillLogin, login, readStore } from './helpers';

// Lỗi ở các màn hình gọi API thẳng (TV1-12 a2; design §8, ui.md "Các trạng thái dùng chung"): 5xx báo
// "Máy chủ đang lỗi, thử lại sau" thay vì kẹt "Đang tải…" hay trang trống; 401 về màn hình Đăng nhập
// kèm "Phiên đăng nhập hết hạn, đăng nhập lại" (tech-debt N5).

// Request do service worker xử lý thì page.route không chặn được; các trang này chạy online nên tắt SW
test.use({ serviceWorkers: 'block' });

const SERVER_ERROR = '⚠ Máy chủ đang lỗi, thử lại sau';
const fail500 = { status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error' }) };

/** chu là Owner ở cả hai dự án demo; /me sắp theo id nên app mở demo-nongnghiep trước. */
async function openYteAsOwner(page: Page) {
  await login(page, 'chu');
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name: /Y tế xã \(demo\)/ }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName('Y tế xã (demo)');
}

test('Thành viên: 5xx khi tải báo lỗi kèm Thử lại; 5xx khi thêm báo dưới form', async ({ page }) => {
  await openYteAsOwner(page);
  await page.route('**/api/projects/*/members', (route) => route.fulfill(fail500));
  await page.getByRole('link', { name: 'Thành viên' }).click();
  const alert = page.getByRole('alert');
  // Vùng alert chỉ có câu lỗi; [Thử lại] nằm riêng bên ngoài (TV1-12 b2)
  // "⚠ " đứng trước như câu lỗi ở Đăng nhập, Tổ chức (TV1-12 màn hình 6, Dương chốt 2026-10-24)
  await expect(alert).toHaveText('⚠ Máy chủ đang lỗi, thử lại sau');
  await expect(page.getByText('Đang tải…')).toHaveCount(0);

  await page.unroute('**/api/projects/*/members');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByTestId('member-chu')).toBeVisible();

  await page.route('**/api/projects/*/members', (route) =>
    route.request().method() === 'POST' ? route.fulfill(fail500) : route.continue(),
  );
  await page.getByTestId('member-username').fill('khong.ai.ca');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await expect(page.getByTestId('member-error')).toHaveText('⚠ Máy chủ đang lỗi, thử lại sau');
});

test('Tổ chức: 5xx khi tải báo lỗi, không để trang trống không lời', async ({ page }) => {
  await login(page, 'minh');
  await page.route('**/api/directory', (route) => route.fulfill(fail500));
  await page.goto('/#/orgs');
  await expect(page.getByTestId('orgs').getByRole('alert')).toHaveText(SERVER_ERROR);
  // Chưa tải được danh sách thì ẩn cả khối, câu lỗi đã nói lý do (TV1-12 b2)
  await expect(page.getByRole('heading', { name: 'Tổ chức công khai' })).toHaveCount(0);
});

test('Builder: 5xx khi lưu báo lỗi, giữ nguyên phần đang sửa', async ({ page }) => {
  await openYteAsOwner(page);
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await page.getByLabel('Tiêu đề').fill('Form lỗi máy chủ');
  await page.getByLabel('Loại trường').selectOption({ label: 'Chữ' });
  await page.getByRole('button', { name: '+ Thêm trường' }).click();
  await page.getByTestId('field-editor').getByLabel('Nhãn').fill('Tên');
  await page.route('**/api/projects/*/forms', (route) =>
    route.request().method() === 'POST' ? route.fulfill(fail500) : route.continue(),
  );
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByRole('alert')).toContainText('Máy chủ đang lỗi, thử lại sau');
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Form lỗi máy chủ');
});

test('Xuất: 5xx báo "Máy chủ đang lỗi", không hiện mã HTTP', async ({ page }) => {
  await openYteAsOwner(page);
  await page.route('**/api/projects/*/export/**', (route) => route.fulfill(fail500));
  const row = page.getByRole('listitem').filter({ hasText: 'Khảo sát hộ gia đình' });
  await row.getByRole('button', { name: 'Xuất', exact: true }).click();
  await row.getByRole('button', { name: 'Xuất CSV' }).click();
  await expect(row.getByRole('alert')).toHaveText(SERVER_ERROR);
});

test('Xuất: mã lỗi màn hình không xử lý (404 form vừa bị xoá) báo "Máy chủ đang lỗi", không hiện mã HTTP', async ({
  page,
}) => {
  await openYteAsOwner(page);
  await page.route('**/api/projects/*/export/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) }),
  );
  const row = page.getByRole('listitem').filter({ hasText: 'Khảo sát hộ gia đình' });
  await row.getByRole('button', { name: 'Xuất', exact: true }).click();
  await row.getByRole('button', { name: 'Xuất JSON' }).click();
  await expect(row.getByRole('alert')).toHaveText(SERVER_ERROR);
});

test('401: phiên bị huỷ trên server → về Đăng nhập, báo hết phiên, giữ CSDL dự án; đăng nhập lại thì hết câu', async ({
  page,
  request,
}) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const before = await databaseNames(page);
  expect(before.some((n) => n.startsWith('field-survey-p-'))).toBe(true);

  // Huỷ phiên của máy này như khi admin chạy user:revoke-sessions
  const rows = (await readStore(page, 'field-survey-account', 'account')) as { key: string; value: unknown }[];
  const token = rows.find((r) => r.key === 'token')?.value;
  expect(typeof token).toBe('string');
  const res = await request.post('http://localhost:3001/api/auth/logout', {
    headers: { Authorization: `Bearer ${String(token)}` },
  });
  expect(res.status()).toBe(204);

  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect(page.getByTestId('session-expired')).toHaveText('⚠ Phiên đăng nhập hết hạn, đăng nhập lại', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('login-username')).toBeVisible();
  expect(await databaseNames(page)).toEqual(expect.arrayContaining(before));

  await fillLogin(page, 'minh', DEMO_PASSWORD);
  await expect(page.getByTestId('login-username')).toHaveCount(0);
  // Đăng nhập lại thì xoá dấu hết phiên, lần sau về màn hình Đăng nhập không báo sai lý do
  const after = (await readStore(page, 'field-survey-account', 'account')) as { key: string }[];
  expect(after.map((r) => r.key)).not.toContain('sessionExpired');
});

test('Hết phiên rồi mất mạng: chỉ một dải "Cần kết nối mạng", có mạng lại thì báo hết phiên lại', async ({
  page,
  context,
  request,
}) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const rows = (await readStore(page, 'field-survey-account', 'account')) as { key: string; value: unknown }[];
  const token = rows.find((r) => r.key === 'token')?.value;
  expect(typeof token).toBe('string');
  const res = await request.post('http://localhost:3001/api/auth/logout', {
    headers: { Authorization: `Bearer ${String(token)}` },
  });
  expect(res.status()).toBe(204);
  await page.getByRole('button', { name: 'Đồng bộ' }).click();

  // Có mạng, chưa có lỗi nào: dải hết phiên hiện, không có dải mất mạng
  const expired = page.getByTestId('session-expired');
  const offline = page.getByRole('alert').filter({ hasText: 'Cần kết nối mạng' });
  await expect(expired).toBeVisible({ timeout: 10_000 });
  await expect(offline).toHaveCount(0);

  // Mất mạng (góp ý #75): không hiện cùng lúc hai dải vàng
  await context.setOffline(true);
  await expect(offline).toHaveText('⚠ Cần kết nối mạng');
  await expect(expired).toHaveCount(0);

  await context.setOffline(false);
  await expect(expired).toHaveText('⚠ Phiên đăng nhập hết hạn, đăng nhập lại');
  await expect(offline).toHaveCount(0);
});

// Nút đang gửi (TV1-12 b1, ui.md "Các trạng thái dùng chung"): giữ request lại để thấy trạng thái giữa
// chừng. Chữ trên nút không đổi (E2E và trình đọc màn hình tìm nút theo tên), chỉ thêm chữ phụ cạnh nút.

/**
 * Giữ request khớp `url` (và `method` nếu có) tới khi gọi hàm trả về. `reply`: trả 500 thay vì cho đi
 * tiếp, để ca thử không tạo dữ liệu thật trên server dùng chung.
 */
async function hold(page: Page, url: string, opts: { method?: string; reply?: boolean } = {}) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(url, async (route) => {
    if (opts.method && route.request().method() !== opts.method) return route.continue();
    await held;
    await (opts.reply ? route.fulfill(fail500) : route.continue());
  });
  return release;
}

async function expectBusy(button: Locator, note: Locator, text: string) {
  await expect(note).toHaveText(text);
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  // Trên màn hình nút đã có vòng xoay, chữ phụ chỉ để trình đọc màn hình đọc (ui.md "Đang gửi", TV1-12 b2)
  expect(await note.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
}

test('đang gửi: Tiếp tục (đăng nhập) hiện "Đang đăng nhập…", tên nút giữ nguyên', async ({ page }) => {
  await page.goto('/');
  const release = await hold(page, '**/api/auth/login');
  await fillLogin(page, 'minh');
  await expectBusy(page.getByRole('button', { name: 'Tiếp tục' }), page.getByTestId('busy-note'), 'Đang đăng nhập…');
  release();
  await expect(page.getByTestId('login-username')).toHaveCount(0);
});

test('đang gửi: Tạo tài khoản hiện "Đang tạo tài khoản…"', async ({ page }) => {
  await page.goto('/');
  const release = await hold(page, '**/api/auth/register', { reply: true });
  await page.getByRole('tab', { name: 'Tạo tài khoản' }).click();
  await page.getByTestId('login-username').fill('dang.gui');
  await page.getByTestId('register-name').fill('Đang gửi');
  await page.getByTestId('login-password').fill(DEMO_PASSWORD);
  await page.getByTestId('register-password2').fill(DEMO_PASSWORD);
  const register = page.getByRole('button', { name: 'Tạo tài khoản' });
  await register.click();
  await expectBusy(register, page.getByTestId('busy-note'), 'Đang tạo tài khoản…');
  release();
  await expect(page.getByTestId('busy-note')).toHaveCount(0);
});

test('đang gửi: Thêm thành viên, Lưu bản mới, Xuất hiện chữ phụ rồi hết khi xong', async ({ page }) => {
  await openYteAsOwner(page);

  const row = page.getByRole('listitem').filter({ hasText: 'Khảo sát hộ gia đình' });
  const releaseExport = await hold(page, '**/api/projects/*/export/**', { reply: true });
  await row.getByRole('button', { name: 'Xuất', exact: true }).click();
  await row.getByRole('button', { name: 'Xuất CSV' }).click();
  // Chọn xong thì hai lựa chọn đóng lại, vòng xoay nằm ở nút [Xuất ▾] (TV1-12 b2)
  await expectBusy(row.getByRole('button', { name: 'Xuất', exact: true }), row.getByTestId('busy-note'), 'Đang xuất…');
  // Mỗi lần một file: đang xuất thì không mở lại được hai lựa chọn
  await expect(row.getByRole('button', { name: 'Xuất JSON' })).toHaveCount(0);
  releaseExport();
  await expect(row.getByTestId('busy-note')).toHaveCount(0);

  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await page.getByLabel('Tiêu đề').fill('Form đang lưu');
  await page.getByLabel('Loại trường').selectOption({ label: 'Chữ' });
  await page.getByRole('button', { name: '+ Thêm trường' }).click();
  await page.getByTestId('field-editor').getByLabel('Nhãn').fill('Tên');
  const releaseSave = await hold(page, '**/api/projects/*/forms', { method: 'POST', reply: true });
  const save = page.getByRole('button', { name: 'Lưu bản mới' });
  await save.click();
  await expectBusy(save, page.getByTestId('busy-note'), 'Đang lưu…');
  releaseSave();
  await expect(page.getByTestId('busy-note')).toHaveCount(0);

  await page.goto('/#/members');
  await expect(page.getByTestId('member-chu')).toBeVisible();
  const releaseAdd = await hold(page, '**/api/projects/*/members', { method: 'POST', reply: true });
  await page.getByTestId('member-username').fill('khong.ai.ca');
  const add = page.getByRole('button', { name: 'Thêm' });
  await add.click();
  await expectBusy(add, page.getByTestId('busy-note'), 'Đang thêm…');
  releaseAdd();
  await expect(page.getByTestId('busy-note')).toHaveCount(0);
});

test('đang gửi: Gửi yêu cầu mở tổ chức hiện chữ phụ', async ({ page }) => {
  await login(page, 'minh');
  await page.goto('/#/orgs');
  await expect(page.getByTestId('directory').or(page.getByTestId('directory-empty'))).toBeVisible();
  const release = await hold(page, '**/api/project-requests', { method: 'POST', reply: true });
  await page.getByTestId('org-request-name').fill('Tổ chức đang gửi');
  const send = page.getByRole('button', { name: 'Gửi yêu cầu' });
  await send.click();
  await expectBusy(send, page.getByTestId('busy-note'), 'Đang gửi yêu cầu…');
  release();
  await expect(page.getByTestId('busy-note')).toHaveCount(0);
});
