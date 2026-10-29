import { expect, test, type Page } from '@playwright/test';
import { PROJECT, login, putRow, readStore } from './helpers';

// TV1-17 phần 2: phiếu trên máy nhớ người tạo theo server (design §6.2); surveyor chỉ thấy nút
// "Xoá phiếu" ở phiếu mình tạo (design §5.7). minh là điều tra viên, lan là giám sát viên ở demo-yte.

const DB = `field-survey-p-${PROJECT}`;

type StoredRecord = { id: string; createdBy?: string; createdByName?: string };

const uniq = (name: string) => `${name} ${crypto.randomUUID().slice(0, 8)}`;

function recordRow(page: Page, text: string) {
  return page.getByTestId('records').getByRole('listitem').filter({ hasText: text });
}

/** minh tạo phiếu và chờ đồng bộ xong. Trả id phiếu. */
async function createSynced(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(recordRow(page, name).getByTestId('sync-state')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  const href = await recordRow(page, name).getByRole('link').first().getAttribute('href');
  return href?.split('/').pop() ?? '';
}

test('surveyor: phiếu mình tạo có nút Xoá, phiếu người khác tạo thì không', async ({ page }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const mine = uniq('Hộ của minh');
  const mineId = await createSynced(page, mine);
  // Đồng bộ xong thì phiếu nhớ người tạo theo response của server
  const stored = ((await readStore(page, DB, 'records')) as StoredRecord[]).find((r) => r.id === mineId);
  expect(stored).toMatchObject({ createdBy: 'u_minh', createdByName: 'minh' });

  // Phiếu của lan còn trên máy minh (vd. vừa bị hạ từ giám sát viên mà còn dữ liệu chưa gửi, §5.5).
  // Không có trên server nên vòng đồng bộ không đụng tới.
  const other = uniq('Hộ của lan');
  await putRow(page, DB, 'records', {
    id: crypto.randomUUID(),
    formId: 'household-survey',
    formVersion: 1,
    data: { householdName: other },
    deleted: false,
    baseData: { householdName: other },
    baseVersion: 1,
    syncState: 'synced',
    updatedAt: new Date().toISOString(),
    createdBy: 'u_lan',
    createdByName: 'lan',
  });
  await page.reload();

  await recordRow(page, other).getByRole('link').first().click();
  await expect(page.getByRole('button', { name: 'Lưu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xoá phiếu' })).toHaveCount(0);

  await page.getByRole('link', { name: '← Quay lại' }).click();
  await recordRow(page, mine).getByRole('link').first().click();
  await expect(page.getByRole('button', { name: 'Xoá phiếu' })).toBeVisible();
});

test('giám sát viên: phiếu người khác tạo vẫn có nút Xoá', async ({ page, browser }) => {
  await login(page, 'minh');
  await expect(page.getByText('Khảo sát hộ gia đình', { exact: true })).toBeVisible();
  const name = uniq('Hộ minh cho lan xem');
  await createSynced(page, name);

  const lanContext = await browser.newContext();
  try {
    const lan = await lanContext.newPage();
    await login(lan, 'lan');
    // lan ở hai dự án demo; minh tạo phiếu ở Y tế xã
    const switcher = lan.getByTestId('project-switcher');
    await switcher.getByRole('button', { expanded: false }).click();
    await switcher.getByRole('listitem').getByRole('button').filter({ hasText: 'Y tế xã (demo)' }).click();
    await recordRow(lan, name).getByRole('link').first().click({ timeout: 15_000 });
    await expect(lan.getByRole('button', { name: 'Xoá phiếu' })).toBeVisible();
  } finally {
    await lanContext.close();
  }
});
