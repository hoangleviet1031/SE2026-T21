import { expect, test, type Page } from '@playwright/test';
import { PROJECT, answerConfirm, databaseNames, login, readStore } from './helpers';

// O12 (design §10.1): nút "Xoá dữ liệu trên máy" ở Cài đặt (design §4.2, §9; ui.md màn hình 8). Giữ đăng nhập,
// xoá dữ liệu nghiệp vụ và cache runtime, có mạng thì tải lại; còn dữ liệu chưa gửi thì khoá, không xoá gì.

const PROJECT_DB = `field-survey-p-${PROJECT}`;
const CONFIRM =
  'Xoá biểu mẫu, phiếu và ảnh của mọi tổ chức khỏi máy này? Dữ liệu vẫn còn trên máy chủ, có mạng thì app tải lại. Phần đang nhập dở chưa lưu cũng bị xoá. Bạn vẫn đăng nhập.';

async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
}

/** Số dòng của một bảng dự án; CSDL đã bị xoá mà app chưa tạo lại thì là 0. */
async function countRows(page: Page, store: string): Promise<number> {
  if (!(await databaseNames(page)).includes(PROJECT_DB)) return 0;
  return (await readStore(page, PROJECT_DB, store)).length;
}

const cacheNames = (page: Page) => page.evaluate(() => caches.keys());

/** Chờ SW nắm trang rồi đồng bộ, để /me và form đi qua SW và nằm trong cache runtime (như settings.spec.ts). */
async function fillRuntimeCaches(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect.poll(() => cacheNames(page), { timeout: 15_000 }).toEqual(expect.arrayContaining(['me', 'forms']));
}

async function saveRecord(page: Page, name: string) {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('records').getByText(name)).toBeVisible();
}

test('O12: Huỷ thì còn nguyên; xác nhận thì xoá phiếu, biểu mẫu, cache, vẫn đăng nhập, có mạng thì tải lại', async ({
  page,
  context,
}) => {
  const name = `Hộ xoá máy ${Date.now()}`;
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await saveRecord(page, name);
  await fillRuntimeCaches(page);
  await expect.poll(() => readStore(page, PROJECT_DB, 'outbox'), { timeout: 15_000 }).toEqual([]);
  await openSettings(page);

  const button = page.getByTestId('wipe-data-button');
  await expect(button).toBeEnabled();
  await button.click();
  await answerConfirm(page, CONFIRM, 'Huỷ');
  expect(await countRows(page, 'records')).toBeGreaterThan(0);

  // Offline để vòng đồng bộ chưa tải lại ngay, mới thấy được máy đã trống
  await context.setOffline(true);
  await button.click();
  await answerConfirm(page, CONFIRM, 'Xoá dữ liệu');
  await expect(page.getByTestId('wipe-data-done')).toHaveText(
    'Đã xoá dữ liệu trên máy. Biểu mẫu và phiếu sẽ tải lại từ máy chủ khi có mạng.',
  );
  expect(await countRows(page, 'records')).toBe(0);
  expect(await countRows(page, 'forms')).toBe(0);
  const names = await cacheNames(page);
  expect(names).not.toContain('me');
  expect(names).not.toContain('forms');

  // Vẫn đăng nhập: token, người dùng, danh sách tổ chức còn nguyên
  const account = (await readStore(page, 'field-survey-account', 'account')) as { key: string }[];
  expect(account.map((r) => r.key)).toEqual(expect.arrayContaining(['token', 'user']));
  const projects = (await readStore(page, 'field-survey-account', 'projects')) as { id: string }[];
  expect(projects.map((p) => p.id)).toContain(PROJECT);
  await expect(page.getByTestId('settings-username')).toHaveText('minh');

  // Có mạng lại: vòng đồng bộ pull lại từ đầu, phiếu đã lên server quay về máy
  await context.setOffline(false);
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect(page.getByTestId('records').getByText(name)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
});

test('O12: còn phiếu chưa gửi hay phiếu nháp thì khoá cả hai nút, đọc kèm lý do; đồng bộ xong thì mở', async ({
  page,
  context,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await saveRecord(page, `Hộ chưa gửi ${Date.now()}`);
  await openSettings(page);
  await expect(page.getByTestId('wipe-data-button')).toBeDisabled();
  await expect(page.getByTestId('logout-button')).toBeDisabled();
  await expect(page.getByTestId('logout-blocked')).toHaveText(
    /^Còn dữ liệu chưa gửi ở dự án .*\. Đồng bộ xong mới xoá dữ liệu hoặc đăng xuất được\.$/,
  );
  await expect(page.getByTestId('wipe-data-button')).toHaveAccessibleDescription(/^Còn dữ liệu chưa gửi ở dự án/);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect(page.getByTestId('wipe-data-button')).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId('wipe-data-button')).not.toHaveAttribute('aria-describedby');

  // Nháp không có op trong outbox nhưng vẫn là dữ liệu chưa gửi (hasUnsentData), nên vẫn khoá
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=members]').fill('3');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await page.getByRole('link', { name: 'Khảo sát thực địa' }).click();
  await openSettings(page);
  await expect(page.getByTestId('wipe-data-button')).toBeDisabled();
  expect(await readStore(page, PROJECT_DB, 'outbox')).toEqual([]);
  expect(await countRows(page, 'records')).toBeGreaterThan(0);
});

// Hộp đang mở thì tab khác lưu phiếu: lúc bấm xác nhận mới thấy còn dữ liệu chưa gửi, đi qua nhánh kiểm lại
// trong khoá của wipeDeviceData(). Không xoá gì, kể cả cache me và forms
test('O12: đang hỏi Xoá dữ liệu thì tab khác lưu phiếu: báo ⚠, không xoá gì', async ({ page, context }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await fillRuntimeCaches(page);
  await openSettings(page);
  await page.getByTestId('wipe-data-button').click();
  await expect(page.getByText(CONFIRM)).toBeVisible();

  await context.setOffline(true);
  const other = await context.newPage();
  await other.goto('/');
  await saveRecord(other, 'Hộ tab khác');

  await answerConfirm(page, CONFIRM, 'Xoá dữ liệu');
  await expect(page.getByRole('alert')).toHaveText(/^⚠ Còn dữ liệu chưa gửi ở dự án/);
  await expect(page.getByTestId('wipe-data-done')).toHaveCount(0);
  expect(await readStore(page, PROJECT_DB, 'outbox')).not.toEqual([]);
  expect(await countRows(page, 'forms')).toBeGreaterThan(0);
  expect(await cacheNames(page)).toEqual(expect.arrayContaining(['me', 'forms']));
});
