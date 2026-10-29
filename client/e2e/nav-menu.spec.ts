import { expect, test, type Page } from '@playwright/test';
import { createProject, login, setMembership } from './helpers';

// Menu điều hướng (TV1-12, ui.md "Menu điều hướng"): điện thoại có nút Menu mở ngăn kéo, máy tính (≥1024px)
// thanh bên luôn hiện. Chỉ ở màn hình 2, 6, 8, 9. Mỗi test một dự án riêng "b-…" với minh là giám sát viên
// (đứng trước "demo-…" trong /me nên đăng nhập là vào thẳng).

let project = '';
test.beforeEach(async ({ request }) => {
  project = `b-${crypto.randomUUID().slice(0, 8)}`;
  // Tên dự án không chứa chữ "Menu": nút bộ chọn dự án mang tên dự án, sẽ trùng nút Menu
  await createProject(request, project, `Điều hướng ${project}`);
  await setMembership(request, project, 'u_minh', 'supervisor');
});
test.afterEach(async ({ request }) => {
  await setMembership(request, project, 'u_minh', null);
});

const menuButton = (page: Page) => page.getByRole('button', { name: 'Menu' });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Menu' });

async function expectClosed(page: Page) {
  await expect(nav(page)).toBeHidden();
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton(page)).toBeFocused();
}

test('điện thoại 360px: nút Menu mở ngăn kéo; Esc, bấm nền, chọn mục thì đóng và con trỏ về nút Menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  // Cài đặt chuyển vào menu, khối Thành viên cuối trang chủ bỏ
  await expect(page.getByRole('banner').getByRole('link', { name: 'Cài đặt' })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'Thành viên' })).toHaveCount(0);
  await expect(nav(page)).toBeHidden();
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');

  await menuButton(page).click();
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
  const links = nav(page).getByRole('link');
  await expect(links).toHaveText(['Phiếu', 'Tổ chức', 'Thành viên', 'Cài đặt']);
  await expect(links.first()).toBeFocused();
  await expect(nav(page).getByRole('link', { name: 'Phiếu' })).toHaveAttribute('aria-current', 'page');
  for (const link of await links.all()) {
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.keyboard.press('Escape');
  await expectClosed(page);

  await menuButton(page).click();
  // Bấm phần nền mờ bên phải ngăn kéo
  await page.getByTestId('nav-backdrop').click({ position: { x: 340, y: 400 } });
  await expectClosed(page);

  await menuButton(page).click();
  await nav(page).getByRole('link', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  await expectClosed(page);
  await menuButton(page).click();
  await expect(nav(page).getByRole('link', { name: 'Cài đặt' })).toHaveAttribute('aria-current', 'page');
  await expect(nav(page).getByRole('link', { name: 'Phiếu' })).not.toHaveAttribute('aria-current');
});

test('điện thoại 360px: rời trang khi ngăn kéo đang mở (Back, sang builder) thì quay lại không tự mở', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  await menuButton(page).click();
  await nav(page).getByRole('link', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();

  // Nút Back của Android khi ngăn kéo đang mở
  await menuButton(page).click();
  await expect(nav(page)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  await expect(nav(page)).toBeHidden();
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');

  // Đổi trang bằng cách khác khi ngăn kéo đang mở (vd. link trong trang được bấm bằng trình đọc màn hình) sang
  // màn hình không có menu (builder), "← Quay lại" về trang chủ
  await menuButton(page).click();
  await expect(nav(page)).toBeVisible();
  await page.evaluate(() => (location.hash = '#/builder/new'));
  await expect(page.getByRole('textbox', { name: 'Tiêu đề' })).toBeVisible();
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  await expect(nav(page)).toBeHidden();
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
});

test('điện thoại 360px: điều tra viên không có mục Thành viên', async ({ page, request }) => {
  await setMembership(request, project, 'u_minh', 'surveyor');
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  await menuButton(page).click();
  await expect(nav(page).getByRole('link')).toHaveText(['Phiếu', 'Tổ chức', 'Cài đặt']);
  // Mục cuối khác giám sát viên: vẫn quay vòng trong ngăn kéo (tech-debt N19)
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(nav(page).getByRole('link', { name: 'Cài đặt' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(nav(page).getByRole('link', { name: 'Phiếu' })).toBeFocused();
});

// Tech-debt N19 (ui.md "Menu điều hướng", design §14): ngăn kéo giữ con trỏ như hộp thoại
test('điện thoại 360px: ngăn kéo mở thì Tab, Shift+Tab chỉ quay vòng trong ngăn kéo', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  await menuButton(page).click();
  const first = nav(page).getByRole('link', { name: 'Phiếu' });
  const last = nav(page).getByRole('link', { name: 'Cài đặt' });
  await expect(first).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(nav(page).getByRole('link', { name: 'Thành viên' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();

  // Con trỏ rơi ra ngoài ngăn kéo (vd. về body) thì Tab đưa về mục đầu
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await expect(nav(page)).toBeVisible();
});

test('máy tính 1280px: thanh bên luôn hiện, không có nút Menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Biểu mẫu' })).toBeVisible();
  await expect(menuButton(page)).toHaveCount(0);
  await expect(nav(page).getByRole('link')).toHaveText(['Phiếu', 'Tổ chức', 'Thành viên', 'Cài đặt']);

  await nav(page).getByRole('link', { name: 'Thành viên' }).click();
  await expect(page.getByTestId('members')).toBeVisible({ timeout: 10_000 });
  await expect(nav(page).getByRole('link', { name: 'Thành viên' })).toHaveAttribute('aria-current', 'page');
});

test('máy tính 1280px: màn hình điền phiếu không có thanh bên, thanh đầu cùng bề rộng với trang chủ', async ({
  page,
  request,
}) => {
  // Dự án demo có sẵn biểu mẫu; rút minh khỏi dự án riêng để vào thẳng demo-yte
  await setMembership(request, project, 'u_minh', null);
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await expect(nav(page)).toBeVisible();
  const homeWidth = (await page.getByRole('banner').boundingBox())?.width;
  expect(homeWidth).toBe(1280);

  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await expect(page.getByRole('button', { name: 'Lưu' })).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
  await expect(menuButton(page)).toHaveCount(0);
  expect((await page.getByRole('banner').boundingBox())?.width).toBe(homeWidth);
});

test.describe('chưa thuộc tổ chức nào', () => {
  // Request do service worker xử lý thì page.route không chặn được
  test.use({ serviceWorkers: 'block' });

  test('không có mục Phiếu, mục Tổ chức đang chọn', async ({ page }) => {
    // /me trả danh sách tổ chức rỗng: tài khoản demo nào cũng có thể được test khác thêm vào tổ chức, còn tạo
    // tài khoản mới thì chạm giới hạn đăng ký theo IP của server E2E dùng chung
    await page.route('**/api/me', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...(await res.json()), projects: [] } });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
    await expect(page.getByTestId('orgs')).toBeVisible({ timeout: 10_000 });
    await expect(nav(page).getByRole('link')).toHaveText(['Tổ chức', 'Cài đặt']);
    await expect(nav(page).getByRole('link', { name: 'Tổ chức' })).toHaveAttribute('aria-current', 'page');
  });
});
