import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, authHeaders, login, setMembership } from './helpers';

// TV1-10 phần 2: Xuất/Nhập form để dùng lại form ở dự án khác (design §4.1, ui.md màn hình 5).
// Như builder.spec.ts: dự án riêng "b-…" cho từng test; "-a" đứng trước "-b" trong /me nên lan
// đăng nhập là vào thẳng dự án nguồn.

let run = '';
const source = () => `b-${run}-a`;
const target = () => `b-${run}-b`;
const api = (project: string, path: string) => `http://localhost:3001/api/projects/${project}${path}`;

test.beforeEach(async ({ request }) => {
  run = crypto.randomUUID().slice(0, 8);
  for (const { id, name } of [
    { id: source(), name: `Nguồn ${run}` },
    { id: target(), name: `Đích ${run}` },
  ]) {
    const res = await request.post('http://localhost:3001/api/admin/projects', {
      headers: authHeaders(TOKENS.admin),
      data: { id, name },
    });
    expect(res.status()).toBe(201);
    await setMembership(request, id, 'u_lan', 'supervisor');
  }
});

test.afterEach(async ({ request }) => {
  await setMembership(request, source(), 'u_lan', null);
  await setMembership(request, target(), 'u_lan', null);
});

const form = {
  id: 'ho',
  title: 'Hộ dân',
  fields: [
    { id: 'ten', type: 'text', label: 'Tên', required: true },
    { id: 'nuoc', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng'] },
    { id: 'cu', type: 'text', label: 'Trường cũ', hidden: true },
  ],
};

async function createForm(request: APIRequestContext, project: string) {
  const res = await request.post(api(project, '/forms'), { headers: authHeaders(TOKENS.lan), data: form });
  expect(res.status()).toBe(201);
}

async function serverForms(request: APIRequestContext, project: string) {
  const res = await request.get(api(project, '/forms'), { headers: authHeaders(TOKENS.lan) });
  expect(res.status()).toBe(200);
  return (await res.json()) as { id: string; version: number; title: string; fields: unknown[] }[];
}

function formRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

/** Đếm request lưu form, để kiểm lỗi ở máy thì không gửi gì. */
function countFormPosts(page: Page) {
  const posts: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/forms')) posts.push(req.url());
  });
  return posts;
}

function importFile(page: Page, text: string) {
  return page.getByTestId('import-form-file').setInputFiles({
    name: 'form.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

test('xuất form ở dự án này, nhập vào dự án khác, lưu thành form mới ở đó', async ({ page, request }) => {
  await createForm(request, source());
  await login(page, TOKENS.lan);
  await formRow(page, 'Hộ dân').getByRole('link', { name: 'Sửa form' }).click();
  // Form đã lưu chỉ có Xuất, không có Nhập (nhập luôn tạo form mới)
  await expect(page.getByRole('button', { name: 'Nhập form' })).toHaveCount(0);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất form' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('ho-v1.json');
  const path = await download.path();
  const text = await readFile(path, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ ...form, version: 1 });

  await page.goto('/#/');
  await page.getByTestId('project-switcher').getByRole('button', { expanded: false }).click();
  await page.getByTestId('project-switcher').getByRole('button', { name: new RegExp(`Đích ${run}`) }).click();
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await expect(page.getByRole('button', { name: 'Xuất form' })).toHaveCount(0);
  await importFile(page, text);

  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Hộ dân');
  await expect(page.getByLabel('Mã biểu mẫu')).toHaveValue('ho');
  await expect(page.getByTestId('builder-fields').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('builder-errors')).toHaveCount(0);
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(formRow(page, 'Hộ dân')).toBeVisible();

  const saved = await serverForms(request, target());
  expect(saved).toEqual([expect.objectContaining({ ...form, version: 1 })]);
});

test('nhập form trùng mã form đã có trong dự án: báo lỗi, không gửi; đổi mã thì lưu thành form mới', async ({
  page,
  request,
}) => {
  await createForm(request, source());
  await login(page, TOKENS.lan);
  const posts = countFormPosts(page);
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await importFile(page, JSON.stringify(form));

  const errors = page.getByTestId('builder-errors');
  await expect(errors).toHaveText('⚠ Mã biểu mẫu đã có trong dự án');
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(errors).toHaveText('⚠ Mã biểu mẫu đã có trong dự án');
  expect(posts).toEqual([]);

  await page.getByLabel('Mã biểu mẫu').fill('ho2');
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(formRow(page, 'Hộ dân')).toHaveCount(2);

  const saved = await serverForms(request, source());
  expect(saved.map((f) => [f.id, f.version]).sort()).toEqual([
    ['ho', 1],
    ['ho2', 1],
  ]);
});

test('file nhập hỏng hoặc sai luật: báo lỗi, builder giữ nguyên, không gửi', async ({ page }) => {
  await login(page, TOKENS.lan);
  const posts = countFormPosts(page);
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await page.getByLabel('Tiêu đề').fill('Đang làm dở');
  const errors = page.getByTestId('builder-errors');

  await importFile(page, '{ hỏng');
  await expect(errors).toHaveText('⚠ File không phải JSON');

  await importFile(page, JSON.stringify({ title: 'Thiếu mã', fields: [] }));
  await expect(errors).toHaveText('⚠ File không đúng định dạng biểu mẫu');

  await importFile(page, JSON.stringify({ ...form, fields: [{ id: 'chon', type: 'select', label: 'Chọn' }] }));
  await expect(errors).toContainText('phải có ít nhất một lựa chọn');

  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Đang làm dở');
  expect(posts).toEqual([]);
});
