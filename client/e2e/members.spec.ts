import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
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

/** Chọn vai trò ở ô của dòng rồi bấm [Đổi]: ô chọn không tự gửi (ui.md màn hình 6, TV1-12). */
async function changeRole(page: Page, username: string, roleLabel: string) {
  await page.getByLabel(`Vai trò mới của ${username}`).selectOption({ label: roleLabel });
  await page.getByRole('button', { name: `Đổi vai trò ${username}` }).click();
}

const row = (page: Page, username: string) => page.getByTestId(`member-${username}`);
const roleLabel = (page: Page, username: string) => page.getByTestId(`member-role-${username}`);
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
  // Câu lỗi có "⚠ " đứng trước như Đăng nhập, Tổ chức (TV1-12 màn hình 6, Dương chốt 2026-10-24)
  await expect(error(page)).toHaveText('⚠ Không có tên đăng nhập này');
  await add(page, 'minh', 'Owner');
  await expect(error(page)).toHaveText('⚠ Người này đã là thành viên');
  await add(page, 'admin', 'Owner');
  await expect(error(page)).toHaveText('⚠ Không thêm được tài khoản quản trị');

  await changeRole(page, 'minh', 'Giám sát viên');
  await expect(roleLabel(page, 'minh')).toHaveText('Giám sát viên');

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

  await changeRole(page, 'chu', 'Giám sát viên');
  await answerConfirm(page, 'Bạn sẽ mất quyền Owner ngay, chỉ còn quyền Giám sát viên. Tiếp tục?', 'Đổi vai trò');
  await expect(error(page)).toHaveText('⚠ Tổ chức phải còn ít nhất một Owner');

  await page.getByRole('button', { name: 'Rút chu' }).click();
  await answerConfirm(page, 'Bạn sẽ rời tổ chức này ngay và không xem được dữ liệu của tổ chức nữa. Tiếp tục?', 'Rút');
  await expect(error(page)).toHaveText('⚠ Tổ chức phải còn ít nhất một Owner');
  expect(await serverMembers(request)).toEqual([expect.objectContaining({ username: 'chu', role: 'owner' })]);
});

test('Owner tự hạ khi còn Owner khác: về trang chủ, vai trò mới có hiệu lực ngay', async ({ page, request }) => {
  await setMembership(request, project, 'u_lan', 'owner');
  await openMembers(page, 'chu');

  await changeRole(page, 'chu', 'Điều tra viên');
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
  await expect(page.getByLabel('Vai trò mới của minh')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Đổi vai trò minh' })).toHaveCount(0);
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

// Đổi 5 (TV1-12 b2): tên và vai trò hai dòng, bỏ " · "; tên đọc ra của thao tác giữ nguyên
test('dòng thành viên: tên và vai trò hai dòng, không còn dấu " · "; Rút đủ cao để bấm', async ({ page, request }) => {
  await setMembership(request, project, 'u_minh', 'surveyor');
  await openMembers(page, 'chu');
  const minh = row(page, 'minh');
  await expect(minh).toContainText('(minh)');
  await expect(minh).toContainText('Điều tra viên');
  await expect(minh).not.toContainText('·');
  await expect(minh.getByRole('combobox', { name: 'Vai trò mới của minh' })).toBeVisible();
  await expect(minh.getByRole('button', { name: 'Đổi vai trò minh' })).toBeVisible();
  const box = await minh.getByRole('button', { name: 'Rút minh' }).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

// Audit C1 (TV1-12 màn hình 6): ô chọn chỉ ghi vai trò muốn đổi, bấm [Đổi] mới gửi
test('đổi vai trò người khác: chọn ở ô chưa gửi gì, [Đổi] khoá tới khi chọn, bấm mới đổi', async ({ page, request }) => {
  await setMembership(request, project, 'u_minh', 'surveyor');
  const puts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/members/')) puts.push(r.url());
  });
  await openMembers(page, 'chu');
  const doi = page.getByRole('button', { name: 'Đổi vai trò minh' });
  await expect(doi).toBeDisabled();

  await page.getByLabel('Vai trò mới của minh').selectOption({ label: 'Giám sát viên' });
  await expect(doi).toBeEnabled();
  // Đọc nhãn vai trò, không đọc cả dòng: chữ <option> trong ô chọn cũng có "Giám sát viên"
  await expect(roleLabel(page, 'minh')).toHaveText('Điều tra viên');
  expect(puts).toHaveLength(0);

  await doi.click();
  await expect(roleLabel(page, 'minh')).toHaveText('Giám sát viên');
  // Xong thì ô về "Đổi vai trò…", [Đổi] khoá lại
  await expect(page.getByLabel('Vai trò mới của minh')).toHaveValue('');
  await expect(doi).toBeDisabled();
  // Chờ server đổi xong rồi mới đếm: chỉ một lần gửi, lúc bấm [Đổi], không phải lúc chọn ở ô
  await expect
    .poll(async () => (await serverMembers(request)).find((m) => m.username === 'minh')?.role)
    .toBe('supervisor');
  expect(puts).toHaveLength(1);

  // "← Quay lại" ở đầu trang, không còn link cuối trang (ui.md màn hình 6)
  await expect(page.getByRole('link', { name: '← Về danh sách phiếu' })).toHaveCount(0);
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(page.getByRole('heading', { name: 'Phiếu đã nhập' })).toBeVisible();
});

// Thêm nhiều người một lần (Could, ui.md màn hình 6, design §4.7)
const box = (page: Page) => page.getByTestId('member-username');
const results = (page: Page) => page.getByTestId('member-result-summary');
const line = (page: Page, username: string) => page.getByTestId(`member-result-${username}`);
const addButton = (page: Page) => page.getByRole('button', { name: 'Thêm', exact: true });

async function addMany(page: Page, text: string, roleLabel = 'Điều tra viên') {
  await box(page).fill(text);
  await page.getByRole('combobox', { name: 'Vai trò', exact: true }).selectOption({ label: roleLabel });
  await addButton(page).click();
}

/** Cho POST thứ `nth` trở đi đi theo `handle`, các POST trước và mọi GET đi thật. Trả về hàm đếm số POST đã gửi. */
async function failPostFrom(page: Page, nth: number, handle: (route: Route) => Promise<void>) {
  let posts = 0;
  await page.route('**/api/projects/*/members', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    if (posts >= nth) return handle(route);
    return route.continue();
  });
  return () => posts;
}

test('thêm nhiều: hết được thì ô rỗng, danh sách và server khớp', async ({ page, request }) => {
  await openMembers(page, 'chu');
  await addMany(page, 'lan\nMinh\n');

  await expect(results(page)).toHaveText('Đã thêm 2/2 tên.');
  await expect(page.getByTestId('member-result-status')).toHaveText('Đã thêm 2/2 tên.');
  await expect(line(page, 'lan')).toContainText('Đã thêm');
  await expect(box(page)).toHaveValue('');
  await expect(roleLabel(page, 'lan')).toHaveText('Điều tra viên');
  await expect(roleLabel(page, 'minh')).toHaveText('Điều tra viên');
  expect((await serverMembers(request)).map((m) => m.username)).toEqual(['chu', 'lan', 'minh']);
  await expect(addButton(page)).toBeDisabled();
});

test('thêm nhiều: thêm được một phần, báo từng dòng, trong ô chỉ còn tên thử lại có ích', async ({ page, request }) => {
  await openMembers(page, 'chu');
  await addMany(page, 'lan, khong.co.ai; chu\nadmin\tLAN\nNguyen Van An');

  await expect(results(page)).toHaveText('Đã thêm 1/5 tên. Bỏ 1 tên trùng.');
  await expect(line(page, 'lan')).toContainText('Đã thêm');
  await expect(line(page, 'khong.co.ai')).toContainText('⚠ Không có tên đăng nhập này');
  await expect(line(page, 'chu')).toContainText('⚠ Người này đã là thành viên');
  await expect(line(page, 'admin')).toContainText('⚠ Không thêm được tài khoản quản trị');
  await expect(line(page, 'nguyen van an')).toContainText('⚠ Không có tên đăng nhập này');
  await expect(box(page)).toHaveValue('khong.co.ai\nnguyen van an');
  await expect(error(page)).toHaveCount(0);
  await expect(row(page, 'lan')).toBeVisible();
  expect((await serverMembers(request)).map((m) => m.username)).toEqual(['chu', 'lan']);

  // Thao tác khác làm phản hồi cũ mất
  await page.getByRole('button', { name: 'Rút lan' }).click();
  await answerConfirm(page, 'Rút lan (lan) khỏi tổ chức?', 'Rút');
  await expect(results(page)).toHaveCount(0);
});

test('thêm nhiều: dán tin chia sẻ ra đúng tên, một tên đi đường cũ', async ({ page }) => {
  await openMembers(page, 'chu');
  await addMany(page, 'Tên đăng nhập của tôi: lan\nTên đăng nhập của tôi: minh');
  await expect(results(page)).toHaveText('Đã thêm 2/2 tên.');

  // Một tên: lỗi hiện một câu, không có bảng kết quả, chữ người dùng nhập giữ nguyên trong ô
  await addMany(page, 'Tên đăng nhập của tôi: khong.co.ai');
  await expect(error(page)).toHaveText('⚠ Không có tên đăng nhập này');
  await expect(results(page)).toHaveCount(0);
  await expect(box(page)).toHaveValue('Tên đăng nhập của tôi: khong.co.ai');
});

test('thêm nhiều: chỉ có dấu phân cách hoặc câu chia sẻ thì [Thêm] khoá', async ({ page }) => {
  await openMembers(page, 'chu');
  await expect(addButton(page)).toBeDisabled();
  await box(page).fill(' ,;\n ');
  await expect(addButton(page)).toBeDisabled();
  await box(page).fill('Tên đăng nhập của tôi: ');
  await expect(addButton(page)).toBeDisabled();
  await box(page).fill('lan');
  await expect(addButton(page)).toBeEnabled();
});

test('thêm nhiều: supervisor chỉ thêm được điều tra viên', async ({ page, request }) => {
  await setMembership(request, project, 'u_lan', 'supervisor');
  await openMembers(page, 'lan');
  await expect(page.getByRole('combobox', { name: 'Vai trò', exact: true }).getByRole('option')).toHaveText(['Điều tra viên']);

  await addMany(page, 'minh\nkhong.co.ai');
  await expect(results(page)).toHaveText('Đã thêm 1/2 tên.');
  await expect(roleLabel(page, 'minh')).toHaveText('Điều tra viên');
});

test('thêm nhiều: Owner chọn Giám sát viên thì không hỏi, cả danh sách cùng vai trò', async ({ page }) => {
  await openMembers(page, 'chu');
  await addMany(page, 'lan\nminh', 'Giám sát viên');
  await expect(results(page)).toHaveText('Đã thêm 2/2 tên.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(roleLabel(page, 'lan')).toHaveText('Giám sát viên');
  await expect(roleLabel(page, 'minh')).toHaveText('Giám sát viên');
});

test('thêm nhiều với vai trò Owner: Huỷ không gửi gì, ô giữ nguyên; xác nhận thì thêm đủ', async ({ page, request }) => {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/members')) posts.push(r.url());
  });
  await openMembers(page, 'chu');

  await addMany(page, 'lan\nminh\nLAN', 'Owner');
  await answerConfirm(page, 'Thêm 2 người với vai trò Owner?', 'Huỷ');
  await expect(box(page)).toHaveValue('lan\nminh\nLAN');
  await expect(results(page)).toHaveCount(0);
  expect(posts).toHaveLength(0);

  await addButton(page).click();
  await answerConfirm(page, 'Thêm 2 người với vai trò Owner?', 'Thêm');
  await expect(results(page)).toHaveText('Đã thêm 2/2 tên. Bỏ 1 tên trùng.');
  expect(posts).toHaveLength(2);
  expect((await serverMembers(request)).map((m) => [m.username, m.role])).toEqual([
    ['chu', 'owner'],
    ['lan', 'owner'],
    ['minh', 'owner'],
  ]);
});

test('thêm một Owner rồi vẫn giữ ô Owner: một tên không hỏi', async ({ page }) => {
  await openMembers(page, 'chu');
  await addMany(page, 'lan', 'Owner');
  await expect(roleLabel(page, 'lan')).toHaveText('Owner');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('thêm nhiều: mất mạng giữa chừng thì dừng, giữ form và tên chưa gửi, có mạng lại thử được', async ({ page }) => {
  await openMembers(page, 'chu');
  const posts = await failPostFrom(page, 2, (route) => route.abort());

  await addMany(page, 'lan\nminh\nkhong.co.ai');
  await expect(error(page)).toHaveText('⚠ Cần kết nối mạng để quản lý thành viên');
  await expect(results(page)).toHaveText('Đã thêm 1/3 tên.');
  await expect(line(page, 'minh')).toContainText('Chưa gửi');
  await expect(line(page, 'khong.co.ai')).toContainText('Chưa gửi');
  expect(posts()).toBe(2);
  await expect(box(page)).toHaveValue('minh\nkhong.co.ai');
  // GET sau loạt vẫn chạy nên người đầu vào danh sách
  await expect(row(page, 'lan')).toBeVisible();

  await page.unroute('**/api/projects/*/members');
  await addButton(page).click();
  await expect(results(page)).toHaveText('Đã thêm 1/2 tên.');
  await expect(row(page, 'minh')).toBeVisible();
  await expect(box(page)).toHaveValue('khong.co.ai');
  await expect(error(page)).toHaveCount(0);
});

test('thêm nhiều: 5xx và forbidden giữa chừng thì dừng, không gửi tiếp', async ({ page }) => {
  await openMembers(page, 'chu');
  const posts = await failPostFrom(page, 2, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error' }) }),
  );
  await addMany(page, 'lan\nminh\nkhong.co.ai');
  await expect(error(page)).toHaveText('⚠ Máy chủ đang lỗi, thử lại sau');
  expect(posts()).toBe(2);
  await expect(box(page)).toHaveValue('minh\nkhong.co.ai');
  await page.unroute('**/api/projects/*/members');

  const forbidden = await failPostFrom(page, 1, (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'forbidden' }) }),
  );
  await addButton(page).click();
  await expect(error(page)).toHaveText('⚠ Bạn không có quyền làm việc này');
  expect(forbidden()).toBe(1);
  await expect(results(page)).toHaveText('Đã thêm 0/2 tên.');
  await expect(box(page)).toHaveValue('minh\nkhong.co.ai');
});

test('thêm nhiều: làm mới danh sách lỗi thì giữ form, bảng kết quả, danh sách cũ, không có câu mới', async ({ page }) => {
  await openMembers(page, 'chu');
  await page.route('**/api/projects/*/members', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error' }) })
      : route.continue(),
  );

  await addMany(page, 'lan\nkhong.co.ai');
  await expect(results(page)).toHaveText('Đã thêm 1/2 tên.');
  await expect(addButton(page)).toBeEnabled();
  await expect(box(page)).toHaveValue('khong.co.ai');
  await expect(error(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  await expect(row(page, 'chu')).toBeVisible();
  await expect(row(page, 'lan')).toHaveCount(0);
});

test('thêm nhiều: trong lúc chạy Thêm, Rút, ô nhập đều khoá', async ({ page, request }) => {
  await setMembership(request, project, 'u_minh', 'surveyor');
  await openMembers(page, 'chu');
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects/*/members', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });

  await addMany(page, 'lan\nkhong.co.ai');
  await expect(addButton(page)).toBeDisabled();
  await expect(box(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Rút minh' })).toBeDisabled();
  await expect(page.getByTestId('busy-note')).toHaveText('Đang thêm…');
  release();
  await expect(results(page)).toHaveText('Đã thêm 1/2 tên.');
  await expect(page.getByRole('button', { name: 'Rút minh' })).toBeEnabled();
});

test('thêm nhiều: quá 50 tên thì không gửi gì', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/members')) posts.push(r.url());
  });
  await openMembers(page, 'chu');
  const text = Array.from({ length: 51 }, (_, i) => `ten${i}`).join('\n');
  await addMany(page, text, 'Owner');
  await expect(error(page)).toHaveText('⚠ Tối đa 50 tên mỗi lần, danh sách đang có 51 tên');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(box(page)).toHaveValue(text);
  expect(posts).toHaveLength(0);
});

test('ô thêm người: bàn phím, nhãn, gợi ý, cỡ chữ, viền focus, tắt tự sửa', async ({ page }) => {
  await openMembers(page, 'chu');
  const input = page.getByRole('textbox', { name: 'Thêm theo tên đăng nhập', exact: true });
  await expect(input).toHaveAccessibleDescription('Mỗi dòng một tên, hoặc cách nhau bằng dấu phẩy. Tối đa 50 tên mỗi lần.');
  await expect(input).toHaveAttribute('autocapitalize', 'none');
  await expect(input).toHaveAttribute('autocorrect', 'off');
  await expect(input).toHaveAttribute('spellcheck', 'false');
  // iOS tự phóng trang khi ô nhập chữ dưới 16px
  expect(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

  await input.focus();
  await page.keyboard.type('lan');
  // Viền đen của ô đang có con trỏ (tech-debt N16)
  const ink = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--ink)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(input).toHaveCSS('border-top-color', ink);
  // Enter xuống dòng, không gửi
  await page.keyboard.press('Enter');
  await page.keyboard.type('minh');
  await expect(input).toHaveValue('lan\nminh');
  await expect(results(page)).toHaveCount(0);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Vai trò', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(addButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(results(page)).toHaveText('Đã thêm 2/2 tên.');
  await expect(page.getByTestId('member-result-status')).toHaveText('Đã thêm 2/2 tên.');
});

test('360px: tên dán vào dài không làm trang cuộn ngang, ô kéo cao không vỡ', async ({ page }) => {
  await openMembers(page, 'chu');
  await page.setViewportSize({ width: 360, height: 740 });
  await addMany(page, `${'a'.repeat(120)}\n${'b'.repeat(120)}`);
  await expect(results(page)).toHaveText('Đã thêm 0/2 tên.');
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(await noScroll()).toBe(true);

  await expect(box(page)).toHaveCSS('resize', 'vertical');
  await box(page).evaluate((el) => {
    el.style.height = '400px';
  });
  expect(await noScroll()).toBe(true);
  const rect = await box(page).boundingBox();
  expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(360);
});

// Audit C9: không đủ quyền thì vẫn có lối về, không thành ngõ cụt
test('điều tra viên mở #/members: báo không có quyền, có ← Quay lại về trang chủ', async ({ page, request }) => {
  await setMembership(request, project, 'u_minh', 'surveyor');
  await login(page, 'minh');
  await page.goto('/#/members');
  await expect(page.getByText('Chỉ giám sát viên và Owner xem được trang này.')).toBeVisible();
  await expect(page.getByTestId('members')).toHaveCount(0);
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(page.getByRole('heading', { name: 'Phiếu đã nhập' })).toBeVisible();
});
