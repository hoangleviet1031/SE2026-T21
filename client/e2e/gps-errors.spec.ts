import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Bấm "Lấy vị trí" mà không lấy được (TV1-12 b1; design §8, ui.md màn hình 4). Ca lấy vị trí thành công
// khi offline là TV3-14. Các ca cần điều khiển kết quả thì thay getCurrentPosition bằng bản giữ callback
// lại, test tự gọi; đối tượng vị trí/lỗi giả chỉ có phần app đọc (`coords`, `code`).

const DENIED = '⚠ Chưa được phép lấy vị trí. Bật quyền vị trí cho trang này trong cài đặt trình duyệt rồi bấm lại.';
const UNAVAILABLE = '⚠ Không lấy được vị trí. Ra chỗ thoáng rồi bấm lại.';

interface GpsCall {
  ok: PositionCallback;
  fail: PositionErrorCallback | null | undefined;
  opts: PositionOptions | undefined;
}
// Bản thay getCurrentPosition ghi lại từng lần gọi ở đây (chỉ có trong trang khi test gọi stubGeolocation)
declare global {
  interface Window {
    gpsCalls?: GpsCall[];
  }
}

async function stubGeolocation(page: Page) {
  await page.addInitScript(() => {
    const calls: GpsCall[] = [];
    window.gpsCalls = calls;
    navigator.geolocation.getCurrentPosition = (ok, fail, opts) => {
      calls.push({ ok, fail, opts });
    };
  });
}

async function openNewRecord(page: Page) {
  await login(page);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  return page.getByRole('group', { name: 'Vị trí' });
}

test('chưa cấp quyền vị trí: báo cách bật quyền; cấp quyền rồi bấm lại thì hết câu, có toạ độ', async ({
  page,
  context,
}) => {
  const gps = await openNewRecord(page);
  await gps.getByRole('button', { name: 'Lấy vị trí' }).click();
  await expect(gps.getByTestId('gps-error')).toHaveText(DENIED);

  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 10.7769, longitude: 106.7009, accuracy: 12 });
  await gps.getByRole('button', { name: 'Lấy vị trí' }).click();
  await expect(gps.getByText('10.77690, 106.70090 (±12 m)')).toBeVisible();
  await expect(gps.getByTestId('gps-error')).toHaveCount(0);
});

test('đang lấy: nút khoá, có "Đang lấy vị trí…", chờ tối đa 30 s; không lấy được hoặc quá giờ thì báo', async ({
  page,
}) => {
  await stubGeolocation(page);
  const gps = await openNewRecord(page);
  const button = gps.getByRole('button', { name: 'Lấy vị trí' });

  await button.click();
  await expect(gps.getByTestId('busy-note')).toHaveText('Đang lấy vị trí…');
  // Khác các nút khác: chờ được tới 30 s nên chữ vẫn hiện trên màn hình (ui.md "Đang gửi")
  expect(await gps.getByTestId('busy-note').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(1);
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => window.gpsCalls?.[0]?.opts?.timeout)).toBe(30_000);

  await page.evaluate(() => window.gpsCalls?.[0]?.fail?.({ code: 2 } as GeolocationPositionError));
  await expect(gps.getByTestId('gps-error')).toHaveText(UNAVAILABLE);
  await expect(gps.getByTestId('busy-note')).toHaveCount(0);
  await expect(button).toBeEnabled();

  // Quá giờ chờ (mã 3) cùng câu với không lấy được
  await button.click();
  await expect(gps.getByTestId('gps-error')).toHaveCount(0);
  await page.evaluate(() => window.gpsCalls?.[1]?.fail?.({ code: 3 } as GeolocationPositionError));
  await expect(gps.getByTestId('gps-error')).toHaveText(UNAVAILABLE);
});

test('vị trí về sau khi đã sửa ô khác: giữ phần vừa sửa', async ({ page }) => {
  await stubGeolocation(page);
  const gps = await openNewRecord(page);
  await gps.getByRole('button', { name: 'Lấy vị trí' }).click();
  await page.locator('input[name=householdName]').fill('Sửa trong lúc chờ');
  await page.evaluate(() =>
    window.gpsCalls?.[0]?.ok({ coords: { latitude: 21.0285, longitude: 105.8542, accuracy: 8 } } as GeolocationPosition),
  );
  await expect(gps.getByText('21.02850, 105.85420 (±8 m)')).toBeVisible();
  await expect(page.locator('input[name=householdName]')).toHaveValue('Sửa trong lúc chờ');
});

test('trình duyệt không có geolocation: báo không lấy được vị trí', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, 'geolocation');
  });
  const gps = await openNewRecord(page);
  await gps.getByRole('button', { name: 'Lấy vị trí' }).click();
  await expect(gps.getByTestId('gps-error')).toHaveText('⚠ Trình duyệt này không lấy được vị trí.');
});

test('bấm vào tên trường Vị trí không tự lấy vị trí', async ({ page }) => {
  await stubGeolocation(page);
  const gps = await openNewRecord(page);
  await gps.getByText('Vị trí', { exact: true }).click();
  await expect(gps.getByTestId('busy-note')).toHaveCount(0);
  expect(await page.evaluate(() => window.gpsCalls?.length)).toBe(0);
});
