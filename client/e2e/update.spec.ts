import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { answerConfirm, login } from './helpers';

// Cập nhật phiên bản app và icon cài đặt (TV1-07 phần 2a; design §4.3).
// Giả lập "vừa deploy bản mới": thêm một dòng vào dist/sw.js mà vite preview đang phục vụ, để trình
// duyệt cài SW mới ở trạng thái chờ. Không dùng page.route vì Playwright không chặn được request
// tải script SW. Test xong luôn ghi lại bản gốc.
const SW_FILE = fileURLToPath(new URL('../dist/sw.js', import.meta.url));
let originalSw: string | null = null;

test.afterEach(async () => {
  if (originalSw !== null) await writeFile(SW_FILE, originalSw);
  originalSw = null;
});

async function loginControlledBySw(page: Page) {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  // Lần cài đầu SW nắm trang bằng clientsClaim; chờ tới lúc đó rồi mới giả lập bản mới
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
}

async function deployNewVersion(page: Page) {
  originalSw = await readFile(SW_FILE, 'utf8');
  await writeFile(SW_FILE, `${originalSw}\n// bản mới`);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
}

test('có bản mới thì hiện dải, bấm Tải lại thì chạy bản mới và dải mất', async ({ page }) => {
  await loginControlledBySw(page);
  await expect(page.getByTestId('update-prompt')).toHaveCount(0);

  await deployNewVersion(page);
  await expect(page.getByTestId('update-prompt')).toContainText('Có phiên bản mới', { timeout: 15_000 });

  await page.getByRole('button', { name: 'Tải lại' }).click();
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await expect(page.getByTestId('update-prompt')).toHaveCount(0);
  // Không còn SW nào chờ: bản mới đã thay bản cũ
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting ?? null)).toBeNull();
});

test('đang nhập phiếu thì hỏi trước khi tải lại; Huỷ thì giữ nguyên chỗ đang nhập', async ({ page }) => {
  await loginControlledBySw(page);
  // Mở lại để trang được SW nắm ngay từ lúc tải, như máy đã cài app từ trước (test trên là lần cài đầu)
  await page.reload();
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Đang gõ dở');

  await deployNewVersion(page);
  await expect(page.getByTestId('update-prompt')).toBeVisible({ timeout: 15_000 });

  // Huỷ (hoặc Esc) thì giữ nguyên phần đang gõ
  await page.getByTestId('update-prompt').getByRole('button', { name: 'Tải lại' }).click();
  await answerConfirm(page, 'Phiếu đang nhập chưa lưu sẽ mất. Tải lại?', 'Huỷ');
  await page.getByTestId('update-prompt').getByRole('button', { name: 'Tải lại' }).click();
  await answerConfirm(page, 'Phiếu đang nhập chưa lưu sẽ mất. Tải lại?', 'Esc');
  await expect(page.locator('input[name=householdName]')).toHaveValue('Đang gõ dở');
  await expect(page.getByTestId('update-prompt')).toBeVisible();

  await page.getByTestId('update-prompt').getByRole('button', { name: 'Tải lại' }).click();
  await answerConfirm(page, 'Phiếu đang nhập chưa lưu sẽ mất. Tải lại?', 'Tải lại');
  await expect(page.getByTestId('update-prompt')).toHaveCount(0);
  await expect(page.locator('input[name=householdName]')).toHaveValue('');
});

test('manifest có icon PNG 192 và 512, trang có apple-touch-icon', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifest = (await (await page.request.get(href ?? '')).json()) as {
    icons: { src: string; sizes: string; type: string; purpose: string }[];
  };
  const png = manifest.icons.filter((i) => i.type === 'image/png');
  expect(png.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of png) expect((await page.request.get(icon.src)).ok()).toBe(true);

  const touch = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
  expect((await page.request.get(touch ?? '')).headers()['content-type']).toBe('image/png');
});
