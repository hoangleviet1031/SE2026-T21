import { expect, test, type Page } from '@playwright/test';
import { PROJECT, login } from '../helpers';

// Đo hai chỉ tiêu phía máy ở design §11.2 mà pull.spec.ts chưa đo (docs/perf.md): mở app đã cài khi
// offline tới khi nhập được ≤ 3 s (QS4, §11.4) và lưu một phiếu ≤ 200 ms.
// Chạy bằng `npm run test:perf`, không nằm trong `npm run test:e2e`.
// PERF_CPU_THROTTLE=4: giả lập máy yếu. §11.2 đặt chỉ tiêu mở app offline ở CPU ×4 nên chỉ tiêu này so
// ngưỡng ở cả hai lượt; lưu phiếu không ghi throttle nên chỉ so ngưỡng ở lượt thường, giống pull.spec.ts.

const THROTTLE = Number(process.env.PERF_CPU_THROTTLE ?? '1');

/** Ghi số đo vào báo cáo Playwright và console, để chép vào docs/perf.md. */
function record(name: string, ms: number, targetMs: number | null, assert: boolean) {
  const target = targetMs === null ? 'không có chỉ tiêu riêng' : `chỉ tiêu ≤ ${targetMs} ms`;
  const line = `${name}: ${Math.round(ms)} ms (${target}, CPU ×${THROTTLE})`;
  test.info().annotations.push({ type: 'perf', description: line });
  console.log(`[perf] ${line}`);
  if (assert && targetMs !== null) expect(ms, line).toBeLessThanOrEqual(targetMs);
}

/** Chờ service worker kiểm soát trang: từ đây mở app khi offline vẫn có app shell (coi như đã cài). */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
}

const SEEDED = 200;
const listItems = (page: Page) => page.getByTestId('records').getByRole('listitem');

/** Mở app đã cài trong tab mới khi đã mất mạng (đúng cảnh QS4), CPU đã throttle trước khi tải trang. */
async function openOffline(page: Page, records?: number): Promise<Page> {
  await login(page);
  await waitForServiceWorker(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  // Phiếu đã pull về máy trước khi mất mạng
  if (records !== undefined) await expect(listItems(page)).toHaveCount(records, { timeout: 30_000 });
  await page.close();
  await page.context().setOffline(true);
  const app = await page.context().newPage();
  if (THROTTLE !== 1) {
    // Phiên CDP riêng làm tab mới mất trạng thái offline của Playwright (navigator.onLine thành true),
    // nên đặt lại offline trên chính phiên này; service worker vẫn bị chặn mạng bởi setOffline ở trên
    const cdp = await app.context().newCDPSession(app);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }
  return app;
}

test('mở app đã cài khi offline tới khi nhập được ≤ 3 s (QS4)', async ({ page, context, request }) => {
  // QS4 cần "hiện danh sách phiếu": cho minh 200 phiếu, cỡ một đợt khảo sát của một người (§11.2 tính
  // 2.000 phiếu cho cả máy; danh sách 2.000 phiếu đã đo riêng ở pull.spec.ts)
  const res = await request.post('http://localhost:3001/api/__test/seed-perf', {
    data: { projectId: PROJECT, userId: 'u_minh', count: SEEDED },
  });
  expect(res.status()).toBe(201);
  const app = await openOffline(page, SEEDED);

  const started = Date.now();
  await app.goto('/');
  // "Hiện danh sách phiếu, nhập được" (§11.4 QS4): danh sách đã có phiếu của minh, nút tạo phiếu bấm được,
  // rồi ô đầu tiên của phiếu mới gõ được
  await expect(listItems(app)).toHaveCount(SEEDED, { timeout: 30_000 });
  const createButton = app.getByRole('button', { name: 'Tạo phiếu mới' });
  await expect(createButton).toBeEnabled({ timeout: 30_000 });
  const listMs = Date.now() - started;
  await createButton.click();
  await expect(app.locator('input[name=householdName]')).toBeEditable({ timeout: 30_000 });
  const readyMs = Date.now() - started;

  await expect(app.getByTestId('network-status')).toHaveText('Ngoại tuyến');
  // App shell lấy từ service worker (đúng cảnh "đã cài"), không phải từ máy chủ preview
  expect(await app.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  record('Mở app offline tới khi thấy danh sách', listMs, null, false);
  record('Mở app offline tới khi nhập được (QS4)', readyMs, 3_000, true);
  await context.setOffline(false);
});

test('lưu một phiếu ≤ 200 ms', async ({ page, context }) => {
  // Offline để lần đồng bộ ngay sau khi lưu không chen vào số đo
  const app = await openOffline(page);
  await app.goto('/');
  await expect(app.getByTestId('network-status')).toHaveText('Ngoại tuyến');

  const name = `Hộ đo lưu ${crypto.randomUUID().slice(0, 8)}`;
  await app.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await app.locator('input[name=householdName]').fill(name);

  // Bấm giờ trong trang: từ sự kiện click nút Lưu tới khi app chuyển về trang chủ. FillPage chỉ chuyển trang
  // sau khi transaction phiếu + op đã xong (saveRecordLocally), nên đây là thời gian lưu cộng phần
  // React xử lý click, không lẫn độ trễ Playwright.
  await app.evaluate(() => {
    const marks: Record<string, number> = {};
    Object.assign(window, { __saveMarks: marks });
    document.addEventListener('click', () => (marks.click = performance.now()), { capture: true, once: true });
    window.addEventListener('hashchange', () => (marks.navigated = performance.now()), { once: true });
  });
  const started = Date.now();
  await app.getByRole('button', { name: 'Lưu' }).click();
  const row = listItems(app).filter({ hasText: name });
  await expect(row.getByTestId('sync-state')).toHaveText('Chờ đồng bộ', { timeout: 30_000 });
  const toListMs = Date.now() - started;

  const marks = await app.evaluate(
    () => (window as unknown as { __saveMarks: { click?: number; navigated?: number } }).__saveMarks,
  );
  expect(marks.click).toBeDefined();
  expect(marks.navigated).toBeDefined();
  record('Lưu một phiếu (bấm Lưu tới khi rời trang nhập)', (marks.navigated ?? 0) - (marks.click ?? 0), 200, THROTTLE === 1);
  record('Bấm Lưu tới khi phiếu hiện ở danh sách (tham khảo)', toListMs, null, false);
  await context.setOffline(false);
});
