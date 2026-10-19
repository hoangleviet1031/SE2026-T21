import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, authHeaders, createProject, login, readStore, setMembership } from './helpers';

// Màn hình Tổ chức (TV1-15; ui.md màn hình 9, design §4.7), ca Q8 và M3 (§10.1). Server E2E dùng chung
// một CSDL và đếm đăng ký thành công theo IP (5 lần/giờ): chỉ Q8 tạo tài khoản qua màn hình, các ca
// khác dùng tài khoản demo trên dự án riêng "b-…". Yêu cầu mở tổ chức của tài khoản demo bị huỷ hoặc
// xử lý hết trong từng test để không chạm giới hạn 1 yêu cầu chờ.

const BASE = 'http://localhost:3001/api';
const created: string[] = [];

test.afterEach(async ({ request }) => {
  for (const id of created.splice(0)) {
    for (const userId of ['u_chu', 'u_lan', 'u_minh']) await setMembership(request, id, userId, null);
  }
});

const suffix = () => crypto.randomUUID().slice(0, 8);

/** Admin duyệt hoặc từ chối yêu cầu đang chờ có tên `name` (qua API, như trang /admin/ sẽ làm). */
async function decide(request: APIRequestContext, name: string, body: { decision: 'approve' | 'reject'; reason?: string }) {
  const list = await request.get(`${BASE}/admin/project-requests`, { headers: authHeaders(TOKENS.admin) });
  expect(list.status()).toBe(200);
  const found = ((await list.json()) as { id: string; name: string }[]).find((r) => r.name === name);
  if (!found) throw new Error(`không có yêu cầu đang chờ "${name}"`);
  const res = await request.post(`${BASE}/admin/project-requests/${found.id}`, {
    headers: authHeaders(TOKENS.admin),
    data: body,
  });
  expect(res.status()).toBe(200);
}

async function sendRequest(page: Page, name: string, note = '') {
  await page.getByTestId('org-request-name').fill(name);
  await page.getByTestId('org-request-note').fill(note);
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
}

const requestRow = (page: Page, name: string) => page.getByTestId('org-requests').getByRole('listitem').filter({ hasText: name });

/** Mở màn hình Tổ chức qua bộ chọn của người có nhiều tổ chức. */
async function openOrgs(page: Page, username: string) {
  await login(page, username);
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('button', { name: 'Tổ chức khác…' }).click();
  await expect(page.getByTestId('orgs')).toBeVisible();
}

test('Q8: tạo tài khoản → gửi yêu cầu → admin duyệt → sau một vòng đồng bộ là Owner, tạo được form', async ({
  page,
  request,
}) => {
  const username = `q8.${suffix()}`;
  await page.goto('/');
  await page.getByRole('tab', { name: 'Tạo tài khoản' }).click();
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('register-name').fill('Người Q8');
  await page.getByTestId('login-password').fill('mat-khau-q8');
  await page.getByTestId('register-password2').fill('mat-khau-q8');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

  // Chưa thuộc tổ chức nào: trang chủ là màn hình Tổ chức, không có link quay lại
  await expect(page.getByTestId('orgs')).toBeVisible();
  await expect(page.getByTestId('orgs-username')).toHaveText(username);
  await expect(page.getByRole('link', { name: '← Về danh sách phiếu' })).toHaveCount(0);

  const orgName = `HTX Q8 ${suffix()}`;
  await sendRequest(page, `  ${orgName}  `, 'Mở cho xã Tân Lập');
  await expect(requestRow(page, orgName).getByTestId('org-request-status')).toHaveText('Đang chờ duyệt');
  await expect(page.getByTestId('org-request-name')).toHaveValue('');
  // Đang có 1 yêu cầu chờ thì không gửi thêm được (409 project_limit_reached)
  await sendRequest(page, `HTX khác ${suffix()}`);
  await expect(page.getByTestId('org-request-error')).toHaveText('⚠ Bạn đã có yêu cầu đang chờ hoặc đã sở hữu 3 tổ chức');

  await decide(request, orgName, { decision: 'approve' });
  await page.getByRole('button', { name: 'Đồng bộ' }).click();

  // Một tổ chức: bộ chọn chỉ hiện tên (kèm link Tổ chức khác…), trang chủ là danh sách phiếu của nó
  await expect(page.getByTestId('project-switcher').getByText(orgName)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('orgs')).toHaveCount(0);
  const projects = (await readStore(page, 'field-survey-account', 'projects')) as { name: string; role: string }[];
  expect(projects.map((p) => [p.name, p.role])).toEqual([[orgName, 'owner']]);

  // Owner tạo được form (ADR 0003 §2)
  const title = `Biểu mẫu Q8 ${suffix()}`;
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await page.getByLabel('Tiêu đề').fill(title);
  await page.getByLabel('Loại trường').selectOption({ label: 'Chữ' });
  await page.getByRole('button', { name: '+ Thêm trường' }).click();
  await page.getByTestId('field-editor').getByLabel('Nhãn').fill('Tên hộ');
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();

  // Đã duyệt thì yêu cầu hiện "Đã duyệt" ở màn hình Tổ chức
  await page.getByRole('link', { name: 'Tổ chức khác…' }).click();
  await expect(requestRow(page, orgName).getByTestId('org-request-status')).toHaveText('Đã duyệt');
});

test('M3: Owner thêm người bằng tên đăng nhập → sau một vòng đồng bộ người đó thấy tổ chức, gửi được phiếu', async ({
  page,
  browser,
  request,
}) => {
  const project = `b-${suffix()}`;
  const projectName = `Tổ chức M3 ${project}`;
  await createProject(request, project, projectName);
  created.push(project);
  await setMembership(request, project, 'u_chu', 'owner');
  const formTitle = `Biểu mẫu M3 ${project}`;
  const form = await request.post(`${BASE}/projects/${project}/forms`, {
    headers: authHeaders(TOKENS.chu),
    data: { id: 'ho', title: formTitle, fields: [{ id: 'ten', type: 'text', label: 'Tên' }] },
  });
  expect(form.status()).toBe(201);

  // minh đang dùng app ở demo-yte, chưa thuộc tổ chức mới
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();

  // chu (Owner) thêm minh ở màn hình Thành viên, trên máy khác
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  await login(ownerPage, 'chu');
  const ownerSwitcher = ownerPage.getByTestId('project-switcher');
  await ownerSwitcher.getByRole('button', { expanded: false }).click();
  await ownerSwitcher.getByRole('listitem').getByRole('button').filter({ hasText: projectName }).click();
  await ownerPage.getByRole('link', { name: 'Thành viên' }).click();
  await ownerPage.getByTestId('member-username').fill('minh');
  await ownerPage.getByRole('combobox', { name: 'Vai trò', exact: true }).selectOption({ label: 'Điều tra viên' });
  await ownerPage.getByRole('button', { name: 'Thêm' }).click();
  await expect(ownerPage.getByTestId('member-minh')).toContainText('Điều tra viên');
  await owner.close();

  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button').filter({ hasText: projectName }).click({ timeout: 15_000 });
  await expect(page.getByText(formTitle)).toBeVisible({ timeout: 15_000 });

  const ten = `Phiếu M3 ${project}`;
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=ten]').fill(ten);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: ten });
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  const pulled = await request.get(`${BASE}/projects/${project}/records?since=0`, { headers: authHeaders(TOKENS.chu) });
  const records = ((await pulled.json()) as { records: { data: { ten?: string }; createdBy: string }[] }).records;
  expect(records.find((r) => r.data.ten === ten)?.createdBy).toBe('u_minh');
});

test('huỷ yêu cầu đang chờ; yêu cầu bị từ chối hiện lý do', async ({ page, request }) => {
  await openOrgs(page, 'lan');

  const cancelled = `Huỷ ${suffix()}`;
  await sendRequest(page, cancelled);
  await expect(requestRow(page, cancelled).getByTestId('org-request-status')).toHaveText('Đang chờ duyệt');
  await requestRow(page, cancelled).getByRole('button', { name: 'Huỷ' }).click();
  await expect(requestRow(page, cancelled).getByTestId('org-request-status')).toHaveText('Đã huỷ');
  await expect(requestRow(page, cancelled).getByRole('button', { name: 'Huỷ' })).toHaveCount(0);

  const rejected = `Từ chối ${suffix()}`;
  await sendRequest(page, rejected);
  await expect(requestRow(page, rejected).getByTestId('org-request-status')).toHaveText('Đang chờ duyệt');
  await decide(request, rejected, { decision: 'reject', reason: 'Trùng tên tổ chức đã có' });
  await page.reload();
  await expect(requestRow(page, rejected).getByTestId('org-request-status')).toHaveText(
    'Bị từ chối: Trùng tên tổ chức đã có',
  );
  // Yêu cầu mới nhất nằm trên cùng
  await expect(page.getByTestId('org-requests').getByRole('listitem').first()).toContainText(rejected);
});

test('danh bạ chỉ có tên tổ chức công khai mình chưa thuộc; kiểm form trước khi gửi; offline báo cần mạng', async ({
  page,
  context,
  request,
}) => {
  const project = `b-${suffix()}`;
  const projectName = `Công khai ${project}`;
  await createProject(request, project, projectName);
  created.push(project);
  await setMembership(request, project, 'u_chu', 'owner');
  const pub = await request.patch(`${BASE}/projects/${project}/settings`, {
    headers: authHeaders(TOKENS.chu),
    data: { public: true },
  });
  expect(pub.status()).toBe(200);

  // lan có hai tổ chức: bộ chọn mở ra có mục "Tổ chức khác…"
  await openOrgs(page, 'lan');
  await expect(page.getByTestId('orgs-username')).toHaveText('lan');
  await expect(page.getByTestId('directory').getByText(projectName)).toBeVisible();
  // Không có nút xin vào
  await expect(page.getByTestId('directory').getByRole('button')).toHaveCount(0);

  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/project-requests')) requests.push(r.url());
  });
  await sendRequest(page, '   ');
  await expect(page.getByTestId('org-request-error')).toHaveText('⚠ Nhập tên tổ chức');
  await sendRequest(page, 'a'.repeat(101));
  await expect(page.getByTestId('org-request-error')).toHaveText('⚠ Tên tổ chức tối đa 100 ký tự');
  await sendRequest(page, 'HTX', 'a'.repeat(501));
  await expect(page.getByTestId('org-request-error')).toHaveText('⚠ Ghi chú tối đa 500 ký tự');
  expect(requests).toEqual([]);

  // chu là thành viên nên không thấy tổ chức này trong danh bạ
  const dir = await request.get(`${BASE}/directory`, { headers: authHeaders(TOKENS.chu) });
  expect(((await dir.json()) as { id: string }[]).map((d) => d.id)).not.toContain(project);

  await context.setOffline(true);
  await expect(page.getByText('⚠ Cần kết nối mạng để dùng chức năng này')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi yêu cầu' })).toBeDisabled();

  await page.getByRole('link', { name: '← Về danh sách phiếu' }).click();
  await expect(page.getByTestId('orgs')).toHaveCount(0);
});
