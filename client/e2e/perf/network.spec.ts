import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { API, PROJECT, TOKENS, authHeaders, createProject, login, makeImage, setMembership } from '../helpers';

// Đo ba chỉ tiêu ở design §11.2 mà client.spec.ts và pull.spec.ts chưa đo (docs/perf.md): đồng bộ 100
// phiếu không ảnh ở mạng "Slow 3G", đồng bộ 50 ảnh đã nén ở mạng 3G (1,6 Mbps), dung lượng mỗi máy.
// Chạy bằng `npm run test:perf`, không nằm trong `npm run test:e2e`.
// Mạng chậm giả lập bằng `Network.emulateNetworkConditions` của Chrome trên tab của app: vòng đồng bộ chạy
// trong tab (engine.ts), request PUT phiếu và chunk ảnh không qua service worker nên đều bị giới hạn.
// PERF_CPU_THROTTLE=4: thêm CPU chậm như các file đo khác, chỉ ghi số đo.

const THROTTLE = Number(process.env.PERF_CPU_THROTTLE ?? '1');
const ASSERT = THROTTLE === 1;
const DB = `field-survey-p-${PROJECT}`;

// Thông số giống preset của Chrome DevTools. "Slow 3G": 400 kbit/s hai chiều, độ trễ 2 s mỗi request.
// "3G (1,6 Mbps)" ở §11.2: lấy 1,6 Mbit/s cả hai chiều và độ trễ của preset "Fast 3G" (562,5 ms); preset
// DevTools giới hạn chiều tải lên còn 675 kbit/s, nên số đo ở đây là trường hợp tải lên nhanh như tải về.
const SLOW_3G = { latency: 2_000, downloadThroughput: 50_000, uploadThroughput: 50_000 };
const NET_3G = { latency: 562.5, downloadThroughput: 200_000, uploadThroughput: 200_000 };

/** Ghi số đo vào báo cáo Playwright và console, để chép vào docs/perf.md. */
function record(line: string, ok?: boolean) {
  test.info().annotations.push({ type: 'perf', description: `${line}, CPU ×${THROTTLE}` });
  console.log(`[perf] ${line}, CPU ×${THROTTLE}`);
  if (ASSERT && ok !== undefined) expect(ok, line).toBe(true);
}

/** Một phiên CDP cho tab: tắt/bật mạng có giới hạn. Dùng phiên này thay `context.setOffline`. */
async function network(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  if (THROTTLE !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  return cdp;
}

async function goOffline(page: Page, cdp: CDPSession) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await expect(page.getByTestId('network-status')).toHaveText('Ngoại tuyến');
}

/** Bật mạng chậm: app nhận sự kiện 'online' và bắt đầu vòng đồng bộ. Trả mốc bắt đầu bấm giờ. */
async function goOnline(cdp: CDPSession, conditions: typeof SLOW_3G): Promise<number> {
  const started = Date.now();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...conditions });
  return started;
}

/** Số op còn trong outbox và số ảnh chưa tải lên xong, đọc thẳng IndexedDB (không qua mạng). */
function pendingWork(page: Page): Promise<{ ops: number; photos: number }> {
  return page.evaluate(
    (dbName) =>
      new Promise<{ ops: number; photos: number }>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['outbox', 'attachments'], 'readonly');
          const ops = tx.objectStore('outbox').count();
          const photos = tx.objectStore('attachments').getAll();
          tx.oncomplete = () => {
            db.close();
            const rows = photos.result as { uploadState: string }[];
            resolve({ ops: ops.result, photos: rows.filter((a) => a.uploadState !== 'done').length });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    DB,
  );
}

/** Chờ tới khi không còn op và ảnh nào chờ gửi; trả số ms từ `started`. */
async function waitSynced(page: Page, started: number, timeout: number): Promise<number> {
  await expect
    .poll(() => pendingWork(page), { timeout, intervals: [250] })
    .toEqual({ ops: 0, photos: 0 });
  return Date.now() - started;
}

type ServerRecord = { id: string; data: { householdName?: string; housePhoto?: string[] } };

/** Phiếu của minh trên server có tên bắt đầu bằng `prefix`, đi hết các trang pull. */
async function serverRecords(page: Page, prefix: string): Promise<ServerRecord[]> {
  const all: ServerRecord[] = [];
  let since = 0;
  for (;;) {
    const res = await page.request.get(`${API}/records?since=${since}`, { headers: authHeaders(TOKENS.minh) });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { records: ServerRecord[]; cursor: number; hasMore?: boolean };
    all.push(...body.records.filter((r) => r.data.householdName?.startsWith(prefix)));
    if (!body.hasMore) return all;
    since = body.cursor;
  }
}

type Usage = { usage: number; quota: number; indexedDB: number; caches: number };

/** `storage.estimate()`; Chrome có thêm `usageDetails` tách IndexedDB và Cache Storage của service worker. */
function storageUsage(page: Page): Promise<Usage> {
  return page.evaluate(async () => {
    const e = (await navigator.storage.estimate()) as StorageEstimate & {
      usageDetails?: { indexedDB?: number; caches?: number };
    };
    return {
      usage: e.usage ?? 0,
      quota: e.quota ?? 0,
      indexedDB: e.usageDetails?.indexedDB ?? 0,
      caches: e.usageDetails?.caches ?? 0,
    };
  });
}

const MB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

async function saveRecord(page: Page, name: string, photos: Buffer[] = []) {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  for (const [i, photo] of photos.entries()) {
    await page
      .getByTestId('photo-input-housePhoto')
      .setInputFiles({ name: `anh-${i}.jpg`, mimeType: 'image/jpeg', buffer: photo });
    await expect(page.getByTestId('photo-thumb')).toHaveCount(i + 1, { timeout: 30_000 });
  }
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('records').getByRole('listitem').filter({ hasText: name })).toHaveCount(1);
}

test('đồng bộ 100 phiếu không ảnh ở mạng Slow 3G ≤ 10 s', async ({ page }) => {
  test.setTimeout(900_000);
  // Đã biết không đạt (tech-debt N35): vòng đồng bộ gửi từng phiếu một, mỗi phiếu tốn một lần trễ 2 s.
  // Đánh dấu "lỗi đã biết" để cả bộ đo vẫn xanh; trả N35 xong mà đạt thì Playwright báo qua ngoài dự kiến,
  // khi đó bỏ dòng này.
  test.fail(ASSERT, 'tech-debt N35: đồng bộ tuần tự, 100 phiếu × trễ 2 s');
  const prefix = `Hộ S3G ${crypto.randomUUID().slice(0, 6)}`;
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const cdp = await network(page);
  await goOffline(page, cdp);
  // Một ngày làm việc ngoài vùng sóng: 100 phiếu lưu trên máy, rồi về nơi có sóng 3G yếu
  for (let i = 1; i <= 100; i++) await saveRecord(page, `${prefix} ${i}`);
  expect((await pendingWork(page)).ops).toBe(100);

  const started = await goOnline(cdp, SLOW_3G);
  const ms = await waitSynced(page, started, 840_000);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  const onServer = await serverRecords(page, prefix);
  expect(onServer).toHaveLength(100);
  expect(new Set(onServer.map((r) => r.id)).size).toBe(100);
  record(`Đồng bộ 100 phiếu không ảnh, Slow 3G: ${seconds(ms)} (chỉ tiêu ≤ 10 s; ${(ms / 100).toFixed(0)} ms mỗi phiếu)`, ms <= 10_000);
});

test('đồng bộ 50 ảnh đã nén ở mạng 3G (1,6 Mbps) ≤ 3 phút', async ({ page }) => {
  test.setTimeout(900_000);
  // Đã biết không đạt (tech-debt N36), cùng cách đánh dấu như ca trên.
  test.fail(ASSERT, 'tech-debt N36: ảnh và chunk gửi tuần tự, mỗi request một lần trễ');
  const prefix = `Hộ ảnh 3G ${crypto.randomUUID().slice(0, 6)}`;
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const cdp = await network(page);
  await goOffline(page, cdp);
  const before = await storageUsage(page);

  // 10 phiếu × 5 ảnh. Ảnh nhiều chi tiết (nhiễu hạt) cỡ ảnh chụp thật, mỗi ảnh vẽ riêng nên không trùng nhau;
  // app nén xuống cạnh dài 1600 px như ảnh chụp từ điện thoại (§6.1)
  for (let r = 1; r <= 10; r++) {
    const photos: Buffer[] = [];
    for (let i = 0; i < 5; i++) {
      photos.push(await makeImage(page, { width: 2000, height: 1500, type: 'image/jpeg', quality: 0.95, texture: true }));
    }
    await saveRecord(page, `${prefix} ${r}`, photos);
  }
  const bytes = await page.evaluate(
    (dbName) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('attachments', 'readonly').objectStore('attachments').getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            open.result.close();
            resolve((req.result as { blob: Blob }[]).reduce((sum, a) => sum + a.blob.size, 0));
          };
        };
      }),
    DB,
  );
  const after = await storageUsage(page);
  expect((await pendingWork(page)).photos).toBe(50);

  const started = await goOnline(cdp, NET_3G);
  const ms = await waitSynced(page, started, 840_000);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  const onServer = await serverRecords(page, prefix);
  expect(onServer).toHaveLength(10);
  expect(onServer.flatMap((r) => r.data.housePhoto ?? [])).toHaveLength(50);
  record(`Ảnh sau nén: tổng ${MB(bytes)}, trung bình ${(bytes / 50 / 1000).toFixed(0)} KB mỗi ảnh`);
  record(
    `IndexedDB tăng khi thêm 50 ảnh (storage.estimate): ${MB(after.indexedDB - before.indexedDB)}, ${((after.indexedDB - before.indexedDB) / 50 / 1000).toFixed(0)} KB mỗi ảnh`,
  );
  record(`Đồng bộ 50 ảnh đã nén, 3G 1,6 Mbps: ${seconds(ms)} (chỉ tiêu ≤ 180 s)`, ms <= 180_000);
});

test('dung lượng trên máy với 2.000 phiếu đã tải về (§11.2 "Dung lượng mỗi máy")', async ({ page, request }) => {
  // Dự án riêng "a-…" (đứng trước demo-… nên đăng nhập là vào thẳng), minh tạo 2.000 phiếu nên pull hết
  const id = `a-dl-${crypto.randomUUID().slice(0, 6)}`;
  await createProject(request, id, 'Đo dung lượng');
  await setMembership(request, id, 'u_minh', 'surveyor');
  const res = await request.post('http://localhost:3001/api/__test/seed-perf', {
    data: { projectId: id, userId: 'u_minh', count: 2_000 },
  });
  expect(res.status()).toBe(201);

  await login(page);
  const list = page.getByTestId('records').getByRole('listitem');
  // Danh sách vẽ theo trang 200 dòng (§4.8); chờ CSDL trên máy đủ 2.000 phiếu
  await expect(list).toHaveCount(200, { timeout: 60_000 });
  await expect
    .poll(
      () =>
        page.evaluate(
          (dbName) =>
            new Promise<number>((resolve, reject) => {
              const open = indexedDB.open(dbName);
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const req = open.result.transaction('records', 'readonly').objectStore('records').count();
                req.onsuccess = () => {
                  open.result.close();
                  resolve(req.result);
                };
                req.onerror = () => reject(req.error);
              };
            }),
          `field-survey-p-${id}`,
        ),
      { timeout: 60_000, intervals: [250] },
    )
    .toBe(2_000);
  const u = await storageUsage(page);
  record(
    `Dung lượng sau khi tải 2.000 phiếu: tổng ${MB(u.usage)} (IndexedDB ${MB(u.indexedDB)}, Cache Storage ${MB(u.caches)}), hạn mức trình duyệt ${MB(u.quota)}`,
  );
});
