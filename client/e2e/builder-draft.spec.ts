import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, authHeaders, createProject, login, readStore, setMembership } from './helpers';

// Tự lưu bản đang sửa của builder (design §4.1 "Tự lưu bản đang sửa", ui.md màn hình 5; Could, Dương duyệt
// 2026-11-12). Phần chưa bấm Lưu bản mới được giữ trong meta `builder:<mã form>` / `builder-new`, mở lại thì hỏi
// khôi phục. Mỗi test một dự án riêng như builder.spec.ts.

let project = '';
const api = (path: string) => `http://localhost:3001/api/projects/${project}${path}`;
const dbName = () => `field-survey-p-${project}`;

test.beforeEach(async ({ request }) => {
  project = `b-${crypto.randomUUID().slice(0, 8)}`;
  await createProject(request, project, `Builder ${project}`);
  await setMembership(request, project, 'u_lan', 'supervisor');
});

test.afterEach(async ({ request }) => {
  await setMembership(request, project, 'u_lan', null);
});

const restoreBanner = (page: Page) => page.getByTestId('builder-restore');
const rows = (page: Page) => page.getByTestId('builder-fields').getByRole('listitem');

async function addField(page: Page, typeLabel: string, label: string) {
  await page.getByLabel('Loại trường').selectOption({ label: typeLabel });
  await page.getByRole('button', { name: '+ Thêm trường' }).click();
  await page.getByTestId('field-editor').getByLabel('Nhãn').fill(label);
}

async function draftKeys(page: Page): Promise<string[]> {
  const meta = (await readStore(page, dbName(), 'meta')) as { key: string }[];
  return meta.map((r) => r.key).filter((k) => k.startsWith('builder'));
}

async function postForm(request: APIRequestContext, fields: { id: string; type: string; label: string }[]) {
  const res = await request.post(api('/forms'), {
    headers: authHeaders(TOKENS.lan),
    data: { id: 'ho', title: 'Hộ dân', fields },
  });
  expect(res.status()).toBe(201);
}

function formRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

test('sửa form, tải lại: hỏi khôi phục, builder chưa hiện; Khôi phục rồi Lưu ra version mới, hết bản tự lưu', async ({
  page,
  request,
}) => {
  await postForm(request, [{ id: 'ten', type: 'text', label: 'Tên' }]);
  await login(page, 'lan');
  await formRow(page, 'Hộ dân').getByRole('link', { name: 'Sửa form' }).click();
  await expect(page.getByRole('heading', { name: 'Sửa form: Hộ dân' })).toBeVisible();
  await page.getByLabel('Tiêu đề').fill('Hộ dân 2026');
  await addField(page, 'Số', 'Số người');
  await expect.poll(() => draftKeys(page)).toEqual(['builder:ho']);

  await page.reload();
  await expect(restoreBanner(page)).toContainText('Có phần đang sửa chưa lưu (');
  await expect(page.getByLabel('Tiêu đề')).toHaveCount(0);
  await restoreBanner(page).getByRole('button', { name: 'Khôi phục' }).click();
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Hộ dân 2026');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(1)).toContainText('Số người');
  // Trường đã lưu vẫn khoá mã, không xoá được
  await page.getByTestId('builder-fields').getByRole('button', { name: /^Tên \(/ }).click();
  await expect(page.getByTestId('field-editor')).toContainText('ten (khoá)');
  await expect(page.getByTestId('builder-rebased')).toHaveCount(0);

  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(formRow(page, 'Hộ dân 2026')).toBeVisible();
  const v2 = await request.get(api('/forms/ho/versions/2'), { headers: authHeaders(TOKENS.lan) });
  expect(((await v2.json()) as { fields: unknown[] }).fields).toHaveLength(2);
  expect(await draftKeys(page)).toEqual([]);

  await formRow(page, 'Hộ dân 2026').getByRole('link', { name: 'Sửa form' }).click();
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Hộ dân 2026');
  await expect(restoreBanner(page)).toHaveCount(0);
});

test('biểu mẫu mới gõ dở, ← Quay lại rồi mở lại: hỏi khôi phục; Bỏ thì builder trống, hết bản tự lưu', async ({
  page,
}) => {
  await login(page, 'lan');
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await page.getByLabel('Tiêu đề').fill('Trường học');
  await addField(page, 'Chữ', 'Tên trường');
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect.poll(() => draftKeys(page)).toEqual(['builder-new']);

  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await expect(restoreBanner(page)).toBeVisible();
  await restoreBanner(page).getByRole('button', { name: 'Bỏ' }).click();
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('');
  await expect(rows(page)).toHaveCount(0);
  await expect.poll(() => draftKeys(page)).toEqual([]);

  // Sửa rồi sửa ngược về như cũ: không còn gì để giữ
  await page.getByLabel('Tiêu đề').fill('X');
  await expect.poll(() => draftKeys(page)).toEqual(['builder-new']);
  await page.getByLabel('Tiêu đề').fill('');
  await expect.poll(() => draftKeys(page)).toEqual([]);
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('');
  await expect(restoreBanner(page)).toHaveCount(0);
});

test('form đã lên bản mới trong lúc sửa: Khôi phục thêm trường mới vào cuối, có dải báo; lưu được version mới', async ({
  page,
  request,
}) => {
  await postForm(request, [{ id: 'ten', type: 'text', label: 'Tên' }]);
  await login(page, 'lan');
  await formRow(page, 'Hộ dân').getByRole('link', { name: 'Sửa form' }).click();
  await addField(page, 'Số', 'Số người');
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect.poll(() => draftKeys(page)).toEqual(['builder:ho']);

  // Máy khác lưu bản 2 có thêm trường "dienThoai"; máy này đồng bộ về
  await postForm(request, [
    { id: 'ten', type: 'text', label: 'Tên' },
    { id: 'dienThoai', type: 'text', label: 'Điện thoại' },
  ]);
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect
    .poll(async () => ((await readStore(page, dbName(), 'forms')) as { key: string }[]).map((f) => f.key).sort())
    .toEqual(['ho@1', 'ho@2']);

  await formRow(page, 'Hộ dân').getByRole('link', { name: 'Sửa form' }).click();
  await restoreBanner(page).getByRole('button', { name: 'Khôi phục' }).click();
  const note = page.getByTestId('builder-rebased');
  await expect(note).toHaveText(
    /Đã khôi phục\. Trong lúc bạn sửa, biểu mẫu đã lên bản 2; 1 trường mới của bản đó được thêm vào cuối\. Kiểm lại trước khi lưu\./,
  );
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(1)).toContainText('Số người');
  await expect(rows(page).nth(2)).toContainText('Điện thoại');
  await note.getByRole('button', { name: 'Đóng' }).click();
  await expect(note).toHaveCount(0);

  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(formRow(page, 'Hộ dân')).toBeVisible();
  const v3 = await request.get(api('/forms/ho/versions/3'), { headers: authHeaders(TOKENS.lan) });
  expect(v3.status()).toBe(200);
  expect(((await v3.json()) as { fields: { id: string }[] }).fields.map((f) => f.id)).toEqual([
    'ten',
    'soNguoi',
    'dienThoai',
  ]);
});
