import { expect, test, type Locator, type Page } from '@playwright/test';
import { contrastRatio } from '../src/contrast';
import { authHeaders, createProject, DEMO_PASSWORD, login, setMembership, TOKENS } from './helpers';

// Giao diện tối theo hệ điều hành (Could, Dương duyệt 2026-11-16; ui.md "Hệ thống thiết kế"): máy đặt chế độ tối thì
// app và trang quản trị dùng bảng màu tối, chữ vẫn đủ tương phản (design §11.3). Màu đo bằng getComputedStyle.
test.use({ colorScheme: 'dark' });

const PAPER = 'rgb(24, 23, 21)';
const SURFACE = 'rgb(33, 31, 28)';
const INK = 'rgb(237, 235, 230)';
const ON_FILL = 'rgb(29, 28, 26)';
const HL = 'rgb(242, 214, 117)';
const ON_HL = 'rgb(38, 37, 34)';
const RED = 'rgb(255, 143, 128)';

/** "rgb(r, g, b)" → "#rrggbb" để tính tương phản bằng cùng hàm với unit test */
function toHex(rgb: string): string {
  const parts = rgb.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
  if (parts.length !== 3) throw new Error(`Không đọc được màu ${rgb}`);
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Màu chữ của phần tử trên nền đặc gần nhất (đi lên cha tới khi gặp nền không trong suốt) */
async function textOnBackground(target: Locator): Promise<[string, string]> {
  return target.evaluate((el) => {
    const color = getComputedStyle(el).color;
    let node: Element | null = el;
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return [color, bg];
      node = node.parentElement;
    }
    return [color, getComputedStyle(document.documentElement).backgroundColor];
  });
}

async function expectReadable(target: Locator) {
  const [fg, bg] = await textOnBackground(target);
  expect(contrastRatio(toHex(fg), toHex(bg)), `${fg} trên ${bg}`).toBeGreaterThanOrEqual(4.5);
}

const bg = (el: Element) => getComputedStyle(el).backgroundColor;

async function themeColor(page: Page): Promise<string | null> {
  // Thẻ theme-color mà trình duyệt dùng: thẻ đầu tiên có media khớp
  return page.evaluate(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    return metas.find((m) => !m.media || matchMedia(m.media).matches)?.content ?? null;
  });
}

test('màn đăng nhập tối: nền, ô nhập, nút chính, vòng focus vàng, theme-color theo header tối', async ({ page }) => {
  await page.goto('/');
  expect(await page.locator('body').evaluate(bg)).toBe(PAPER);
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).color)).toBe(INK);
  expect(await themeColor(page)).toBe('#211f1c');

  const username = page.getByLabel('Tên đăng nhập');
  await expect(username).toHaveCSS('background-color', SURFACE);
  await expect(username).toHaveCSS('color', INK);
  // Ô nhập gốc của trình duyệt (lịch chọn ngày, gợi ý, thanh cuộn) theo chế độ tối. Từ khi có lựa chọn Sáng/Tối
  // (2026-11-19) color-scheme theo chế độ đang dùng, không còn "light dark" (để chọn Sáng trên máy tối không ra ô tối)
  expect(await username.evaluate((el) => getComputedStyle(el).colorScheme)).toBe('dark');
  await page.getByRole('tab', { name: 'Tạo tài khoản' }).focus();
  await page.keyboard.press('Tab');
  await expect(username).toBeFocused();
  await expect(username).toHaveCSS('border-top-color', INK);
  await expect(username).toHaveCSS('outline', `${HL} solid 3px`);

  // Nút chính đảo thành nền sáng, chữ tối (điền đủ thì nút mới mở)
  await username.fill('lan');
  await page.getByLabel('Mật khẩu').fill(DEMO_PASSWORD);
  const submit = page.getByRole('button', { name: 'Tiếp tục' });
  await expect(submit).toHaveCSS('background-color', INK);
  await expect(submit).toHaveCSS('color', ON_FILL);
  await expectReadable(submit);
  await expectReadable(page.getByRole('tab', { name: 'Đăng nhập' }));
});

test('trang chủ, menu, điền phiếu, hộp xác nhận tối: thẻ form, chữ trên vàng, nút đỏ đủ tương phản', async ({ page, request }) => {
  // Dự án riêng (id b-… đứng trước demo-… trong /me) để lan là giám sát viên, thấy nút Sửa form
  const project = `b-${crypto.randomUUID().slice(0, 8)}`;
  await createProject(request, project, `Tối ${project}`);
  await setMembership(request, project, 'u_lan', 'supervisor');
  const id = 'toi';
  const res = await request.post(`http://localhost:3001/api/projects/${project}/forms`, {
    headers: authHeaders(TOKENS.lan),
    data: { id, title: 'Form chế độ tối', fields: [{ id: 'ten', type: 'text', label: 'Tên' }] },
  });
  expect(res.status()).toBe(201);
  await login(page, 'lan');

  // Header và logo: logo nền vàng, biểu tượng tối
  await expect(page.locator('header').first()).toHaveCSS('background-color', SURFACE);
  const logo = page.locator('header .logo').first();
  await expect(logo).toHaveCSS('background-color', HL);
  await expect(logo).toHaveCSS('color', ON_HL);

  // Mục menu đang ở: nền vàng, chữ tối
  const current = page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Phiếu' });
  await expect(current).toHaveAttribute('aria-current', 'page');
  await expect(current).toHaveCSS('background-color', HL);
  await expect(current).toHaveCSS('color', ON_HL);

  // Thẻ form: nền tối cùng tông, nút trong thẻ sáng chữ tối
  const card = page.getByRole('listitem').filter({ hasText: 'Form chế độ tối' });
  await expect(card.getByText('Form chế độ tối')).toBeVisible();
  const cardBg = await card.evaluate(bg);
  expect(['rgb(43, 38, 26)', 'rgb(31, 40, 28)', 'rgb(27, 37, 48)', 'rgb(45, 33, 28)', 'rgb(36, 33, 47)']).toContain(cardBg);
  await expectReadable(card.getByText('Form chế độ tối'));
  const newRecord = card.getByRole('button', { name: 'Tạo phiếu mới' });
  await expect(newRecord).toHaveCSS('color', ON_FILL);
  await expectReadable(newRecord);
  await expectReadable(card.getByRole('link', { name: 'Sửa form' }));

  // Điền phiếu: ô nhập nền tối, nhãn đủ tương phản
  await newRecord.click();
  const name = page.getByLabel('Tên');
  await expect(name).toHaveCSS('background-color', SURFACE);
  await expect(name).toHaveCSS('color', INK);
  await expectReadable(page.getByText('Tên', { exact: true }).first());

  // Hộp xác nhận Đăng xuất: nền tối, nút đỏ sáng chữ tối. Màn 4 không có menu nên quay về trang chủ trước
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Cài đặt' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('background-color', SURFACE);
  await expectReadable(dialog.getByText('Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.'));
  const confirm = dialog.getByRole('button', { name: 'Đăng xuất', exact: true });
  await expect(confirm).toHaveCSS('background-color', RED);
  await expect(confirm).toHaveCSS('color', ON_FILL);
  await expectReadable(confirm);
  await expectReadable(dialog.getByRole('button', { name: 'Huỷ' }));
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await setMembership(request, project, 'u_lan', null);
});

test('trang quản trị tối dùng cùng bảng màu', async ({ page }) => {
  await page.goto('/admin/');
  expect(await page.locator('body').evaluate(bg)).toBe(PAPER);
  const username = page.getByTestId('admin-username');
  await expect(username).toHaveCSS('background-color', SURFACE);
  await username.fill('admin');
  await page.getByTestId('admin-password').fill(DEMO_PASSWORD);
  await expectReadable(page.getByRole('heading', { level: 1 }));
  await expectReadable(page.getByRole('button', { name: 'Đăng nhập' }));
});

test.describe('chế độ sáng', () => {
  test.use({ colorScheme: 'light' });

  test('máy không đặt chế độ tối thì giữ bảng màu sáng, theme-color trắng', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('body').evaluate(bg)).toBe('rgb(255, 255, 255)');
    expect(await themeColor(page)).toBe('#ffffff');
    await page.getByLabel('Tên đăng nhập').fill('lan');
    await page.getByLabel('Mật khẩu').fill(DEMO_PASSWORD);
    await expect(page.getByRole('button', { name: 'Tiếp tục' })).toHaveCSS('color', 'rgb(255, 255, 255)');
  });
});

// Chọn giao diện ở màn hình 8 (ui.md màn hình 8 "Giao diện"; Could, Dương duyệt 2026-11-19): chọn tay thắng chế độ
// của máy, tải lại vẫn giữ, trang quản trị theo cùng lựa chọn; Theo máy thì về như cũ.
async function openSettings(page: Page) {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
}

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

test('máy tối mà chọn Sáng: app và trang quản trị sáng, tải lại vẫn sáng; Theo máy thì tối lại', async ({ page }) => {
  await login(page);
  await openSettings(page);
  const group = page.getByRole('radiogroup', { name: 'Giao diện' });
  await expect(group.getByRole('radio', { name: 'Theo máy' })).toBeChecked();
  expect(await page.locator('body').evaluate(bg)).toBe(PAPER);

  await group.getByRole('radio', { name: 'Sáng' }).check();
  expect(await page.locator('body').evaluate(bg)).toBe('rgb(255, 255, 255)');
  expect(await themeColor(page)).toBe('#ffffff');
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).colorScheme)).toBe('light');

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Sáng' })).toBeChecked();
  expect(await theme(page)).toBe('light');
  expect(await page.locator('body').evaluate(bg)).toBe('rgb(255, 255, 255)');

  await page.goto('/admin/');
  await expect(page.getByTestId('admin-username')).toBeVisible();
  expect(await page.locator('body').evaluate(bg)).toBe('rgb(255, 255, 255)');

  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Theo máy' }).check();
  expect(await page.locator('body').evaluate(bg)).toBe(PAPER);
  expect(await themeColor(page)).toBe('#211f1c');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
});

test.describe('máy sáng chọn Tối', () => {
  test.use({ colorScheme: 'light' });

  test('chọn Tối thì đổi ngay sang bảng màu tối, theme-color tối, tải lại vẫn tối', async ({ page }) => {
    await login(page);
    await openSettings(page);
    await page.getByRole('radio', { name: 'Tối' }).check();
    expect(await page.locator('body').evaluate(bg)).toBe(PAPER);
    expect(await page.locator('body').evaluate((el) => getComputedStyle(el).color)).toBe(INK);
    expect(await themeColor(page)).toBe('#211f1c');
    await expectReadable(page.getByRole('heading', { name: 'Cài đặt' }));

    await page.reload();
    await expect(page.getByRole('radio', { name: 'Tối' })).toBeChecked();
    expect(await page.locator('body').evaluate(bg)).toBe(PAPER);
  });
});
