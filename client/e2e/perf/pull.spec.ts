import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProject, login, setMembership } from '../helpers';

// Đo các chỉ tiêu ở design §11.2 mà TV2-11 phụ trách (docs/perf.md): pull lần đầu 5.000 phiếu
// (supervisor) ≤ 30 s, danh sách 2.000 phiếu hiển thị ≤ 1 s, đổi dự án đã tải ≤ 1 s kể cả offline.
// Chạy bằng `npm run test:perf`, không nằm trong `npm run test:e2e`.
// PERF_CPU_THROTTLE=4: giả lập máy yếu bằng Chrome DevTools Protocol; chỉ ghi số đo, không so ngưỡng
// (§11.2 không yêu cầu throttle cho ba chỉ tiêu này).

const THROTTLE = Number(process.env.PERF_CPU_THROTTLE ?? '1');
const ASSERT = THROTTLE === 1;

// Dự án "a-…" đứng trước "demo-…" trong /me nên đăng nhập là vào thẳng dự án đo.
const run = crypto.randomUUID().slice(0, 6);
const NONGNGHIEP = 'Nông nghiệp (demo)';

async function seedProject(request: APIRequestContext, id: string, name: string, count: number) {
  await createProject(request, id, name);
  // minh tạo phiếu, lan là supervisor nên pull phạm vi "all" (đúng chỉ tiêu "supervisor")
  const res = await request.post('http://localhost:3001/api/__test/seed-perf', {
    data: { projectId: id, userId: 'u_minh', count },
  });
  expect(res.status()).toBe(201);
  await setMembership(request, id, 'u_lan', 'supervisor');
}

/** Số dòng của bảng records trong CSDL dự án; 0 nếu CSDL chưa có (không tạo CSDL rỗng thay app). */
function localCount(page: Page, projectId: string): Promise<number> {
  return page.evaluate(
    (dbName) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('records')) {
            db.close();
            return resolve(0);
          }
          const req = db.transaction('records', 'readonly').objectStore('records').count();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
        };
      }),
    `field-survey-p-${projectId}`,
  );
}

async function throttle(page: Page) {
  if (THROTTLE === 1) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}

/** Ghi số đo vào báo cáo Playwright và console, để chép vào docs/perf.md. */
function record(name: string, ms: number, targetMs: number) {
  const line = `${name}: ${ms} ms (chỉ tiêu ≤ ${targetMs} ms, CPU ×${THROTTLE})`;
  test.info().annotations.push({ type: 'perf', description: line });
  console.log(`[perf] ${line}`);
  if (ASSERT) expect(ms, line).toBeLessThanOrEqual(targetMs);
}

const listItems = (page: Page) => page.getByTestId('records').getByRole('listitem');

async function choose(page: Page, name: string) {
  const switcher = page.getByTestId('project-switcher');
  await switcher.getByRole('button', { expanded: false }).click();
  await switcher.getByRole('listitem').getByRole('button', { name }).click();
}

test.afterEach(async ({ request }) => {
  for (const id of [`a-${run}-pull`, `a-${run}-list`]) await setMembership(request, id, 'u_lan', null);
});

test('pull lần đầu 5.000 phiếu (supervisor) ≤ 30 s', async ({ page, request }) => {
  const id = `a-${run}-pull`;
  await seedProject(request, id, `Đo pull ${run}`, 5000);
  await page.goto('/');
  await throttle(page);

  const started = Date.now();
  await login(page, 'lan');
  await expect.poll(() => localCount(page, id), { timeout: 240_000, intervals: [250] }).toBe(5000);
  record('Pull lần đầu 5.000 phiếu', Date.now() - started, 30_000);
});

test('danh sách 2.000 phiếu hiển thị ≤ 1 s; đổi dự án đã tải ≤ 1 s kể cả offline', async ({ page, context, request }) => {
  const id = `a-${run}-list`;
  const name = `Đo danh sách ${run}`;
  await seedProject(request, id, name, 2000);
  await page.goto('/');
  await throttle(page);
  await login(page, 'lan');
  await expect.poll(() => localCount(page, id), { timeout: 120_000 }).toBe(2000);
  await expect(listItems(page)).toHaveCount(2000, { timeout: 60_000 });

  // Dữ liệu đã trên máy: rời trang chủ rồi quay lại, đo tới khi đủ 2.000 dòng
  await page.getByRole('link', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  let started = Date.now();
  await page.getByRole('link', { name: 'Khảo sát thực địa' }).click();
  await expect(listItems(page)).toHaveCount(2000, { timeout: 60_000 });
  record('Danh sách 2.000 phiếu (mở lại trang chủ)', Date.now() - started, 1_000);

  // Tải lại cả trang (khởi động app + đọc IndexedDB): chỉ ghi số đo, §11.2 không có chỉ tiêu riêng
  started = Date.now();
  await page.reload();
  await expect(listItems(page)).toHaveCount(2000, { timeout: 60_000 });
  const reloadMs = Date.now() - started;
  test.info().annotations.push({ type: 'perf', description: `Tải lại trang tới khi đủ 2.000 dòng: ${reloadMs} ms` });
  console.log(`[perf] Tải lại trang tới khi đủ 2.000 dòng: ${reloadMs} ms (CPU ×${THROTTLE})`);

  // Đổi sang dự án nhỏ rồi quay lại dự án 2.000 phiếu khi offline
  await context.setOffline(true);
  await choose(page, NONGNGHIEP);
  await expect(page.getByTestId('project-switcher').getByRole('button', { expanded: false })).toHaveText(`${NONGNGHIEP} ▾`);
  await expect(listItems(page)).not.toHaveCount(2000);
  started = Date.now();
  await choose(page, name);
  await expect(listItems(page)).toHaveCount(2000, { timeout: 60_000 });
  record('Đổi sang dự án 2.000 phiếu (offline)', Date.now() - started, 1_000);
  await context.setOffline(false);
});
