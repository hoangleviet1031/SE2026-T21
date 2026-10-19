import { expect, test, type Page } from '@playwright/test';
import { login, readStore, setMembership } from './helpers';

// Bộ chọn dự án (TV1-06; design §4.7, §11.2, ui.md màn hình 2). Dự án demo (server/src/seedDemo.ts):
// lan là giám sát viên ở "Y tế xã (demo)", điều tra viên ở "Nông nghiệp (demo)"; minh chỉ ở Y tế xã.

const YTE = 'Y tế xã (demo)';
const NONGNGHIEP = 'Nông nghiệp (demo)';

function switcher(page: Page) {
  return page.getByTestId('project-switcher');
}

/** Mở bộ chọn và chọn dự án theo tên. */
async function choose(page: Page, name: string) {
  await switcher(page).getByRole('button', { expanded: false }).click();
  await switcher(page).getByRole('listitem').getByRole('button', { name: new RegExp(escapeRegExp(name)) }).click();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Chờ vòng đồng bộ đầu tải form của mọi dự án, để đổi dự án khi offline có dữ liệu. */
async function waitAllProjectsLoaded(page: Page) {
  for (const id of ['demo-yte', 'demo-nongnghiep']) {
    await expect
      .poll(async () => (await readStore(page, `field-survey-p-${id}`, 'forms').catch(() => [])).length)
      .toBeGreaterThan(0);
  }
}

test('nhiều dự án: mở bộ chọn thấy mọi dự án kèm vai trò, chưa chọn lần nào thì vào dự án đầu tiên', async ({
  page,
}) => {
  await login(page, 'lan');
  // /me sắp theo id: demo-nongnghiep đứng trước demo-yte
  await expect(switcher(page).getByRole('button', { expanded: false })).toHaveText(`${NONGNGHIEP} ▾`);

  await switcher(page).getByRole('button', { expanded: false }).click();
  const items = switcher(page).getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: NONGNGHIEP })).toContainText('✓');
  await expect(items.filter({ hasText: NONGNGHIEP })).toContainText('Điều tra viên');
  await expect(items.filter({ hasText: YTE })).toContainText('Giám sát viên');
});

test('đổi dự án khi offline trong 1 s, mỗi dự án chỉ hiện phiếu của mình; nhớ dự án đã chọn', async ({
  page,
  context,
}) => {
  await login(page, 'lan');
  await waitAllProjectsLoaded(page);
  await context.setOffline(true);

  const name = `Hộ đổi dự án ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.locator('input[name=householdName]').fill(name);
  await page.getByRole('button', { name: 'Lưu' }).click();
  const record = page.getByTestId('records').getByText(name);
  await expect(record).toBeVisible();

  // design §11.2: đổi dự án đã tải ≤ 1 s, kể cả offline
  await choose(page, YTE);
  await expect(switcher(page).getByRole('button', { expanded: false })).toHaveText(`${YTE} ▾`, { timeout: 1000 });
  await expect(page.getByText('Khảo sát hộ gia đình')).toBeVisible({ timeout: 1000 });
  await expect(record).toHaveCount(0);

  await choose(page, NONGNGHIEP);
  await expect(record).toBeVisible({ timeout: 1000 });

  await choose(page, YTE);
  await expect(record).toHaveCount(0);
  await page.reload();
  await expect(switcher(page).getByRole('button', { expanded: false })).toHaveText(`${YTE} ▾`);
});

test('chỉ một dự án: chỉ hiện tên, không có danh sách', async ({ page }) => {
  await login(page, 'minh');
  await expect(switcher(page)).toHaveText(YTE);
  await expect(switcher(page).getByRole('button')).toHaveCount(0);
});

test.describe('chưa thuộc dự án nào', () => {
  test.afterEach(async ({ request }) => {
    await setMembership(request, 'demo-yte', 'u_minh', 'surveyor');
  });

  // Câu tạm tới TV1-15 (màn hình Tổ chức): hiện tên đăng nhập thay cho userId (TV1-14)
  test('hiện tên đăng nhập để gửi giám sát viên, không có bộ chọn', async ({ page, request }) => {
    await setMembership(request, 'demo-yte', 'u_minh', null);
    await login(page, 'minh');
    await expect(page.getByTestId('no-project')).toHaveText(
      'Bạn chưa thuộc tổ chức nào. Gửi tên đăng nhập minh cho giám sát viên của tổ chức để được thêm vào.',
    );
    await expect(switcher(page)).toHaveCount(0);
  });
});
