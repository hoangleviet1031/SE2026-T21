import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, PROJECT, TOKENS, authHeaders, login, readStore } from './helpers';

// Ca O2, O4 (design §10.1): app đã cài mở lại khi offline từ đầu, và đóng tab khi còn op.
// Phiếu có tên riêng cho mỗi lần chạy vì server E2E dùng chung CSDL, minh pull về cả phiếu cũ.

const DB = `field-survey-p-${PROJECT}`;

type ServerRecord = { id: string; version: number; data: { householdName?: string } };

/** Chờ service worker kiểm soát trang: từ đây mở app khi offline vẫn có app shell (coi như đã cài). */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
}

/** Mọi phiếu của minh trên server, đi hết các trang pull. */
async function serverRecords(request: APIRequestContext): Promise<ServerRecord[]> {
  const all: ServerRecord[] = [];
  let since = 0;
  for (;;) {
    const res = await request.get(`${API}/records?since=${since}`, { headers: authHeaders(TOKENS.minh) });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { records: ServerRecord[]; cursor: number; hasMore?: boolean };
    all.push(...body.records);
    if (!body.hasMore) return all;
    since = body.cursor;
  }
}

async function createRecord(page: Page, name: string) {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(rows(page, name)).toHaveCount(1);
}

function rows(page: Page, text: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: text });
}

test('O2: mở app đã cài khi offline từ đầu, tạo 10 phiếu, có mạng thì server có đủ 10 phiếu', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  await waitForServiceWorker(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await page.close();

  // Tab mới mở khi đã mất mạng: app phải lên từ cache của service worker, không chỉ reload trang cũ
  await context.setOffline(true);
  const app = await context.newPage();
  await app.goto('/');
  await expect(app.getByTestId('network-status')).toHaveText('Ngoại tuyến');

  const prefix = `Hộ O2 ${crypto.randomUUID().slice(0, 8)}`;
  const names = Array.from({ length: 10 }, (_, i) => `${prefix} số ${i + 1}`);
  for (const name of names) await createRecord(app, name);
  const states = rows(app, prefix).getByTestId('sync-state');
  await expect(states).toHaveText(names.map(() => 'Chờ đồng bộ'));

  await context.setOffline(false);
  await expect(states).toHaveText(
    names.map(() => 'Đã đồng bộ'),
    { timeout: 30_000 },
  );

  // Mỗi phiếu đúng một bản trên server (version 1): không thiếu, không gửi trùng
  const saved = (await serverRecords(request)).filter((r) => r.data.householdName?.startsWith(prefix));
  expect(saved.map((r) => r.data.householdName).sort()).toEqual([...names].sort());
  expect(saved.every((r) => r.version === 1)).toBe(true);
});

test('O4: lưu phiếu khi còn op chưa gửi rồi đóng tab, mở lại thì phiếu vẫn được đồng bộ', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();

  // Offline để op chắc chắn còn nằm trong outbox lúc đóng tab
  await context.setOffline(true);
  const name = `Hộ O4 ${crypto.randomUUID().slice(0, 8)}`;
  await createRecord(page, name);
  const href = await rows(page, name).getByRole('link').first().getAttribute('href');
  const id = href?.split('/').pop() ?? '';
  expect(id).not.toBe('');
  const opsOf = async (p: Page) =>
    ((await readStore(p, DB, 'outbox')) as { recordId: string }[]).filter((o) => o.recordId === id);
  expect(await opsOf(page)).toHaveLength(1);
  await page.close();

  await context.setOffline(false);
  const again = await context.newPage();
  await again.goto('/');
  await expect(rows(again, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  expect(await opsOf(again)).toHaveLength(0);

  const saved = (await serverRecords(request)).find((r) => r.id === id);
  expect(saved).toMatchObject({ version: 1, data: { householdName: name } });
});
