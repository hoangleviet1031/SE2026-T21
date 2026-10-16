import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, authHeaders, login, setMembership } from './helpers';

// TV1-10: phiếu mở bằng đúng formVersion, trường ẩn (design §4.1, §5.3 bước 5, §8). Như
// builder.spec.ts, mỗi test có dự án riêng "b-…" vì server E2E dùng chung một CSDL, và lan
// đăng nhập là vào thẳng dự án này.

let project = '';
const api = (path: string) => `http://localhost:3001/api/projects/${project}${path}`;

test.beforeEach(async ({ request }) => {
  project = `b-${crypto.randomUUID().slice(0, 8)}`;
  const res = await request.post('http://localhost:3001/api/admin/projects', {
    headers: authHeaders(TOKENS.admin),
    data: { id: project, name: `Form version ${project}` },
  });
  expect(res.status()).toBe(201);
  await setMembership(request, project, 'u_lan', 'supervisor');
});

test.afterEach(async ({ request }) => {
  await setMembership(request, project, 'u_lan', null);
});

type Field = { id: string; type: 'text' | 'number'; label: string; hidden?: boolean };

async function saveForm(request: APIRequestContext, fields: Field[]) {
  const res = await request.post(api('/forms'), {
    headers: authHeaders(TOKENS.lan),
    data: { id: 'ho', title: 'Hộ dân', fields },
  });
  expect(res.status()).toBe(201);
}

async function putRecord(request: APIRequestContext, formVersion: number, data: Record<string, string>) {
  const id = crypto.randomUUID();
  const res = await request.put(api(`/records/${id}`), {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'ho', formVersion, baseVersion: 0, data, deleted: false },
  });
  expect(res.status()).toBe(201);
  return id;
}

function recordLink(page: Page, text: string) {
  return page.getByTestId('records').getByText(text);
}

const ten: Field = { id: 'ten', type: 'text', label: 'Tên' };
const ghiChu: Field = { id: 'ghiChu', type: 'text', label: 'Ghi chú' };

test('tạo phiếu ở v1, ẩn một trường tạo v2: phiếu cũ vẫn thấy trường đó, phiếu mới thì không', async ({
  page,
  request,
}) => {
  await saveForm(request, [ten, ghiChu]);
  await login(page, 'lan');
  const form = page.getByRole('listitem').filter({ hasText: 'Hộ dân' });

  await form.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=ten]').fill('Phiếu bản 1');
  await page.locator('input[name=ghiChu]').fill('Nhà cấp 4');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordLink(page, 'Phiếu bản 1')).toBeVisible();

  await form.getByRole('link', { name: 'Sửa form' }).click();
  await page.getByTestId('builder-fields').getByRole('button', { name: /Ghi chú/ }).click();
  await page.getByTestId('field-editor').getByLabel('Ẩn').check();
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(form).toBeVisible();
  const v2 = await request.get(api('/forms/ho/versions/2'), { headers: authHeaders(TOKENS.lan) });
  expect(v2.status()).toBe(200);

  // Phiếu cũ mở bằng v1: trường chưa ẩn ở bản đó nên vẫn sửa được
  await recordLink(page, 'Phiếu bản 1').click();
  await expect(page.locator('input[name=ghiChu]')).toHaveValue('Nhà cấp 4');
  await expect(page.locator('input[name=ghiChu]')).toBeEnabled();

  await page.goto('/#/');
  await form.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await expect(page.locator('input[name=ten]')).toBeVisible();
  await expect(page.getByText('Ghi chú')).toHaveCount(0);
});

test('phiếu ở bản form đã ẩn trường mà vẫn có giá trị: trường hiện chỉ đọc, lưu lại không mất giá trị', async ({
  page,
  request,
}) => {
  await saveForm(request, [ten, ghiChu]);
  await saveForm(request, [ten, { ...ghiChu, hidden: true }]);
  const id = await putRecord(request, 2, { ten: 'Hộ A', ghiChu: 'giá trị cũ' });

  await login(page, 'lan');
  await recordLink(page, 'Hộ A').click();
  await expect(page.getByText('Ghi chú (đã ẩn)')).toBeVisible();
  await expect(page.locator('input[name=ghiChu]')).toHaveValue('giá trị cũ');
  await expect(page.locator('input[name=ghiChu]')).toBeDisabled();

  await page.locator('input[name=ten]').fill('Hộ A sửa');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(
    page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Hộ A sửa' }).getByTestId('sync-state'),
  ).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  const pulled = await request.get(api('/records?since=0'), { headers: authHeaders(TOKENS.lan) });
  const { records } = (await pulled.json()) as { records: { id: string; data: Record<string, string> }[] };
  expect(records.find((r) => r.id === id)?.data).toEqual({ ten: 'Hộ A sửa', ghiChu: 'giá trị cũ' });
});

test('trường ẩn có giá trị sai định dạng: lưu thành nháp, trường mở cho sửa, sửa xong thì đồng bộ', async ({
  page,
  request,
}) => {
  const soNguoi: Field = { id: 'soNguoi', type: 'number', label: 'Số người' };
  await saveForm(request, [ten, soNguoi]);
  await saveForm(request, [ten, { ...soNguoi, hidden: true }]);
  // Dữ liệu lên server không qua validate của client (vd. máy cũ, nhập tay), nên có thể sai kiểu
  await putRecord(request, 2, { ten: 'Hộ B', soNguoi: 'abc' });

  await login(page, 'lan');
  await recordLink(page, 'Hộ B').click();
  await expect(page.locator('input[name=soNguoi]')).toBeDisabled();
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await expect(page.getByTestId('error-soNguoi')).toBeVisible();
  await expect(page.getByText('Số người (đã ẩn)')).toBeVisible();

  await page.locator('input[name=soNguoi]').fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(
    page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Hộ B' }).getByTestId('sync-state'),
  ).toHaveText('Đã đồng bộ', { timeout: 15_000 });
});

test('máy chưa có bản form của phiếu: offline báo cần kết nối, có mạng thì tải về và mở được', async ({
  page,
  context,
  request,
}) => {
  await saveForm(request, [ten]);
  await putRecord(request, 1, { ten: 'Phiếu máy khác' });
  await saveForm(request, [ten, { id: 'soNguoi', type: 'number', label: 'Số người' }]);

  // Máy mới chỉ nhận bản mới nhất qua GET forms; chặn tải bản cũ để giữ máy ở trạng thái thiếu
  const blockVersions = '**/forms/ho/versions/**';
  await page.route(blockVersions, (route) => route.abort());
  await login(page, 'lan');
  await expect(recordLink(page, 'Phiếu máy khác')).toBeVisible();

  await context.setOffline(true);
  await recordLink(page, 'Phiếu máy khác').click();
  await expect(page.getByTestId('form-version-missing')).toHaveText('Cần kết nối để mở phiếu này');

  await page.unroute(blockVersions);
  await context.setOffline(false);
  await expect(page.locator('input[name=ten]')).toHaveValue('Phiếu máy khác', { timeout: 15_000 });
  // Mở bằng v1: không có trường thêm ở v2
  await expect(page.getByText('Số người')).toHaveCount(0);
});
