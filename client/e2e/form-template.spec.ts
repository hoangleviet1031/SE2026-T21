import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, authHeaders, createProject, login, readStore, setMembership } from './helpers';

// Mẫu form có sẵn ở "Biểu mẫu mới" (design §4.1 "Mẫu có sẵn", ui.md màn hình 5; Could, Dương duyệt 2026-11-13).
// Mỗi test một dự án riêng như builder.spec.ts.

let project = '';
const api = (path: string) => `http://localhost:3001/api/projects/${project}${path}`;

test.beforeEach(async ({ request }) => {
  project = `b-${crypto.randomUUID().slice(0, 8)}`;
  await createProject(request, project, `Mẫu ${project}`);
  await setMembership(request, project, 'u_lan', 'supervisor');
});

test.afterEach(async ({ request }) => {
  await setMembership(request, project, 'u_lan', null);
});

const rows = (page: Page) => page.getByTestId('builder-fields').getByRole('listitem');
const formId = (page: Page) => page.getByLabel('Mã biểu mẫu');

async function openNewForm(page: Page) {
  await login(page, 'lan');
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await expect(page.getByRole('heading', { name: 'Biểu mẫu mới' })).toBeVisible();
}

async function pickTemplate(page: Page, title: string) {
  await page.getByLabel('Bắt đầu từ mẫu').selectOption({ label: title });
  await page.getByRole('button', { name: 'Dùng mẫu' }).click();
}

async function serverForm(request: APIRequestContext, id: string) {
  const res = await request.get(api(`/forms/${id}/versions/1`), { headers: authHeaders(TOKENS.lan) });
  expect(res.status()).toBe(200);
  return (await res.json()) as { title: string; fields: { id: string; type: string; label: string }[] };
}

test('dùng mẫu: điền tiêu đề, mã, trường; offline vẫn nạp được, Lưu cần mạng; sửa rồi lưu thành form mới', async ({
  page,
  context,
  request,
}) => {
  await openNewForm(page);
  await expect(page.getByRole('button', { name: 'Dùng mẫu' })).toBeDisabled();

  // Mẫu đóng gói trong app nên mất mạng vẫn dùng được
  await context.setOffline(true);
  await pickTemplate(page, 'Khảo sát hộ gia đình');
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Khảo sát hộ gia đình');
  await expect(formId(page)).toHaveValue('khaoSatHoGiaDinh');
  await expect(rows(page)).toHaveCount(9);
  await expect(rows(page).first()).toContainText('Tên chủ hộ (Chữ) *');
  await expect(rows(page).nth(3)).toContainText('Nguồn nước chính (Chọn một) *');
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(page.getByTestId('builder-errors')).toHaveText('⚠ Cần kết nối để lưu form');
  await context.setOffline(false);

  // Trường của mẫu là trường mới chưa lưu: đổi nhãn thì mã đi theo, xoá được
  await page.getByTestId('builder-fields').getByRole('button', { name: /^Địa chỉ \(/ }).click();
  const editor = page.getByTestId('field-editor');
  await editor.getByLabel('Nhãn').fill('Thôn, xóm');
  await expect(editor.getByLabel('Mã', { exact: true })).toHaveValue('thonXom');
  await expect(editor.getByRole('button', { name: 'Xoá trường' })).toBeVisible();

  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Khảo sát hộ gia đình' })).toBeVisible();
  const saved = await serverForm(request, 'khaoSatHoGiaDinh');
  expect(saved.fields.map((f) => f.id)).toEqual([
    'tenChuHo',
    'thonXom',
    'soThanhVien',
    'nguonNuocChinh',
    'nhaVeSinh',
    'taiSan',
    'ngayKhaoSat',
    'anhNha',
    'viTri',
  ]);
});

test('màn 360 px: khối chọn mẫu không làm trang tràn ngang, nút Dùng mẫu cao 44px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openNewForm(page);
  await page.getByLabel('Bắt đầu từ mẫu').selectOption({ label: 'Khảo sát y tế hộ gia đình' });
  expect((await page.getByRole('button', { name: 'Dùng mẫu' }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test('mã mẫu trùng form đã có trong dự án thì thêm số, lưu được', async ({ page, request }) => {
  const res = await request.post(api('/forms'), {
    headers: authHeaders(TOKENS.lan),
    data: { id: 'khaoSatCayTrong', title: 'Cây trồng cũ', fields: [{ id: 'ten', type: 'text', label: 'Tên' }] },
  });
  expect(res.status()).toBe(201);
  await openNewForm(page);
  await pickTemplate(page, 'Khảo sát cây trồng');
  await expect(formId(page)).toHaveValue('khaoSatCayTrong2');
  await page.getByRole('button', { name: 'Lưu bản mới' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Khảo sát cây trồng' }).first()).toBeVisible();
  expect((await serverForm(request, 'khaoSatCayTrong2')).fields).toHaveLength(9);
});

test('đã sửa gì thì hỏi trước khi thay bằng mẫu: Huỷ giữ nguyên, Thay nạp mẫu', async ({ page }) => {
  await openNewForm(page);
  await page.getByLabel('Tiêu đề').fill('Form của tôi');
  await pickTemplate(page, 'Khảo sát y tế hộ gia đình');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Thay phần đang sửa bằng mẫu "Khảo sát y tế hộ gia đình"? Phần đang sửa sẽ mất.');
  await dialog.getByRole('button', { name: 'Huỷ' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Form của tôi');
  await expect(rows(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Dùng mẫu' }).click();
  await dialog.getByRole('button', { name: 'Thay' }).click();
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Khảo sát y tế hộ gia đình');
  await expect(formId(page)).toHaveValue('khaoSatYTeHoGiaDinh');
  await expect(rows(page)).toHaveCount(9);

  // Đang có mẫu mà đổi sang mẫu khác cũng hỏi
  await pickTemplate(page, 'Khảo sát cây trồng');
  await expect(dialog).toContainText('mẫu "Khảo sát cây trồng"');
  await dialog.getByRole('button', { name: 'Thay' }).click();
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Khảo sát cây trồng');
});

test('nạp mẫu rồi tải lại: hỏi khôi phục, Khôi phục thấy các trường của mẫu', async ({ page }) => {
  await openNewForm(page);
  await pickTemplate(page, 'Khảo sát cây trồng');
  await expect(rows(page)).toHaveCount(9);
  // Chờ bản tự lưu `builder-new` được ghi (sau 1 s ngừng sửa) như builder-draft.spec.ts
  await expect
    .poll(async () => {
      const meta = (await readStore(page, `field-survey-p-${project}`, 'meta')) as { key: string }[];
      return meta.map((r) => r.key).filter((k) => k.startsWith('builder'));
    })
    .toEqual(['builder-new']);
  await page.reload();
  const restore = page.getByTestId('builder-restore');
  await expect(restore).toContainText('Có phần đang sửa chưa lưu (');
  await restore.getByRole('button', { name: 'Khôi phục' }).click();
  await expect(page.getByLabel('Tiêu đề')).toHaveValue('Khảo sát cây trồng');
  await expect(rows(page)).toHaveCount(9);
});

test('sửa form đã có thì không có khối chọn mẫu', async ({ page, request }) => {
  const res = await request.post(api('/forms'), {
    headers: authHeaders(TOKENS.lan),
    data: { id: 'ho', title: 'Hộ dân', fields: [{ id: 'ten', type: 'text', label: 'Tên' }] },
  });
  expect(res.status()).toBe(201);
  await login(page, 'lan');
  await page.getByRole('listitem').filter({ hasText: 'Hộ dân' }).getByRole('link', { name: 'Sửa form' }).click();
  await expect(page.getByRole('heading', { name: 'Sửa form: Hộ dân' })).toBeVisible();
  await expect(page.getByTestId('builder-template')).toHaveCount(0);
  await page.goto('/#/builder/new');
  await expect(page.getByTestId('builder-template')).toBeVisible();
});
