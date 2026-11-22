import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, authHeaders, createProject, login, setMembership } from './helpers';

// Danh sách phiếu vẽ theo trang (tech-debt N33, design §4.8 "Hiệu năng", ui.md màn hình 2): mỗi nhóm
// form vẽ 200 phiếu mới nhất, [Xem thêm phiếu] thêm 200; số trong tiêu đề nhóm vẫn đếm đủ.

const SEED_FORM = 'Khảo sát hộ gia đình'; // form mẫu của seed-perf (server/src/cli/seedPerf.ts)
const created: string[] = [];

test.afterEach(async ({ request }) => {
  for (const id of created.splice(0)) await setMembership(request, id, 'u_lan', null);
});

/** Dự án "b-…" (đứng trước demo trong /me): 450 phiếu form mẫu + 1 phiếu của form thứ hai. */
async function seed(request: APIRequestContext) {
  const id = `b-${crypto.randomUUID().slice(0, 8)}`;
  const name = `Danh sách dài ${id}`;
  await createProject(request, id, name);
  created.push(id);
  await setMembership(request, id, 'u_lan', 'supervisor');
  // seed-perf: phiếu số 1 mới nhất, mỗi phiếu sau cũ hơn 1 giây
  const res = await request.post('http://localhost:3001/api/__test/seed-perf', {
    data: { projectId: id, userId: 'u_lan', count: 450 },
  });
  expect(res.status()).toBe(201);
  const api = (path: string) => `http://localhost:3001/api/projects/${id}${path}`;
  const other = `Trường học ${id}`;
  const form = await request.post(api('/forms'), {
    headers: authHeaders(TOKENS.lan),
    data: { id: 'truong', title: other, fields: [{ id: 'ten', type: 'text', label: 'Tên' }] },
  });
  expect(form.status()).toBe(201);
  const rec = await request.put(api(`/records/${crypto.randomUUID()}`), {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'truong', formVersion: 1, baseVersion: 0, data: { ten: `Trường A ${id}` }, deleted: false },
  });
  expect(rec.status()).toBe(201);
  return { name, other };
}

async function openProject(page: Page, name: string) {
  await login(page, 'lan');
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button').filter({ hasText: name }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveAccessibleName(name);
}

const group = (page: Page, title: string) => page.getByTestId('record-group').filter({ hasText: title });
const rows = (page: Page, title: string) => group(page, title).getByRole('listitem');
const more = (page: Page, title: string) => group(page, title).getByRole('button', { name: 'Xem thêm phiếu' });

test('N33: nhóm 450 phiếu vẽ 200 → 400 → 450, nút mất khi hết; số trong tiêu đề đếm đủ; nhóm sau không bị che', async ({
  page,
  request,
}) => {
  const { name, other } = await seed(request);
  await openProject(page, name);

  await expect(group(page, SEED_FORM).getByRole('heading')).toHaveText(`${SEED_FORM} (450)`, { timeout: 30_000 });
  await expect(rows(page, SEED_FORM)).toHaveCount(200);
  // Mới trước: phiếu số 1 đầu nhóm, phiếu thứ 200 cuối trang đầu
  await expect(rows(page, SEED_FORM).first().getByTestId('record-title')).toHaveText('Hộ thử hiệu năng số 1');
  await expect(rows(page, SEED_FORM).last().getByTestId('record-title')).toHaveText('Hộ thử hiệu năng số 200');
  // Nhiều nhóm có thể cùng có nút: trình đọc màn hình đọc kèm tiêu đề nhóm
  await expect(more(page, SEED_FORM)).toHaveAccessibleDescription(`${SEED_FORM} (450)`);

  // Nhóm form thứ hai vẫn hiện đủ dù nhóm đầu còn phiếu chưa vẽ, không có nút vì chưa tới một trang
  await expect(rows(page, other)).toHaveCount(1);
  await expect(more(page, other)).toHaveCount(0);

  await more(page, SEED_FORM).click();
  await expect(rows(page, SEED_FORM)).toHaveCount(400);
  await expect(rows(page, SEED_FORM).nth(200).getByTestId('record-title')).toHaveText('Hộ thử hiệu năng số 201');
  await expect(more(page, SEED_FORM)).toBeFocused();

  await more(page, SEED_FORM).click();
  await expect(rows(page, SEED_FORM)).toHaveCount(450);
  await expect(more(page, SEED_FORM)).toHaveCount(0);
  await expect(group(page, SEED_FORM).getByRole('heading')).toHaveText(`${SEED_FORM} (450)`);
});

test('N33: đổi bộ lọc rồi quay lại thì nhóm về trang đầu 200 phiếu', async ({ page, request }) => {
  const { name } = await seed(request);
  await openProject(page, name);
  await expect(rows(page, SEED_FORM)).toHaveCount(200, { timeout: 30_000 });
  await more(page, SEED_FORM).click();
  await expect(rows(page, SEED_FORM)).toHaveCount(400);

  // Phiếu seed đều đã đồng bộ: lọc "Chưa đồng bộ" ra rỗng
  await page.getByRole('radio', { name: 'Chưa đồng bộ' }).check();
  await expect(page.getByTestId('no-records')).toBeVisible();
  await page.getByRole('radio', { name: 'Tất cả' }).check();
  await expect(rows(page, SEED_FORM)).toHaveCount(200);
  await expect(more(page, SEED_FORM)).toBeVisible();
});
