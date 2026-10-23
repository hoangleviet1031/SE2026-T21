import { expect, test, type Route } from '@playwright/test';
import { createProject, login, setMembership } from './helpers';

// Trạng thái và lối đi còn thiếu (TV1-12 b1; ui.md "Các trạng thái dùng chung", màn hình 2, 5, 8, 9).
// Mỗi test một dự án riêng "b-…" chưa có phiếu (đứng trước "demo-…" trong /me nên đăng nhập là vào thẳng).

// Request do service worker xử lý thì page.route không chặn được (cần cho ca "Đang tải…")
test.use({ serviceWorkers: 'block' });

let project = '';
test.beforeEach(async ({ request }) => {
  project = `b-${crypto.randomUUID().slice(0, 8)}`;
  await createProject(request, project, `Trạng thái ${project}`);
  await setMembership(request, project, 'u_minh', 'supervisor');
});
test.afterEach(async ({ request }) => {
  await setMembership(request, project, 'u_minh', null);
});

test('dự án chưa có phiếu nào: trang chủ báo "Chưa có phiếu nào."', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('records-empty')).toHaveText('Chưa có phiếu nào.');
  await expect(page.getByTestId('no-records')).toHaveCount(0);
});

test('Builder và Cài đặt có "← Quay lại" về trang chủ', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '+ Biểu mẫu mới' }).click();
  await page.getByRole('textbox', { name: 'Tiêu đề' }).fill('Chưa lưu');
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  await expect(page.getByText('Chưa lưu')).toHaveCount(0);

  await page.getByRole('link', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
});

test('Tổ chức: đang chờ danh sách thì hiện "Đang tải…", tải xong thì hết', async ({ page }) => {
  await login(page);
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/directory', async (route: Route) => {
    await held;
    await route.continue();
  });
  await page.goto('/#/orgs');
  await expect(page.getByTestId('directory-loading')).toHaveText('Đang tải…');
  release?.();
  await expect(page.getByTestId('directory-loading')).toHaveCount(0);
  await expect(page.getByTestId('directory').or(page.getByTestId('directory-empty'))).toBeVisible();
});
