import { expect, test, type Page } from '@playwright/test';
import { expectTapTarget, login, putRow, setMembership } from './helpers';

// [Sao chép] [Chia sẻ] dưới tên đăng nhập, màn hình 8 và 9 (design §4.7, ui.md màn hình 8, 9).

const COPY = 'Sao chép tên đăng nhập';
const SHARE = 'Chia sẻ tên đăng nhập';

// Đi bằng địa chỉ: ở 360px mục Cài đặt nằm trong ngăn kéo menu, không phải thứ đang kiểm ở đây
async function openSettings(page: Page) {
  await page.goto('/#/settings');
  await expect(page.getByTestId('settings-username')).toHaveText('minh');
}

/** Giả lập hộp chia sẻ của máy. Chữ gửi đi ghi vào sessionStorage để test đọc lại. */
async function mockShare(page: Page, failWith?: string) {
  await page.addInitScript((failWith) => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        sessionStorage.setItem('shared', JSON.stringify(data));
        if (failWith) throw new DOMException('giả lập', failWith);
      },
    });
  }, failWith);
}

async function hideShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
}

test('màn hình 8: Sao chép đúng tên đăng nhập kể cả offline, có phản hồi cho cả trình đọc màn hình', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);
  await openSettings(page);
  await context.setOffline(true);

  await page.getByRole('button', { name: COPY }).click();

  await expect(page.getByTestId('username-copied')).toHaveText('Đã sao chép tên đăng nhập');
  await expect(page.getByRole('status').filter({ hasText: 'Đã sao chép tên đăng nhập' })).toHaveCount(1);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('minh');
});

test('Sao chép thất bại: trình duyệt từ chối thì báo, không báo đã chép', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async () => {
        throw new DOMException('giả lập', 'NotAllowedError');
      },
    });
  });
  await login(page);
  await openSettings(page);
  await page.getByRole('button', { name: COPY }).click();
  const error = page.getByTestId('username-action-error');
  await expect(error).toHaveText('⚠ Không sao chép được. Hãy chọn tên đăng nhập rồi chép tay.');
  await expect(error).toHaveRole('alert');
  await expect(page.getByTestId('username-copied')).toHaveCount(0);
});

test('Sao chép thất bại: trang không chạy HTTPS nên không có navigator.clipboard thì cũng báo', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await login(page);
  await openSettings(page);
  await page.getByRole('button', { name: COPY }).click();
  await expect(page.getByTestId('username-action-error')).toHaveText(
    '⚠ Không sao chép được. Hãy chọn tên đăng nhập rồi chép tay.',
  );
});

test('Chia sẻ gửi tên kèm một câu ngắn, thành công không báo gì; bấm nút khác thì phản hồi cũ mất', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockShare(page);
  await login(page);
  await openSettings(page);

  await page.getByRole('button', { name: COPY }).click();
  await expect(page.getByTestId('username-copied')).toBeVisible();

  await page.getByRole('button', { name: SHARE }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('shared')))
    .toBe(JSON.stringify({ text: 'Tên đăng nhập của tôi: minh' }));
  await expect(page.getByTestId('username-copied')).toHaveCount(0);
  await expect(page.getByTestId('username-action-error')).toHaveCount(0);
});

test('Chia sẻ: người dùng huỷ thì không báo lỗi', async ({ page }) => {
  await mockShare(page, 'AbortError');
  await login(page);
  await openSettings(page);
  await page.getByRole('button', { name: SHARE }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('shared'))).not.toBeNull();
  await expect(page.getByTestId('username-action-error')).toHaveCount(0);
});

test('Chia sẻ: lỗi khác huỷ thì báo', async ({ page }) => {
  await mockShare(page, 'NotAllowedError');
  await login(page);
  await openSettings(page);
  await page.getByRole('button', { name: SHARE }).click();
  await expect(page.getByTestId('username-action-error')).toHaveText('⚠ Không chia sẻ được. Hãy dùng nút Sao chép.');
});

test('trình duyệt không có navigator.share: không hiện nút Chia sẻ, Sao chép vẫn có', async ({ page }) => {
  await hideShare(page);
  await login(page);
  await openSettings(page);
  await expect(page.getByRole('button', { name: COPY })).toBeVisible();
  await expect(page.getByRole('button', { name: SHARE })).toHaveCount(0);
});

test('màn hình 8 chưa có tên đăng nhập: không hiện nút', async ({ page, context }) => {
  await login(page);
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  // Offline để vòng đồng bộ không gọi /me ghi đè lại user
  await context.setOffline(true);
  await putRow(page, 'field-survey-account', 'account', { key: 'user', value: null });
  await page.goto('/#/settings');
  await expect(page.getByTestId('settings-username')).toHaveText('Chưa có, cần kết nối mạng một lần.');
  await expect(page.getByRole('button', { name: COPY })).toHaveCount(0);
  await expect(page.getByRole('button', { name: SHARE })).toHaveCount(0);
});

test('360px: hai nút ở màn hình 8 và 9 cao ≥ 44px, giữ hai câu hướng dẫn, dùng được bằng bàn phím', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockShare(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page);
  await openSettings(page);
  await expectTapTarget(page.getByRole('button', { name: COPY }));
  await expectTapTarget(page.getByRole('button', { name: SHARE }));
  await expect(
    page.getByText('Giám sát viên hoặc Owner cần tên này nếu muốn thêm bạn vào tổ chức khác.'),
  ).toBeVisible();

  await page.getByRole('button', { name: COPY }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('username-copied')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: SHARE })).toBeFocused();

  await page.goto('/#/orgs');
  await expect(page.getByTestId('orgs-username')).toHaveText('minh');
  await expectTapTarget(page.getByRole('button', { name: COPY }));
  await expectTapTarget(page.getByRole('button', { name: SHARE }));
  await expect(page.getByTestId('orgs')).toContainText('Gửi tên này cho giám sát viên của tổ chức để được thêm vào.');

  // Khối trắng ở màn hình 9 không có luật p như màn hình 8 và khối chào: dòng báo không được giữ lề mặc định
  await page.getByRole('button', { name: COPY }).click();
  await expect(page.getByTestId('username-copied')).toHaveCSS('margin-top', '0px');
});

test.describe('chưa thuộc tổ chức nào', () => {
  test.afterEach(async ({ request }) => {
    await setMembership(request, 'demo-yte', 'u_minh', 'surveyor');
  });

  test('màn hình 9 là trang chủ: khối chào có nút, Sao chép đúng tên', async ({ page, context, request }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 360, height: 740 });
    await setMembership(request, 'demo-yte', 'u_minh', null);
    await login(page);
    await expect(page.getByTestId('orgs')).toContainText('Bạn chưa thuộc tổ chức nào.');
    await expectTapTarget(page.getByRole('button', { name: COPY }));

    await page.getByRole('button', { name: COPY }).click();
    await expect(page.getByTestId('username-copied')).toHaveText('Đã sao chép tên đăng nhập');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('minh');
  });
});
