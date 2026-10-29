import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { PROJECT, TOKENS, authHeaders, createProject, login, readStore, setMembership } from './helpers';

// Ca T6, T10 (ADR 0002 Kiểm chứng, design §10.1). Server E2E dùng chung một CSDL nên mỗi test tạo
// dự án riêng "b-…" có form tiêu đề riêng và phiếu riêng; lan là giám sát viên ở đó và tạo dữ liệu
// qua API. Cuối test rút mọi người khỏi các dự án này.

const created: string[] = [];

test.afterEach(async ({ request }) => {
  for (const id of created.splice(0)) {
    for (const userId of ['u_lan', 'u_minh']) await setMembership(request, id, userId, null);
  }
});

type Seeded = { id: string; name: string; formTitle: string; recordNames: string[] };

/** Dự án mới có một form và `count` phiếu do lan tạo. */
async function seedProject(request: APIRequestContext, label: string, count: number): Promise<Seeded> {
  const id = `b-${crypto.randomUUID().slice(0, 8)}`;
  const name = `Dự án ${label} ${id}`;
  await createProject(request, id, name);
  created.push(id);
  await setMembership(request, id, 'u_lan', 'supervisor');

  const api = (path: string) => `http://localhost:3001/api/projects/${id}${path}`;
  const formTitle = `Biểu mẫu ${label} ${id}`;
  const form = await request.post(api('/forms'), {
    headers: authHeaders(TOKENS.lan),
    data: { id: 'ho', title: formTitle, fields: [{ id: 'ten', type: 'text', label: 'Tên' }] },
  });
  expect(form.status()).toBe(201);

  const recordNames = Array.from({ length: count }, (_, i) => `Phiếu ${label} ${id} số ${i + 1}`);
  for (const ten of recordNames) {
    const put = await request.put(api(`/records/${crypto.randomUUID()}`), {
      headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
      data: { formId: 'ho', formVersion: 1, baseVersion: 0, data: { ten }, deleted: false },
    });
    expect(put.status()).toBe(201);
  }
  return { id, name, formTitle, recordNames };
}

const localRecords = (page: Page, projectId: string) =>
  readStore(page, `field-survey-p-${projectId}`, 'records').catch(() => []);

function switcher(page: Page) {
  return page.getByTestId('project-switcher');
}

/** Mở bộ chọn và chọn dự án theo tên; chờ trang đổi sang dự án đó. */
async function choose(page: Page, name: string) {
  await switcher(page).getByRole('button', { expanded: false }).click();
  await switcher(page).getByRole('listitem').getByRole('button').filter({ hasText: name }).click();
  await expect(switcher(page).getByRole('button', { expanded: false })).toHaveAccessibleName(name);
}

/** Trang chủ đang hiện đúng form và phiếu của `shown`, không có gì của `hidden`. */
async function expectOnly(page: Page, shown: Seeded, hidden: Seeded) {
  await expect(page.getByText(shown.formTitle, { exact: true })).toBeVisible();
  const list = page.getByTestId('records');
  for (const n of shown.recordNames) await expect(list.getByText(n)).toBeVisible();
  await expect(page.getByText(hidden.formTitle)).toHaveCount(0);
  for (const n of hidden.recordNames) await expect(list.getByText(n)).toHaveCount(0);
}

test('T6: được thêm vào dự án mới khi đang có dữ liệu dự án khác: thấy đủ phiếu dự án mới, dự án cũ không đổi', async ({
  page,
  request,
}) => {
  const b = await seedProject(request, 'B', 3);

  // minh đang có phiếu đã đồng bộ ở demo-yte
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const mine = `Hộ T6 ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(mine);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const mineRow = page.getByTestId('records').getByRole('listitem').filter({ hasText: mine });
  await expect(mineRow.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const before = (await localRecords(page, PROJECT)) as { data: { householdName?: string } }[];
  // localRecords trả [] khi chưa có CSDL: phải chắc ảnh chụp có phiếu thì "không đổi" mới có nghĩa
  expect(before.some((r) => r.data.householdName === mine)).toBe(true);

  // Giám sát viên để thấy phiếu của người khác (surveyor chỉ thấy phiếu của mình, design §5.5)
  await setMembership(request, b.id, 'u_minh', 'supervisor');
  // Bấm "Đồng bộ" lặp lại vì lần bấm có thể rơi vào vòng đang chạy dở (đọc /me cũ)
  await expect(async () => {
    await page.getByRole('button', { name: 'Đồng bộ' }).click();
    expect(await localRecords(page, b.id)).toHaveLength(3);
  }).toPass({ timeout: 15_000 });

  await choose(page, b.name);
  await expect(page.getByText(b.formTitle, { exact: true })).toBeVisible();
  for (const n of b.recordNames) await expect(page.getByTestId('records').getByText(n)).toBeVisible();
  await expect(page.getByTestId('records').getByText(mine)).toHaveCount(0);

  await choose(page, 'Y tế xã (demo)');
  await expect(mineRow.getByTestId('sync-state')).toHaveText('Đã đồng bộ');
  expect(await localRecords(page, PROJECT)).toEqual(before);
});

test('T10: offline, chuyển qua lại giữa hai dự án đã tải: mỗi dự án chỉ hiện form và phiếu của mình', async ({
  page,
  context,
  request,
}) => {
  const a = await seedProject(request, 'A', 2);
  const b = await seedProject(request, 'B', 2);

  await login(page, 'lan');
  for (const p of [a, b]) {
    await expect.poll(async () => (await localRecords(page, p.id)).length, { timeout: 15_000 }).toBe(2);
    // Vòng đồng bộ tải phiếu trước rồi mới tải form (design §5.3), nên có phiếu chưa chắc đã có form
    await expect
      .poll(async () => (await readStore(page, `field-survey-p-${p.id}`, 'forms').catch(() => [])).length, {
        timeout: 15_000,
      })
      .toBe(1);
  }
  await context.setOffline(true);

  await choose(page, a.name);
  await expectOnly(page, a, b);
  await choose(page, b.name);
  await expectOnly(page, b, a);
  await choose(page, a.name);
  await expectOnly(page, a, b);
});
