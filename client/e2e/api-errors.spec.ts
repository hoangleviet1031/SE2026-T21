import { expect, test, type Page } from '@playwright/test';
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
  await expect(switcher.getByRole('button', { expanded: false })).toHaveText('Y tế xã (demo) ▾');
}

test('Thành viên: 5xx khi tải báo lỗi kèm Thử lại; 5xx khi thêm báo dưới form', async ({ page }) => {
  await openYteAsOwner(page);
  await page.route('**/api/projects/*/members', (route) => route.fulfill(fail500));
  await page.getByRole('link', { name: 'Thành viên' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Máy chủ đang lỗi, thử lại sau');
  await expect(page.getByText('Đang tải…')).toHaveCount(0);

  await page.unroute('**/api/projects/*/members');
  await alert.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByTestId('member-chu')).toBeVisible();

  await page.route('**/api/projects/*/members', (route) =>
    route.request().method() === 'POST' ? route.fulfill(fail500) : route.continue(),
  );
  await page.getByTestId('member-username').fill('khong.ai.ca');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await expect(page.getByTestId('member-error')).toHaveText('Máy chủ đang lỗi, thử lại sau');
});

test('Tổ chức: 5xx khi tải báo lỗi, không để trang trống không lời', async ({ page }) => {
  await login(page, 'minh');
  await page.route('**/api/directory', (route) => route.fulfill(fail500));
  await page.goto('/#/orgs');
  await expect(page.getByTestId('orgs').getByRole('alert')).toHaveText(SERVER_ERROR);
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
  await row.getByRole('button', { name: 'Xuất JSON' }).click();
  await expect(row.getByRole('alert')).toHaveText(SERVER_ERROR);
});

test('401: phiên bị huỷ trên server → về Đăng nhập, báo hết phiên, giữ CSDL dự án; đăng nhập lại thì hết câu', async ({
  page,
  request,
}) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
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
