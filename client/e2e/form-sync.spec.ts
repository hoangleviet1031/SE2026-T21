import { expect, test, type Page } from '@playwright/test';
import { TOKENS, authHeaders, createProject, login, setMembership } from './helpers';

// Giám sát viên tạo form, điều tra viên ở máy khác thấy form sau vòng đồng bộ (US-07, TV3-14;
// design §4.1 "Tiêu chí chấp nhận", §5.3 bước 5). builder.spec.ts kiểm trên chính máy giám sát viên.
// Dự án riêng "b-…" như builder.spec.ts: dự án demo vẫn chỉ có một form, và id đứng trước "demo-…"
// trong /me nên cả lan lẫn minh đăng nhập là vào thẳng dự án này.

let project = '';
const api = (path: string) => `http://localhost:3001/api/projects/${project}${path}`;

test.beforeEach(async ({ request }) => {
  project = `b-${crypto.randomUUID().slice(0, 8)}`;
  await createProject(request, project, `Form sync ${project}`);
  await setMembership(request, project, 'u_lan', 'supervisor');
  await setMembership(request, project, 'u_minh', 'surveyor');
});

test.afterEach(async ({ request }) => {
  await setMembership(request, project, 'u_lan', null);
  await setMembership(request, project, 'u_minh', null);
});

/** Như builder.spec.ts: thêm một trường qua builder và đặt nhãn (cùng lựa chọn nếu là select). */
async function addField(page: Page, typeLabel: string, label: string, options?: string[]) {
  await page.getByLabel('Loại trường').selectOption({ label: typeLabel });
  await page.getByRole('button', { name: '+ Thêm trường' }).click();
  const editor = page.getByTestId('field-editor');
  await editor.getByLabel('Nhãn').fill(label);
  if (options) await editor.getByLabel('Lựa chọn (mỗi dòng một lựa chọn)').fill(options.join('\n'));
}

function formRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

test('form đủ 7 loại trường lưu ở máy giám sát viên: điều tra viên bấm Đồng bộ thì thấy form và gửi được phiếu', async ({
  page,
  browser,
  request,
}) => {
  const title = `Khảo sát chợ ${crypto.randomUUID().slice(0, 4)}`;
  const name = `Sạp ${crypto.randomUUID().slice(0, 8)}`;

  // minh mở app trước khi có form: form chỉ có thể tới bằng vòng đồng bộ sau đó
  await login(page, 'minh');
  await expect(page.getByText('Chưa có phiếu nào.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo phiếu mới' })).toHaveCount(0);

  const lanContext = await browser.newContext();
  try {
    const lan = await lanContext.newPage();
    await login(lan, 'lan');
    await lan.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
    await lan.getByLabel('Tiêu đề').fill(title);
    await addField(lan, 'Chữ', 'Tên sạp');
    await lan.getByTestId('field-editor').getByLabel('Bắt buộc').check();
    await addField(lan, 'Số', 'Số người bán');
    await addField(lan, 'Chọn một', 'Loại hàng', ['Rau', 'Thịt']);
    await addField(lan, 'Chọn nhiều', 'Thanh toán', ['Tiền mặt', 'Chuyển khoản']);
    await addField(lan, 'Ngày', 'Ngày ghé');
    await addField(lan, 'Ảnh', 'Ảnh sạp');
    await addField(lan, 'Vị trí GPS', 'Vị trí sạp');
    await lan.getByRole('button', { name: 'Lưu bản mới' }).click();
    await expect(formRow(lan, title)).toBeVisible();
  } finally {
    await lanContext.close();
  }

  await page.getByRole('button', { name: 'Đồng bộ', exact: true }).click();
  await formRow(page, title).getByRole('button', { name: 'Tạo phiếu mới' }).click({ timeout: 15_000 });
  const recordForm = page.getByTestId('record-form');
  for (const label of ['Tên sạp', 'Số người bán', 'Loại hàng', 'Thanh toán', 'Ngày ghé', 'Ảnh sạp', 'Vị trí sạp']) {
    await expect(recordForm.getByText(label)).toBeVisible();
  }
  await page.locator('input[name=tenSap]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(
    page.getByTestId('records').getByRole('listitem').filter({ hasText: name }).getByTestId('sync-state'),
  ).toHaveText('Đã đồng bộ', { timeout: 15_000 });

  const res = await request.get(api('/records?since=0'), { headers: authHeaders(TOKENS.lan) });
  expect(res.status()).toBe(200);
  const saved = ((await res.json()) as { records: { formId: string; formVersion: number; createdBy: string; data: { tenSap?: string } }[] }).records.find(
    (r) => r.data.tenSap === name,
  );
  expect(saved).toMatchObject({ formVersion: 1, createdBy: 'u_minh' });
  expect(saved?.formId).toMatch(/^khaoSatCho/);
});
