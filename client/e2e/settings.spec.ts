import { expect, test, type Page } from '@playwright/test';
import { PROJECT, answerConfirm, databaseNames, login, putRow, readStore } from './helpers';

// Trang Cài đặt và Đăng xuất (TV1-07; design §4.7, ui.md màn hình 8).

const PROJECT_DB = `field-survey-p-${PROJECT}`;

async function openSettings(page: Page) {
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await page.getByRole('link', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
}

test('Cài đặt hiện tên đăng nhập; Đăng xuất xoá CSDL dự án và token, đăng nhập lại được', async ({ page }) => {
  await login(page);
  await openSettings(page);
  // Tên đăng nhập (không phải userId u_minh): giám sát viên, Owner thêm người bằng tên này (design §4.7)
  await expect(page.getByTestId('settings-username')).toHaveText('minh');
  // Đã thuộc tổ chức: câu hướng dẫn nói về tổ chức khác, không bảo gửi tên để được thêm vào
  await expect(
    page.getByText('Giám sát viên hoặc Owner cần tên này nếu muốn thêm bạn vào tổ chức khác.'),
  ).toBeVisible();
  await expect(page.getByTestId('settings-storage')).toContainText('Đã dùng');

  // Huỷ (hoặc Esc) ở hộp xác nhận thì không đổi gì
  await page.getByTestId('logout-button').click();
  await answerConfirm(page, 'Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.', 'Huỷ');
  await page.getByTestId('logout-button').click();
  await answerConfirm(page, 'Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.', 'Esc');
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  expect(await databaseNames(page)).toContain(PROJECT_DB);

  await page.getByTestId('logout-button').click();
  await answerConfirm(page, 'Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.', 'Đăng xuất');
  await expect(page.getByTestId('login-username')).toBeVisible();
  await expect.poll(() => databaseNames(page)).not.toContain(PROJECT_DB);
  expect(await readStore(page, 'field-survey-account', 'account')).toEqual([]);
  expect(await readStore(page, 'field-survey-account', 'projects')).toEqual([]);

  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
});

test('còn phiếu chưa gửi: nút Đăng xuất bị khoá; đồng bộ xong thì tự mở', async ({ page, context }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();

  // Phiếu lưu khi offline nằm trong outbox, chưa lên server
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Hộ chưa gửi');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await openSettings(page);
  await expect(page.getByTestId('logout-blocked')).toContainText('Còn dữ liệu chưa gửi ở dự án');
  await expect(page.getByTestId('logout-button')).toBeDisabled();
  expect(await databaseNames(page)).toContain(PROJECT_DB);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Đồng bộ' }).click();
  await expect(page.getByTestId('logout-button')).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId('logout-blocked')).toHaveCount(0);
});

test('máy lưu thông tin tài khoản từ bản cũ (chưa có username): Cài đặt hiện userId, không hiện rỗng', async ({
  page,
  context,
}) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  // Offline để vòng đồng bộ không gọi /me ghi đè lại user đầy đủ
  await context.setOffline(true);
  await putRow(page, 'field-survey-account', 'account', { key: 'user', value: { id: 'u_minh', name: 'minh' } });
  await openSettings(page);
  // Tài khoản cũ có username = id (migration 4), nên id chính là tên đăng nhập
  await expect(page.getByTestId('settings-username')).toHaveText('u_minh');
});

test('Cài đặt có hướng dẫn cài lên màn hình chính; mở từ app đã cài thì báo đã cài', async ({ page, context }) => {
  await login(page);
  await openSettings(page);
  await expect(page.getByTestId('settings-install')).toContainText('Android:');
  await expect(page.getByTestId('settings-install')).toContainText('iPhone:');
  await expect(page.getByTestId('settings-install')).toContainText('Thêm vào màn hình chính');

  // Safari iOS báo app đã cài qua navigator.standalone
  await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.reload();
  await expect(page.getByTestId('settings-install')).toHaveText('Đã cài lên màn hình chính.');
});

/** Tên các cache của SW, đọc bằng API gốc của trình duyệt. */
const cacheNames = (page: Page) => page.evaluate(() => caches.keys());

/** Chờ SW nắm trang rồi đồng bộ, để /me và form đi qua SW và nằm trong cache runtime. */
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

test('Đăng xuất xoá cache me và forms của SW, giữ precache nên offline vẫn mở được app', async ({ page, context }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await fillRuntimeCaches(page);
  await openSettings(page);

  await page.getByTestId('logout-button').click();
  await answerConfirm(page, 'Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.', 'Đăng xuất');
  await expect(page.getByTestId('login-username')).toBeVisible();

  const names = await cacheNames(page);
  expect(names).not.toContain('me');
  expect(names).not.toContain('forms');
  expect(names.some((n) => n.startsWith('workbox-precache'))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('login-username')).toBeVisible();
});

test('Đăng xuất bị chặn vì còn phiếu chưa gửi thì cache me và forms còn nguyên', async ({ page, context }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible();
  await fillRuntimeCaches(page);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill('Hộ giữ cache');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await openSettings(page);
  await expect(page.getByTestId('logout-button')).toBeDisabled();

  expect(await cacheNames(page)).toEqual(expect.arrayContaining(['me', 'forms']));
});
