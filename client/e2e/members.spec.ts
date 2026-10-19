import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, answerConfirm, authHeaders, createProject, login, setMembership } from './helpers';

// Màn hình Thành viên (TV1-08 phần 2; ui.md màn hình 6, design §4.7). Server E2E dùng chung một CSDL,
// nên mỗi test có dự án riêng "b-…" (đứng trước "demo-…" trong /me, nên đăng nhập là vào thẳng dự án
// này) với chu là Owner. Cuối test rút mọi người ra để không ảnh hưởng file test khác.

let project = '';
const api = (path: string) => `http://localhost:3001/api/projects/${project}${path}`;

test.beforeEach(async ({ request }) => {
  project = `b-${crypto.randomUUID().slice(0, 8)}`;
  await createProject(request, project, `Thành viên ${project}`);
  await setMembership(request, project, 'u_chu', 'owner');
});

test.afterEach(async ({ request }) => {
  for (const userId of ['u_chu', 'u_lan', 'u_minh']) await setMembership(request, project, userId, null);
});

async function serverMembers(request: APIRequestContext) {
  const res = await request.get(api('/members'), { headers: authHeaders(TOKENS.chu) });
  expect(res.status()).toBe(200);
  return (await res.json()) as { username: string; role: string }[];
}

async function openMembers(page: Page, username: string) {
  await login(page, username);
  await page.getByRole('link', { name: 'Thành viên' }).click();
  await expect(page.getByTestId('members')).toBeVisible({ timeout: 10_000 });
}

async function add(page: Page, username: string, roleLabel: string) {
  await page.getByTestId('member-username').fill(username);
  await page.getByRole('combobox', { name: 'Vai trò', exact: true }).selectOption({ label: roleLabel });
  await page.getByRole('button', { name: 'Thêm' }).click();
}

const row = (page: Page, username: string) => page.getByTestId(`member-${username}`);
const error = (page: Page) => page.getByTestId('member-error');

test('Owner thêm bằng tên đăng nhập, báo lỗi đúng, đổi vai trò và rút có xác nhận', async ({ page, request }) => {
  await openMembers(page, 'chu');
  await expect(row(page, 'chu')).toContainText('Owner');

  await add(page, 'lan', 'Giám sát viên');
  await expect(row(page, 'lan')).toContainText('Giám sát viên');
  await expect(page.getByTestId('member-username')).toHaveValue('');
  await add(page, ' MINH ', 'Điều tra viên');
  await expect(row(page, 'minh')).toContainText('Điều tra viên');

  await add(page, 'khong.co.ai', 'Điều tra viên');
  await expect(error(page)).toHaveText('Không có tên đăng nhập này');
  await add(page, 'minh', 'Owner');
  await expect(error(page)).toHaveText('Người này đã là thành viên');
  await add(page, 'admin', 'Owner');
  await expect(error(page)).toHaveText('Không thêm được tài khoản quản trị');

  await page.getByLabel('Đổi vai trò minh').selectOption({ label: 'Giám sát viên' });
  await expect(row(page, 'minh')).toContainText('Giám sát viên');

  // Huỷ (hoặc Esc) ở hộp xác nhận thì không rút
  await page.getByRole('button', { name: 'Rút minh' }).click();
  await answerConfirm(page, 'Rút minh (minh) khỏi tổ chức?', 'Huỷ');
  await page.getByRole('button', { name: 'Rút minh' }).click();
  await answerConfirm(page, 'Rút minh (minh) khỏi tổ chức?', 'Esc');
  await expect(row(page, 'minh')).toBeVisible();

  await page.getByRole('button', { name: 'Rút minh' }).click();
  await answerConfirm(page, 'Rút minh (minh) khỏi tổ chức?', 'Rút');
  await expect(row(page, 'minh')).toHaveCount(0);

  expect((await serverMembers(request)).map((m) => [m.username, m.role])).toEqual([
    ['chu', 'owner'],
    ['lan', 'supervisor'],
  ]);
});

test('Owner cuối cùng không tự hạ, tự rút được: hỏi rõ mất quyền rồi báo lỗi last_owner', async ({ page, request }) => {
  await openMembers(page, 'chu');

  await page.getByLabel('Đổi vai trò chu').selectOption({ label: 'Giám sát viên' });
  await answerConfirm(page, 'Bạn sẽ mất quyền Owner ngay, chỉ còn quyền Giám sát viên. Tiếp tục?', 'Đổi vai trò');
  await expect(error(page)).toHaveText('Tổ chức phải còn ít nhất một Owner');

  await page.getByRole('button', { name: 'Rút chu' }).click();
  await answerConfirm(page, 'Bạn sẽ rời tổ chức này ngay và không xem được dữ liệu của tổ chức nữa. Tiếp tục?', 'Rút');
  await expect(error(page)).toHaveText('Tổ chức phải còn ít nhất một Owner');
  expect(await serverMembers(request)).toEqual([expect.objectContaining({ username: 'chu', role: 'owner' })]);
});

test('Owner tự hạ khi còn Owner khác: về trang chủ, vai trò mới có hiệu lực ngay', async ({ page, request }) => {
  await setMembership(request, project, 'u_lan', 'owner');
  await openMembers(page, 'chu');

  await page.getByLabel('Đổi vai trò chu').selectOption({ label: 'Điều tra viên' });
  await answerConfirm(page, 'Bạn sẽ mất quyền Owner ngay, chỉ còn quyền Điều tra viên. Tiếp tục?', 'Đổi vai trò');

  await expect(page.getByRole('heading', { name: 'Phiếu đã nhập' })).toBeVisible({ timeout: 10_000 });
  // /me đã tải lại: điều tra viên không còn thấy nút Thành viên
  await expect(page.getByRole('link', { name: 'Thành viên' })).toHaveCount(0, { timeout: 10_000 });
  const res = await request.get(api('/members'), { headers: authHeaders(TOKENS.lan) });
  expect(await res.json()).toContainEqual(expect.objectContaining({ username: 'chu', role: 'surveyor' }));
});

test('supervisor chỉ thấy thao tác với điều tra viên, không có ở dòng của mình', async ({ page, request }) => {
  await setMembership(request, project, 'u_lan', 'supervisor');
  await setMembership(request, project, 'u_minh', 'surveyor');
  await openMembers(page, 'lan');

  await expect(row(page, 'minh').getByRole('button', { name: 'Rút minh' })).toBeVisible();
  await expect(page.getByLabel('Đổi vai trò minh')).toHaveCount(0);
  for (const username of ['lan', 'chu']) {
    await expect(row(page, username).getByRole('button')).toHaveCount(0);
    await expect(row(page, username).getByRole('combobox')).toHaveCount(0);
  }
  // Chỉ thêm được điều tra viên; không có khối cài đặt tổ chức
  await expect(page.getByRole('combobox', { name: 'Vai trò', exact: true }).getByRole('option')).toHaveText(['Điều tra viên']);
  await expect(page.getByTestId('org-public')).toHaveCount(0);

  await page.getByRole('button', { name: 'Rút minh' }).click();
  await answerConfirm(page, 'Rút minh (minh) khỏi tổ chức?', 'Rút');
  await expect(row(page, 'minh')).toHaveCount(0);
});

test('Owner đổi tên tổ chức và bật công khai', async ({ page, request }) => {
  await openMembers(page, 'chu');

  await expect(page.getByTestId('org-public')).not.toBeChecked();
  // Ô hiện theo giá trị server trả về nên không đổi ngay lúc bấm: dùng click, không dùng check()
  await page.getByTestId('org-public').click();
  await expect(page.getByTestId('org-public')).toBeChecked();

  await page.getByRole('textbox', { name: 'Tên tổ chức' }).fill('  Y tế Tân Lập  ');
  await page.getByRole('button', { name: 'Lưu tên' }).click();
  await expect(page.getByRole('button', { name: 'Lưu tên' })).toBeDisabled();
  // Bộ chọn dự án lấy tên mới sau vòng đồng bộ
  await expect(page.getByTestId('project-switcher')).toContainText('Y tế Tân Lập', { timeout: 10_000 });

  const res = await request.get(api('/settings'), { headers: authHeaders(TOKENS.chu) });
  expect(await res.json()).toEqual({ name: 'Y tế Tân Lập', public: true });

  // Mở lại trang vẫn thấy đúng trạng thái đã lưu
  await page.reload();
  await expect(page.getByTestId('org-public')).toBeChecked({ timeout: 10_000 });
  await expect(page.getByRole('textbox', { name: 'Tên tổ chức' })).toHaveValue('Y tế Tân Lập');
});

test('offline: báo cần kết nối, có mạng lại thì Thử lại được', async ({ page, context }) => {
  await login(page, 'chu');
  await context.setOffline(true);
  await page.getByRole('link', { name: 'Thành viên' }).click();
  await expect(page.getByRole('alert')).toContainText('Cần kết nối mạng để quản lý thành viên', { timeout: 15_000 });

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(row(page, 'chu')).toBeVisible({ timeout: 10_000 });
});
