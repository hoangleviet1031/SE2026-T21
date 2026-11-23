import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProject, login, setMembership } from '../helpers';

// Đo các chỉ tiêu ở design §11.2 mà TV2-11 phụ trách (docs/perf.md): pull lần đầu 5.000 phiếu
// (supervisor) ≤ 30 s, danh sách 2.000 phiếu hiển thị ≤ 1 s và cuộn mượt (p95 khung ≤ 50 ms), đổi dự án đã tải
// ≤ 1 s kể cả offline.
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

/**
 * Cuộn cả trang từ đầu tới cuối, mỗi khung xuống STEP px (~6.000 px/s, như vuốt nhanh), ghi khoảng cách
 * giữa hai khung (requestAnimationFrame). Cuộn bằng script chạy trên luồng chính nên khung nào luồng
 * chính bận (vẽ, layout dòng mới) sẽ dài ra; cuộn bằng ngón tay thật do compositor lo nên thường mượt hơn.
 */
const STEP = 100;
function scrollFrames(page: Page): Promise<number[]> {
  return page.evaluate(
    (step) =>
      new Promise<number[]>((resolve) => {
        window.scrollTo(0, 0);
        const gaps: number[] = [];
        let last = 0;
        const tick = (now: number) => {
          gaps.push(now - last);
          last = now;
          const max = document.documentElement.scrollHeight - window.innerHeight;
          if (window.scrollY >= max) return resolve(gaps);
          window.scrollBy(0, step);
          requestAnimationFrame(tick);
        };
        // Khung đầu chỉ lấy mốc thời gian, không tính
        requestAnimationFrame((t) => {
          last = t;
          requestAnimationFrame(tick);
        });
      }),
    STEP,
  );
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;

/** "Mượt" theo design §11.2: 95% khung ≤ 50 ms. Ghi thêm trung vị và số khung > 50 ms. */
function recordScroll(name: string, gaps: number[]) {
  const sorted = [...gaps].sort((a, b) => a - b);
  const p50 = Math.round(percentile(sorted, 50));
  const p95 = Math.round(percentile(sorted, 95));
  const long = gaps.filter((g) => g > 50).length;
  const line =
    `${name}: ${gaps.length} khung, trung vị ${p50} ms, p95 ${p95} ms, ${long} khung > 50 ms ` +
    `(chỉ tiêu p95 ≤ 50 ms, CPU ×${THROTTLE})`;
  test.info().annotations.push({ type: 'perf', description: line });
  console.log(`[perf] ${line}`);
  if (ASSERT) expect(p95, line).toBeLessThanOrEqual(50);
}

test.afterEach(async ({ request }) => {
  for (const id of [`a-${run}-pull`, `a-${run}-list`, `a-${run}-scroll`]) {
    await setMembership(request, id, 'u_lan', null);
  }
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
  // Từ N33 mỗi nhóm chỉ vẽ trang đầu 200 phiếu kèm [Xem thêm phiếu] (design §4.8): "hiển thị" là lúc
  // tiêu đề nhóm đếm đủ 2.000, trang đầu đã vẽ và nút đã có
  const heading = page.getByRole('heading', { name: 'Khảo sát hộ gia đình (2000)' });
  const more = page.getByRole('button', { name: 'Xem thêm phiếu' });
  const firstPage = async () => {
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await expect(listItems(page)).toHaveCount(200, { timeout: 60_000 });
    await expect(more).toBeVisible();
  };
  await firstPage();

  // Dữ liệu đã trên máy: rời trang chủ rồi quay lại, đo tới khi trang đầu hiện xong
  await page.getByRole('link', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  let started = Date.now();
  await page.getByRole('link', { name: 'Khảo sát thực địa' }).click();
  await firstPage();
  record('Danh sách 2.000 phiếu (mở lại trang chủ)', Date.now() - started, 1_000);

  // Bấm [Xem thêm phiếu] tới khi có thêm 200 dòng: chỉ ghi số đo
  started = Date.now();
  await more.click();
  await expect(listItems(page)).toHaveCount(400, { timeout: 60_000 });
  const moreMs = Date.now() - started;
  test.info().annotations.push({ type: 'perf', description: `Xem thêm 200 phiếu: ${moreMs} ms` });
  console.log(`[perf] Xem thêm 200 phiếu: ${moreMs} ms (CPU ×${THROTTLE})`);

  // Tải lại cả trang (khởi động app + đọc IndexedDB): chỉ ghi số đo, §11.2 không có chỉ tiêu riêng
  started = Date.now();
  await page.reload();
  await firstPage();
  const reloadMs = Date.now() - started;
  test.info().annotations.push({ type: 'perf', description: `Tải lại trang tới khi hiện trang đầu: ${reloadMs} ms` });
  console.log(`[perf] Tải lại trang tới khi hiện trang đầu: ${reloadMs} ms (CPU ×${THROTTLE})`);

  // Đổi sang dự án nhỏ rồi quay lại dự án 2.000 phiếu khi offline
  await context.setOffline(true);
  await choose(page, NONGNGHIEP);
  await expect(page.getByTestId('project-switcher').getByRole('button', { expanded: false })).toHaveAccessibleName(
    NONGNGHIEP,
  );
  await expect(heading).toHaveCount(0);
  started = Date.now();
  await choose(page, name);
  await firstPage();
  record('Đổi sang dự án 2.000 phiếu (offline)', Date.now() - started, 1_000);
  await context.setOffline(false);
});

test('danh sách 2.000 phiếu cuộn mượt', async ({ page, request }) => {
  const id = `a-${run}-scroll`;
  await seedProject(request, id, `Đo cuộn ${run}`, 2000);
  await page.goto('/');
  await throttle(page);
  await login(page, 'lan');
  await expect.poll(() => localCount(page, id), { timeout: 120_000 }).toBe(2000);
  await expect(page.getByRole('heading', { name: 'Khảo sát hộ gia đình (2000)' })).toBeVisible({ timeout: 60_000 });
  await expect(listItems(page)).toHaveCount(200, { timeout: 60_000 });

  // Trang đầu 200 dòng: cảnh hay gặp nhất (design §4.8)
  recordScroll('Cuộn trang đầu 200 phiếu', await scrollFrames(page));

  // Bấm [Xem thêm phiếu] tới khi vẽ đủ 2.000 dòng: cảnh nặng nhất của chỉ tiêu "2.000 phiếu cuộn mượt"
  const more = page.getByRole('button', { name: 'Xem thêm phiếu' });
  for (let shown = 400; shown <= 2000; shown += 200) {
    await more.click();
    await expect(listItems(page)).toHaveCount(shown, { timeout: 60_000 });
  }
  await expect(more).toHaveCount(0);
  recordScroll('Cuộn đủ 2.000 phiếu', await scrollFrames(page));
});
