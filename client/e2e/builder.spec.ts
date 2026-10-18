import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, authHeaders, createProject, login, setMembership } from './helpers';

// Form builder (TV1-04; design §4.1, ui.md màn hình 5). Server E2E dùng chung một CSDL cho mọi
// file test, nên form tạo ở đây nằm trong một dự án riêng của từng test: dự án demo vẫn chỉ có
// một form như các test khác giả định. Id bắt đầu bằng "b-" để đứng trước "demo-…" trong /me,
// nên lan đăng nhập là vào thẳng dự án này (dự án đầu tiên, design §4.7).

let project = '';
const api = (path: string) => `http://localhost:3001/api/projects/${project}${path}`;

test.beforeEach(async ({ request }) => {
  project = `b-${crypto.randomUUID().slice(0, 8)}`;
  await createProject(request, project, `Builder ${project}`);
  await setMembership(request, project, 'u_lan', 'supervisor');
});

test.afterEach(async ({ request }) => {
  await setMembership(request, project, 'u_lan', null);
});

/** Thêm một trường qua builder và đặt nhãn (cùng lựa chọn nếu là select). */
async function addField(page: Page, typeLabel: string, label: string, options?: string[]) {
  await page.getByLabel('Loại trường').selectOption({ label: typeLabel });
  await page.getByRole('button', { name: '+ Thêm trường' }).click();
  const editor = page.getByTestId('field-editor');
  await editor.getByLabel('Nhãn').fill(label);
  if (options) await editor.getByLabel('Lựa chọn (mỗi dòng một lựa chọn)').fill(options.join('\n'));
}

async function serverForms(request: APIRequestContext) {
  const res = await request.get(api('/forms'), { headers: authHeaders(TOKENS.lan) });
  expect(res.status()).toBe(200);
  return (await res.json()) as { id: string; version: number; fields: { id: string; type: string }[] }[];
}

function formRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

test('tạo form đủ 7 loại trường, lưu, thấy ngay ở trang chủ và tạo được phiếu từ form đó', async ({
  page,
  request,
}) => {
  const title = `Khảo sát nước ${crypto.randomUUID().slice(0, 4)}`;
  await login(page, 'lan');
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await page.getByLabel('Tiêu đề').fill(title);

  await addField(page, 'Chữ', 'Tên chủ hộ');
  // Mã gợi ý từ nhãn, bỏ dấu (nhóm chốt khi làm TV1-04)
  await expect(page.getByTestId('field-editor').getByLabel('Mã', { exact: true })).toHaveValue('tenChuHo');
  await page.getByTestId('field-editor').getByLabel('Bắt buộc').check();
  await addField(page, 'Số', 'Số người');
  await addField(page, 'Chọn một', 'Nguồn nước', ['Máy', 'Giếng']);
  await addField(page, 'Chọn nhiều', 'Đồ dùng', ['Tivi', 'Tủ lạnh']);
  await addField(page, 'Ngày', 'Ngày khảo sát');
  await addField(page, 'Ảnh', 'Ảnh nhà');
  await addField(page, 'Vị trí GPS', 'Vị trí');

  // Thêm nhầm thì xoá được vì chưa lưu; đổi thứ tự bằng nút lên
  await addField(page, 'Chữ', 'Thừa');
  await page.getByRole('button', { name: 'Xoá trường' }).click();
  const rows = page.getByTestId('builder-fields').getByRole('listitem');
  await expect(rows).toHaveCount(7);
  await rows.nth(1).getByRole('button', { name: 'Lên' }).click();
  await expect(rows.first()).toContainText('Số người');

  // Xem trước chỉ để nhìn, ô nhập bị khoá
  await page.getByRole('button', { name: 'Xem trước' }).click();
  await expect(page.getByTestId('builder-preview').getByLabel('Tên chủ hộ *')).toBeDisabled();

  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(formRow(page, title)).toBeVisible();

  const saved = (await serverForms(request)).find((f) => f.id.startsWith('khaoSatNuoc'));
  expect(saved?.version).toBe(1);
  expect(saved?.fields.map((f) => f.type)).toEqual(['number', 'text', 'select', 'multiselect', 'date', 'photo', 'gps']);

  await formRow(page, title).getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=tenChuHo]').fill('Hộ ông Ba');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(
    page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Hộ ông Ba' }).getByTestId('sync-state'),
  ).toHaveText('Đã đồng bộ', { timeout: 15_000 });
});

test('sửa form tạo version mới; phiếu cũ vẫn mở bằng version cũ; mã trường cũ bị khoá', async ({
  page,
  request,
}) => {
  const res = await request.post(api('/forms'), {
    headers: authHeaders(TOKENS.lan),
    data: { id: 'ho', title: 'Hộ dân', fields: [{ id: 'ten', type: 'text', label: 'Tên' }] },
  });
  expect(res.status()).toBe(201);

  await login(page, 'lan');
  await formRow(page, 'Hộ dân').getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=ten]').fill('Phiếu bản 1');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('records').getByText('Phiếu bản 1')).toBeVisible();

  await formRow(page, 'Hộ dân').getByRole('link', { name: 'Sửa form' }).click();
  await page.getByTestId('builder-fields').getByRole('button', { name: /Tên/ }).click();
  await expect(page.getByTestId('field-editor')).toContainText('ten (khoá)');
  await expect(page.getByRole('button', { name: 'Xoá trường' })).toHaveCount(0);
  await addField(page, 'Số', 'Số người');
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(formRow(page, 'Hộ dân')).toBeVisible();

  const v2 = await request.get(api('/forms/ho/versions/2'), { headers: authHeaders(TOKENS.lan) });
  expect(v2.status()).toBe(200);
  expect(((await v2.json()) as { fields: unknown[] }).fields).toHaveLength(2);

  await page.getByTestId('records').getByText('Phiếu bản 1').click();
  await expect(page.locator('input[name=ten]')).toHaveValue('Phiếu bản 1');
  await expect(page.getByText('Số người')).toHaveCount(0);

  await page.goto('/#/');
  await formRow(page, 'Hộ dân').getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await expect(page.getByText('Số người')).toBeVisible();
});

test('lỗi kiểm ở máy không gửi request; offline thì báo cần kết nối, online lưu được', async ({
  page,
  context,
}) => {
  await login(page, 'lan');
  const posts: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/forms')) posts.push(req.url());
  });

  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await page.getByLabel('Tiêu đề').fill('Thiếu nhãn');
  await page.getByLabel('Loại trường').selectOption({ label: 'Chọn một' });
  await page.getByRole('button', { name: '+ Thêm trường' }).click();
  await page.getByTestId('field-editor').getByLabel('Mã', { exact: true }).fill('chon');
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  const errors = page.getByTestId('builder-errors');
  await expect(errors).toContainText('Trường thứ 1 chưa có nhãn');
  await expect(errors).toContainText('ít nhất một lựa chọn');
  expect(posts).toEqual([]);

  const editor = page.getByTestId('field-editor');
  await editor.getByLabel('Nhãn').fill('Chọn');
  await editor.getByLabel('Lựa chọn (mỗi dòng một lựa chọn)').fill('Có\nKhông');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(errors).toHaveText('⚠ Cần kết nối để lưu form');

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(formRow(page, 'Thiếu nhãn')).toBeVisible();
  expect(posts).toHaveLength(1);
});

test('điều tra viên không thấy nút sửa form và không mở được builder', async ({ page }) => {
  // minh là điều tra viên ở demo-yte và không thuộc dự án của test này
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sửa form' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '+ Biểu mẫu mới' })).toHaveCount(0);
  await page.goto('/#/builder/new');
  await expect(page.getByText('Chỉ giám sát viên được sửa biểu mẫu.')).toBeVisible();
});
