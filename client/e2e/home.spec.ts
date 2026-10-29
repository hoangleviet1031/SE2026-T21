import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, authHeaders, createProject, login, setMembership } from './helpers';

// Trang chủ theo bản thiết kế (TV1-12 b2 p2; design §4.6, §4.8, ui.md màn hình 2): nút [Xuất ▾] và
// dòng phiếu bấm được cả hàng. Ẩn bộ lọc khi chưa có phiếu ở ui-states.spec.ts.

const FORM_TITLE = 'Khảo sát hộ gia đình';
const formRow = (page: Page) => page.getByRole('listitem').filter({ hasText: FORM_TITLE });

/** lan là supervisor ở demo-yte; /me sắp theo id nên app mở demo-nongnghiep trước (như export.spec.ts). */
async function loginSupervisorYte(page: Page) {
  await login(page, 'lan');
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name: /Y tế xã \(demo\)/ }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName('Y tế xã (demo)');
}

test('[Xuất ▾]: mở thấy hai lựa chọn; Esc đóng và trả focus về nút; bấm ra ngoài cũng đóng', async ({ page }) => {
  await loginSupervisorYte(page);
  const toggle = formRow(page).getByRole('button', { name: 'Xuất', exact: true });
  // Nhiều thẻ form cùng có nút "Xuất": trình đọc màn hình đọc kèm tên form
  await expect(toggle).toHaveAccessibleDescription(FORM_TITLE);
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toBeVisible();
  await expect(formRow(page).getByRole('button', { name: 'Xuất JSON' })).toBeVisible();

  await formRow(page).getByRole('button', { name: 'Xuất CSV' }).focus();
  await page.keyboard.press('Escape');
  await expect(formRow(page).getByRole('button', { name: 'Xuất CSV' })).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(formRow(page).getByRole('button', { name: 'Xuất JSON' })).toBeVisible();
  await page.getByRole('heading', { name: 'Phiếu đã nhập' }).click();
  await expect(formRow(page).getByRole('button', { name: 'Xuất JSON' })).toHaveCount(0);
});

test('dòng phiếu: bấm chỗ mũi tên › (không phải chữ tên) cũng mở đúng phiếu', async ({ page }) => {
  await login(page);
  const name = `Hộ bấm hàng ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();

  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: name });
  await expect(row).toBeVisible();
  const href = await row.getByRole('link', { name }).getAttribute('href');
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  // Mũi tên nằm sát mép phải, giữa phần trên của dòng
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) - 20, (box?.y ?? 0) + 24);
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.locator('input[name=householdName]')).toHaveValue(name);
});

test('có phiếu mà lọc ra rỗng: vẫn hiện bộ lọc, báo "Không có phiếu nào ở trạng thái này."', async ({ page }) => {
  await login(page);
  const name = `Hộ lọc rỗng ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('records').getByText(name)).toBeVisible();

  // Phiếu vừa lưu đủ trường nên không phải Lỗi
  await page.getByRole('radio', { name: 'Lỗi' }).check();
  await expect(page.getByTestId('no-records')).toHaveText('Không có phiếu nào ở trạng thái này.');
  await expect(page.getByRole('radiogroup', { name: 'Lọc theo trạng thái' })).toBeVisible();
});

// N10, N11 (design §4.8, tech-debt): dự án riêng "b-…" có hai form, phiếu tạo qua API như projects.spec.ts.
const created: string[] = [];

test.afterEach(async ({ request }) => {
  for (const id of created.splice(0)) await setMembership(request, id, 'u_lan', null);
});

/** Dự án mới, lan là giám sát viên; mỗi form một trường text "ten", phiếu tạo lần lượt nên phiếu sau mới hơn. */
async function seedTwoForms(request: APIRequestContext) {
  const id = `b-${crypto.randomUUID().slice(0, 8)}`;
  const name = `Dự án nhóm ${id}`;
  await createProject(request, id, name);
  created.push(id);
  await setMembership(request, id, 'u_lan', 'supervisor');
  const api = (path: string) => `http://localhost:3001/api/projects/${id}${path}`;
  for (const [formId, title] of [
    ['ho', `Hộ gia đình ${id}`],
    ['truong', `Trường học ${id}`],
  ]) {
    const res = await request.post(api('/forms'), {
      headers: authHeaders(TOKENS.lan),
      data: { id: formId, title, fields: [{ id: 'ten', type: 'text', label: 'Tên' }] },
    });
    expect(res.status()).toBe(201);
  }
  for (const [formId, data] of [
    ['ho', { ten: `Hộ An ${id}` }],
    ['truong', {}],
    ['ho', { ten: `Hộ Bình ${id}` }],
  ] as const) {
    const res = await request.put(api(`/records/${crypto.randomUUID()}`), {
      headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
      data: { formId, formVersion: 1, baseVersion: 0, data, deleted: false },
    });
    expect(res.status()).toBe(201);
  }
  return { id, name, ho: `Hộ gia đình ${id}`, truong: `Trường học ${id}`, an: `Hộ An ${id}`, binh: `Hộ Bình ${id}` };
}

async function openProject(page: Page, name: string) {
  await login(page, 'lan');
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button').filter({ hasText: name }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName(name);
}

const group = (page: Page, title: string) => page.getByTestId('record-group').filter({ hasText: title });

test('N10: phiếu nhóm theo form, mỗi nhóm có số phiếu; phiếu sửa sau lên đầu; lọc thì đếm theo lọc, ẩn nhóm rỗng', async ({
  page,
  request,
}) => {
  const s = await seedTwoForms(request);
  await openProject(page, s.name);

  // Nhóm theo thứ tự thẻ form, tiêu đề là heading để nhảy giữa các nhóm
  await expect(page.getByTestId('record-group').getByRole('heading', { level: 3 })).toHaveText([
    `${s.ho} (2)`,
    `${s.truong} (1)`,
  ]);
  const hoRows = group(page, s.ho).getByRole('listitem');
  await expect(group(page, s.ho).getByTestId('record-title')).toHaveText([s.binh, s.an]);

  // Sửa phiếu cũ hơn khi mất mạng: phiếu đó lên đầu nhóm, nhãn "Chờ đồng bộ"
  await page.context().setOffline(true);
  await hoRows.getByRole('link', { name: s.an }).click();
  await page.locator('input[name=ten]').fill(`${s.an} sửa`);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(group(page, s.ho).getByTestId('record-title')).toHaveText([`${s.an} sửa`, s.binh]);
  await expect(hoRows.first().getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  // "Chưa đồng bộ": chỉ còn nhóm Hộ gia đình với 1 phiếu, nhóm Trường học ẩn
  await page.getByRole('radio', { name: 'Chưa đồng bộ' }).check();
  await expect(page.getByTestId('record-group').getByRole('heading', { level: 3 })).toHaveText([`${s.ho} (1)`]);
  await page.context().setOffline(false);
});

test('N11: tiêu đề là trường text đầu tiên, rỗng thì "Phiếu chưa có tên"; dòng phiếu có giờ sửa', async ({
  page,
  request,
}) => {
  const s = await seedTwoForms(request);
  await openProject(page, s.name);

  const untitled = group(page, s.truong).getByRole('listitem');
  await expect(untitled.getByTestId('record-title')).toHaveText('Phiếu chưa có tên');
  // Phiếu vừa tạo hôm nay: giờ:phút
  await expect(untitled.getByTestId('edited-at')).toHaveText(/^\d{2}:\d{2}$/);
  // Dấu "·" giữa nhãn và giờ chỉ để nhìn, trình đọc màn hình không đọc (design §11.3)
  await expect(untitled.getByText('·', { exact: true })).toHaveAttribute('aria-hidden', 'true');
  await expect(group(page, s.ho).getByTestId('edited-at')).toHaveCount(2);
});
