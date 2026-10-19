import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TOKENS, answerConfirm, authHeaders, databaseNames, login, readStore, setMembership } from './helpers';

// TV2-07: thay đổi thành viên khi thiết bị có thể đang offline (ADR 0002 §6, ca T7–T9) và
// cursor theo phạm vi (ADR 0001 quy tắc 10, design §5.5). Dùng dự án demo-nongnghiep (có form
// mẫu), nơi minh mặc định không là thành viên; mỗi test tự thêm rồi rút minh để trả lại fixture.

const OTHER = 'demo-nongnghiep';
const OTHER_DB = `field-survey-p-${OTHER}`;
const ACCOUNT_DB = 'field-survey-account';
const MINH = 'u_minh';

type AccountProjectRow = { id: string; status: string };
type RecordRow = { id: string; data: { householdName?: string } };

function accountProjects(page: Page) {
  return readStore(page, ACCOUNT_DB, 'projects') as Promise<AccountProjectRow[]>;
}

async function pullMeta(page: Page) {
  const meta = (await readStore(page, OTHER_DB, 'meta')) as { key: string; value: unknown }[];
  return meta.find((m) => m.key === 'pull')?.value as { cursor: number; scope: string } | undefined;
}

async function localNames(page: Page) {
  return ((await readStore(page, OTHER_DB, 'records')) as RecordRow[]).map((r) => r.data.householdName);
}

/** Bấm "Đồng bộ" rồi kiểm điều kiện; lặp lại cả hai vì lần bấm có thể rơi vào vòng đang chạy dở. */
async function syncUntil(page: Page, check: () => Promise<void>) {
  await expect(async () => {
    await page.getByRole('button', { name: 'Đồng bộ' }).click();
    await check();
  }).toPass({ timeout: 15_000 });
}

/** Tạo phiếu thẳng qua API, đóng vai người dùng khác. */
async function pushAs(request: APIRequestContext, token: string, householdName: string) {
  const res = await request.put(`http://localhost:3001/api/projects/${OTHER}/records/${crypto.randomUUID()}`, {
    headers: { ...authHeaders(token), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 0, data: { householdName }, deleted: false },
  });
  expect(res.status()).toBe(201);
}

/** minh đăng nhập và chờ vòng đồng bộ đầu tải xong dự án OTHER. */
async function loginAndLoadOther(page: Page) {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await expect.poll(async () => (await readStore(page, OTHER_DB, 'forms').catch(() => [])).length).toBeGreaterThan(0);
}

test.afterEach(async ({ request }) => {
  await setMembership(request, OTHER, MINH, null);
});

test('T7: bị rút khi còn phiếu chưa gửi: phiếu còn trên máy, không gửi request nào tới dự án đó', async ({
  page,
  context,
  request,
}) => {
  await setMembership(request, OTHER, MINH, 'surveyor');
  await loginAndLoadOther(page);

  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name: /Nông nghiệp \(demo\)/ }).click();
  await expect(switcher.getByRole('button', { expanded: false })).toHaveText('Nông nghiệp (demo) ▾');

  const name = `Hộ T7 ${crypto.randomUUID().slice(0, 8)}`;
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(
    page.getByTestId('records').getByRole('listitem').filter({ hasText: name }).getByTestId('sync-state'),
  ).toHaveText('Chờ đồng bộ');

  await setMembership(request, OTHER, MINH, null);
  const toOther: string[] = [];
  context.on('request', (req) => {
    if (req.url().includes(`/api/projects/${OTHER}/`)) toOther.push(`${req.method()} ${req.url()}`);
  });
  await context.setOffline(false);

  await expect
    .poll(async () => (await accountProjects(page)).find((p) => p.id === OTHER)?.status, { timeout: 15_000 })
    .toBe('removed');
  expect(await localNames(page)).toContain(name);
  expect((await readStore(page, OTHER_DB, 'outbox')).length).toBeGreaterThan(0);

  // TV1-06: banner kèm Xuất JSON; dự án mờ "Đã rời" trong bộ chọn, app chuyển sang dự án còn lại
  const banner = page.getByTestId('removed-project-banner');
  await expect(banner).toContainText('Bạn không còn thuộc dự án Nông nghiệp (demo). 1 phiếu chưa gửi được');
  await expect(switcher.getByRole('button', { expanded: false })).toHaveText('Y tế xã (demo) ▾');
  await switcher.getByRole('button', { expanded: false }).click();
  await expect(switcher.getByRole('listitem').filter({ hasText: 'Nông nghiệp (demo)' })).toContainText('Đã rời');
  await expect(switcher.getByRole('listitem').getByRole('button', { name: /Nông nghiệp/ })).toHaveCount(0);

  const downloadPromise = page.waitForEvent('download');
  await banner.getByRole('button', { name: 'Xuất JSON' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await streamText(await download.createReadStream())) as {
    projectId: string;
    records: RecordRow[];
  };
  expect(exported.projectId).toBe(OTHER);
  expect(exported.records.map((r) => r.data.householdName)).toEqual([name]);

  // Huỷ (hoặc Esc) ở hộp xác nhận thì không xoá gì; câu hỏi nêu đúng số phiếu sẽ mất
  await banner.getByRole('button', { name: 'Xoá khỏi máy' }).click();
  await answerConfirm(page, 'Xoá 1 phiếu chưa gửi của dự án Nông nghiệp (demo) khỏi máy? Không khôi phục được.', 'Huỷ');
  await banner.getByRole('button', { name: 'Xoá khỏi máy' }).click();
  await answerConfirm(page, 'Xoá 1 phiếu chưa gửi của dự án Nông nghiệp (demo) khỏi máy? Không khôi phục được.', 'Esc');
  await expect(banner).toBeVisible();
  expect(await localNames(page)).toContain(name);

  await banner.getByRole('button', { name: 'Xoá khỏi máy' }).click();
  await answerConfirm(page, 'Xoá 1 phiếu chưa gửi của dự án Nông nghiệp (demo) khỏi máy? Không khôi phục được.', 'Xoá khỏi máy');
  await expect(banner).toHaveCount(0);
  await expect.poll(() => databaseNames(page)).not.toContain(OTHER_DB);
  expect((await accountProjects(page)).map((p) => p.id)).not.toContain(OTHER);
  expect(toOther).toEqual([]);
});

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('T8: bị rút khi không còn gì chưa gửi: CSDL dự án bị xoá, dự án biến khỏi danh sách', async ({
  page,
  request,
}) => {
  await setMembership(request, OTHER, MINH, 'surveyor');
  await loginAndLoadOther(page);
  expect(await databaseNames(page)).toContain(OTHER_DB);

  await setMembership(request, OTHER, MINH, null);
  await syncUntil(page, async () => {
    expect(await databaseNames(page)).not.toContain(OTHER_DB);
    expect((await accountProjects(page)).map((p) => p.id)).not.toContain(OTHER);
  });
});

test('T9: nâng surveyor lên supervisor: cursor về 0, thấy phiếu của người khác', async ({ page, request }) => {
  const lanName = `Hộ của Lan ${crypto.randomUUID().slice(0, 8)}`;
  await setMembership(request, OTHER, MINH, 'surveyor');
  await pushAs(request, TOKENS.lan, lanName);
  // Phiếu của minh tạo sau phiếu của Lan, để cursor của minh vượt qua phiếu của Lan:
  // chỉ khi cursor về 0 thì phiếu của Lan mới được pull về.
  await pushAs(request, TOKENS.minh, `Hộ của Minh ${crypto.randomUUID().slice(0, 8)}`);
  await loginAndLoadOther(page);
  await expect.poll(async () => (await pullMeta(page))?.scope).toBe('own');
  expect(await localNames(page)).not.toContain(lanName);

  await setMembership(request, OTHER, MINH, 'supervisor');
  await syncUntil(page, async () => {
    expect((await pullMeta(page))?.scope).toBe('all');
    expect(await localNames(page)).toContain(lanName);
  });
});

test('hạ supervisor xuống surveyor khi không còn gì chưa gửi: phiếu của người khác biến khỏi máy', async ({
  page,
  request,
}) => {
  const lanName = `Hộ của Lan ${crypto.randomUUID().slice(0, 8)}`;
  await pushAs(request, TOKENS.lan, lanName);
  await setMembership(request, OTHER, MINH, 'supervisor');
  await loginAndLoadOther(page);
  await expect.poll(async () => localNames(page)).toContain(lanName);

  await setMembership(request, OTHER, MINH, 'surveyor');
  await syncUntil(page, async () => {
    expect((await pullMeta(page))?.scope).toBe('own');
    expect(await localNames(page)).not.toContain(lanName);
  });
});
