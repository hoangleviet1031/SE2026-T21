import { expect, test, type Page } from '@playwright/test';
import { API, PROJECT, TOKENS, authHeaders, login, putRow } from './helpers';

// Lịch sử sửa của phiếu ở màn hình 4 (Could; design §4.1 "Lịch sử sửa", §8; ui.md màn hình 4).
// minh là điều tra viên, lan là giám sát viên ở demo-yte.

const FAULTS = 'http://localhost:3001/api/__test/faults';
const DB = `field-survey-p-${PROJECT}`;

test.afterEach(async ({ request }) => {
  await request.delete(FAULTS);
});

const uniq = (name: string) => `${name} ${crypto.randomUUID().slice(0, 8)}`;

function recordRow(page: Page, text: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: text });
}

const historyButton = (page: Page) => page.getByRole('button', { name: 'Lịch sử sửa' });

/** Tạo phiếu, chờ đồng bộ, mở lại. Trả id phiếu. */
async function createSyncedAndOpen(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const link = recordRow(page, name).getByRole('link').first();
  const id = (await link.getAttribute('href'))?.split('/').pop() ?? '';
  await link.click();
  return id;
}

test('xem ai sửa, lúc nào, trường nào đổi; mở lại thì tải lại; có thay đổi chưa gửi thì báo', async ({ page, request }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const first = uniq('Hộ An');
  const second = uniq('Hộ Bình');
  const id = await createSyncedAndOpen(page, first);

  await page.locator('input[name=householdName]').fill(second);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, second).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  await recordRow(page, second).getByRole('link').first().click();

  await expect(historyButton(page)).toHaveAttribute('aria-expanded', 'false');
  await historyButton(page).click();
  await expect(historyButton(page)).toHaveAttribute('aria-expanded', 'true');
  const items = page.getByTestId('record-history').getByRole('listitem');
  await expect(items).toHaveCount(2, { timeout: 10_000 });
  await expect(items.nth(0)).toContainText('minh sửa');
  await expect(items.nth(0)).toContainText(`Tên chủ hộ: ${first} → ${second}`);
  await expect(items.nth(1)).toContainText('minh tạo phiếu');
  await expect(page.getByTestId('history-unsynced')).toHaveCount(0);

  // lan sửa trên server; mở lại khối thì tải lại và thấy tên lan
  const put = await request.put(`${API}/records/${id}`, {
    headers: { ...authHeaders(TOKENS.lan), 'Idempotency-Key': crypto.randomUUID() },
    data: { formId: 'household-survey', formVersion: 1, baseVersion: 2, data: { householdName: second, members: 5 }, deleted: false },
  });
  expect(put.status()).toBe(200);
  await historyButton(page).click();
  await expect(page.getByTestId('record-history')).toHaveCount(0);
  await historyButton(page).click();
  await expect(items).toHaveCount(3, { timeout: 10_000 });
  await expect(items.nth(0)).toContainText('lan sửa');
  await expect(items.nth(0)).toContainText('Số thành viên: (trống) → 5');

  // Lưu thành nháp (thiếu tên): lịch sử chỉ có bản trên server nên báo phần chưa gửi
  await page.locator('input[name=householdName]').fill('');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('draft-notice')).toBeVisible();
  await expect(page.getByTestId('history-unsynced')).toHaveText('Thay đổi chưa đồng bộ trên máy này chưa có trong lịch sử.');
});

test('phiếu chưa từng lên server không có nút Lịch sử sửa', async ({ page, context }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const name = uniq('Hộ offline');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await expect(historyButton(page)).toHaveCount(0);
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await recordRow(page, name).getByRole('link').first().click();
  await expect(page.getByRole('button', { name: 'Lưu' })).toBeVisible();
  await expect(historyButton(page)).toHaveCount(0);
  await context.setOffline(false);
});

test('offline thì báo cần kết nối; có mạng bấm lại thì xem được', async ({ page, context }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  await createSyncedAndOpen(page, uniq('Hộ mất mạng'));

  await context.setOffline(true);
  await historyButton(page).click();
  await expect(page.getByTestId('history-error')).toHaveText('Cần kết nối để xem lịch sử sửa');
  await context.setOffline(false);
  await historyButton(page).click();
  await historyButton(page).click();
  await expect(page.getByTestId('record-history').getByRole('listitem')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByTestId('history-error')).toHaveCount(0);
});

test('máy chủ lỗi thì báo, không tự thử lại', async ({ page, request }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const id = await createSyncedAndOpen(page, uniq('Hộ máy chủ lỗi'));
  await request.post(FAULTS, { data: { mode: '500', count: 1, match: `/records/${id}/history` } });
  await historyButton(page).click();
  await expect(page.getByTestId('history-error')).toHaveText('Máy chủ đang lỗi, thử lại sau', { timeout: 15_000 });
});

test('phiếu máy chủ không có (hoặc ngoài phạm vi) thì báo 404', async ({ page }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  // Phiếu nằm trên máy như đã đồng bộ mà server không có; không có op nên vòng đồng bộ không đụng tới
  const name = uniq('Hộ không có trên server');
  await putRow(page, DB, 'records', {
    id: crypto.randomUUID(),
    formId: 'household-survey',
    formVersion: 1,
    data: { householdName: name },
    deleted: false,
    baseData: { householdName: name },
    baseVersion: 1,
    syncState: 'synced',
    updatedAt: new Date().toISOString(),
  });
  await page.reload();
  await recordRow(page, name).getByRole('link').first().click();
  await historyButton(page).click();
  await expect(page.getByTestId('history-error')).toHaveText(
    'Máy chủ không có lịch sử của phiếu này hoặc bạn không được xem.',
    { timeout: 15_000 },
  );
});
