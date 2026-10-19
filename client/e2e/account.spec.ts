import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API,
  DEMO_PASSWORD,
  TOKENS,
  answerConfirm,
  authHeaders,
  databaseNames,
  fillLogin,
  login,
  putRow,
  readStore,
} from './helpers';

// TV2-16: đăng nhập bằng phiên, chặn tài khoản admin (Q11, ADR 0003 §8), đổi tài khoản trên máy đang
// có dữ liệu (design §4.7), đăng xuất huỷ phiên trên server. Từ TV1-14 nhập tên + mật khẩu trên màn
// hình Đăng nhập; token phiên app nhận được đọc từ response của /api/auth/login.
// TOKENS (phiên demo cố định) chỉ dùng để gọi API thẳng.

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

/** Đăng nhập trên màn hình của app; trả token phiên server vừa cấp cho máy này. */
async function signInOnScreen(page: Page, username: string): Promise<string> {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  await fillLogin(page, username);
  const res = await response;
  expect(res.status()).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

const projectDbs = async (page: Page) => (await databaseNames(page)).filter((n) => n.startsWith('field-survey-p-'));

test('Q11: đăng nhập bằng tài khoản admin: báo dùng trang /admin, không lưu token, không tạo CSDL dự án nào', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const token = await signInOnScreen(page, 'admin');

  await expect(page.getByRole('alert')).toHaveText('⚠ Tài khoản quản trị dùng trang /admin');
  await expect(page.getByRole('alert').getByRole('link', { name: '/admin' })).toHaveAttribute('href', '/admin/');
  await expect(page.getByTestId('login-username')).toBeVisible();
  expect(await storedToken(page)).toBeUndefined();
  expect(await projectDbs(page)).toEqual([]);
  // Phiên vừa cấp cho admin bị huỷ luôn, không để lại phiên mồ côi
  await expect.poll(() => meStatus(request, token)).toBe(401);

  await page.reload();
  await expect(page.getByTestId('login-username')).toBeVisible();
  expect(await projectDbs(page)).toEqual([]);
});

test('Q11: token admin đã lưu từ trước (bản cũ không chặn): vòng đồng bộ bỏ token, về màn hình đăng nhập, không tạo CSDL dự án', async ({
  page,
  request,
}) => {
  const token = await newSession(request, 'admin');
  await page.goto('/');
  await expect(page.getByTestId('login-username')).toBeVisible();
  await putRow(page, ACCOUNT_DB, 'account', { key: 'token', value: token });

  await page.reload();
  await expect(page.getByTestId('login-username')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => storedToken(page)).toBeUndefined();
  expect(await projectDbs(page)).toEqual([]);
});

test('khác người khi máy còn phiếu chưa gửi: từ chối, không xoá gì, xuất JSON được; đăng nhập lại người cũ thì phiếu lên server', async ({
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

  // Phiên của máy này bị huỷ (vd. admin thu hồi): có mạng lại thì app nhận 401, về màn hình đăng nhập
  expect((await request.post('http://localhost:3001/api/auth/logout', { headers: authHeaders(minhToken) })).status()).toBe(204);
  await context.setOffline(false);
  await expect(page.getByTestId('login-username')).toBeVisible({ timeout: 15_000 });

  const lanToken = await signInOnScreen(page, 'lan');
  await expect(page.getByRole('alert')).toHaveText(
    '⚠ Máy này còn 1 phiếu chưa gửi của minh. Đăng nhập lại bằng tài khoản của người đó để gửi, hoặc xuất JSON trước.',
  );

  // Xuất JSON: một file cho dự án còn phiếu chưa gửi, có đúng phiếu đó (design §4.7)
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất JSON' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('chua-gui-demo-yte.json');
  const exported = JSON.parse(await readFile(await file.path(), 'utf8')) as { records: { data: { householdName?: string } }[] };
  expect(exported.records.map((r) => r.data.householdName)).toEqual(['Hộ của Minh chưa gửi']);

  expect(await storedToken(page)).toBeUndefined();
  expect(await projectDbs(page)).toContain('field-survey-p-demo-yte');
  const records = (await readStore(page, 'field-survey-p-demo-yte', 'records')) as { data: { householdName?: string } }[];
  expect(records.map((r) => r.data.householdName)).toContain('Hộ của Minh chưa gửi');
  await expect.poll(() => meStatus(request, lanToken)).toBe(401);

  // Cùng người: giữ dữ liệu, phiếu lên server dưới tên minh
  await signInOnScreen(page, 'minh');
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
  await expect(page.getByTestId('login-username')).toBeVisible({ timeout: 15_000 });

  await signInOnScreen(page, 'minh');
  await expect(page.getByTestId('login-username')).toHaveCount(0);
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
  await page.getByTestId('logout-button').click();
  await answerConfirm(page, 'Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.', 'Đăng xuất');
  await expect(page.getByTestId('login-username')).toBeVisible();
  expect(await meStatus(request, token)).toBe(401);
});
