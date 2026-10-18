import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, DEMO_PASSWORD, TOKENS, authHeaders, databaseNames, login, putRow, readStore } from './helpers';

// TV2-16: đăng nhập bằng phiên, chặn tài khoản admin (Q11, ADR 0003 §8), đổi tài khoản trên máy đang
// có dữ liệu (design §4.7), đăng xuất huỷ phiên trên server. Màn hình tên + mật khẩu là của TV1-14;
// ở đây dùng màn hình nhập mã hiện có, token lấy bằng /api/auth/login.
// Không dán token demo cố định (TOKENS) vào app: app huỷ phiên bị từ chối, sẽ làm hỏng file khác.
// TOKENS chỉ dùng để gọi API thẳng.

const ACCOUNT_DB = 'field-survey-account';

/** Một phiên mới của tài khoản demo, như đăng nhập trên một máy khác. */
async function newSession(request: APIRequestContext, username: string): Promise<string> {
  const res = await request.post('http://localhost:3001/api/auth/login', {
    data: { username, password: DEMO_PASSWORD },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function meStatus(request: APIRequestContext, token: string): Promise<number> {
  return (await request.get('http://localhost:3001/api/me', { headers: authHeaders(token) })).status();
}

async function storedToken(page: Page): Promise<string | undefined> {
  const rows = (await readStore(page, ACCOUNT_DB, 'account')) as { key: string; value: unknown }[];
  const value = rows.find((r) => r.key === 'token')?.value;
  return typeof value === 'string' ? value : undefined;
}

async function enterToken(page: Page, token: string) {
  await page.getByTestId('login-token').fill(token);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
}

const projectDbs = async (page: Page) => (await databaseNames(page)).filter((n) => n.startsWith('field-survey-p-'));

test('Q11: nhập mã của tài khoản admin: báo dùng trang /admin, không lưu mã, không tạo CSDL dự án nào', async ({
  page,
  request,
}) => {
  const token = await newSession(request, 'admin');
  await page.goto('/');
  await enterToken(page, token);

  await expect(page.getByRole('alert')).toHaveText('⚠ Tài khoản quản trị dùng trang /admin');
  await expect(page.getByTestId('login-token')).toBeVisible();
  expect(await storedToken(page)).toBeUndefined();
  expect(await projectDbs(page)).toEqual([]);
  // Phiên vừa cấp cho admin bị huỷ luôn, không để lại phiên mồ côi
  await expect.poll(() => meStatus(request, token)).toBe(401);

  await page.reload();
  await expect(page.getByTestId('login-token')).toBeVisible();
  expect(await projectDbs(page)).toEqual([]);
});

test('Q11: mã admin đã lưu từ trước (bản cũ không chặn): vòng đồng bộ bỏ mã, về màn hình nhập mã, không tạo CSDL dự án', async ({
  page,
  request,
}) => {
  const token = await newSession(request, 'admin');
  await page.goto('/');
  await expect(page.getByTestId('login-token')).toBeVisible();
  await putRow(page, ACCOUNT_DB, 'account', { key: 'token', value: token });

  await page.reload();
  await expect(page.getByTestId('login-token')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => storedToken(page)).toBeUndefined();
  expect(await projectDbs(page)).toEqual([]);
});

test('mã sai: báo "Mã không đúng", không lưu mã', async ({ page }) => {
  await page.goto('/');
  await enterToken(page, 'khong-phai-ma-that');
  await expect(page.getByRole('alert')).toHaveText('⚠ Mã không đúng');
  expect(await storedToken(page)).toBeUndefined();
});

test('khác người khi máy còn phiếu chưa gửi: từ chối, không xoá gì; nhập lại mã người cũ thì phiếu lên server', async ({
  page,
  context,
  request,
}) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  const minhToken = await storedToken(page);
  if (!minhToken) throw new Error('chưa lưu mã của minh');

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Hộ của Minh chưa gửi');
  await page.getByRole('button', { name: 'Lưu' }).click();
  const row = page.getByTestId('records').getByRole('listitem').filter({ hasText: 'Hộ của Minh chưa gửi' });
  await expect(row.getByTestId('sync-state')).toHaveText('Chờ đồng bộ');

  // Phiên của máy này bị huỷ (vd. admin thu hồi): có mạng lại thì app nhận 401, về màn hình nhập mã
  expect((await request.post('http://localhost:3001/api/auth/logout', { headers: authHeaders(minhToken) })).status()).toBe(204);
  await context.setOffline(false);
  await expect(page.getByTestId('login-token')).toBeVisible({ timeout: 15_000 });

  const lanToken = await newSession(request, 'lan');
  await enterToken(page, lanToken);
  await expect(page.getByRole('alert')).toHaveText(
    '⚠ Máy này còn 1 phiếu chưa gửi của minh. Nhập lại mã của người đó để gửi, hoặc xuất JSON trước.',
  );
  expect(await storedToken(page)).toBeUndefined();
  expect(await projectDbs(page)).toContain('field-survey-p-demo-yte');
  const records = (await readStore(page, 'field-survey-p-demo-yte', 'records')) as { data: { householdName?: string } }[];
  expect(records.map((r) => r.data.householdName)).toContain('Hộ của Minh chưa gửi');
  await expect.poll(() => meStatus(request, lanToken)).toBe(401);

  // Cùng người: giữ dữ liệu, phiếu lên server dưới tên minh
  await enterToken(page, await newSession(request, 'minh'));
  await expect(row.getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  // lan là giám sát viên demo-yte nên thấy phiếu của minh; dùng phiên demo cố định, không bị huỷ ở đây
  const pulled = (await (await request.get(`${API}/records?since=0`, { headers: authHeaders(TOKENS.lan) })).json()) as {
    records: { data: { householdName?: string }; createdBy: string; updatedBy: string }[];
  };
  const saved = pulled.records.find((r) => r.data.householdName === 'Hộ của Minh chưa gửi');
  expect(saved?.createdBy).toBe('u_minh');
  expect(saved?.updatedBy).toBe('u_minh');
});

test('khác người khi máy không còn gì chưa gửi: xoá dữ liệu người cũ, vào bằng người mới', async ({ page, context, request }) => {
  // lan thuộc demo-yte và demo-nongnghiep; minh chỉ thuộc demo-yte
  await login(page, 'lan');
  await expect.poll(() => projectDbs(page)).toContain('field-survey-p-demo-nongnghiep');
  const lanToken = await storedToken(page);
  if (!lanToken) throw new Error('chưa lưu mã của lan');

  await context.setOffline(true);
  expect((await request.post('http://localhost:3001/api/auth/logout', { headers: authHeaders(lanToken) })).status()).toBe(204);
  await context.setOffline(false);
  await expect(page.getByTestId('login-token')).toBeVisible({ timeout: 15_000 });

  await enterToken(page, await newSession(request, 'minh'));
  await expect(page.getByTestId('login-token')).toHaveCount(0);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await expect.poll(() => projectDbs(page)).not.toContain('field-survey-p-demo-nongnghiep');
  const projects = (await readStore(page, ACCOUNT_DB, 'projects')) as { id: string }[];
  expect(projects.map((p) => p.id)).toEqual(['demo-yte']);
});

test('Đăng xuất khi online huỷ phiên của máy này trên server', async ({ page, request }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  const token = await storedToken(page);
  if (!token) throw new Error('chưa lưu mã của minh');
  expect(await meStatus(request, token)).toBe(200);

  await page.getByRole('link', { name: 'Cài đặt' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('logout-button').click();
  await expect(page.getByTestId('login-token')).toBeVisible();
  expect(await meStatus(request, token)).toBe(401);
});
