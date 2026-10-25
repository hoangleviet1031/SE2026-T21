import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Tiêu đề trang (h2) ở màn 5, 6, 8, 9 cùng kiểu với màn 2, 4: 22px, đậm 800 (audit C10, ui.md
// "Hệ thống thiết kế"). Màn 1 không có tiêu đề, màn 7 không thuộc phần này.

test('tiêu đề trang ở Builder, Thành viên, Cài đặt, Tổ chức cùng cỡ với trang chủ', async ({ page }) => {
  await login(page, 'chu');
  const style = (el: Element) => {
    const s = getComputedStyle(el);
    return `${s.fontSize} ${s.fontWeight}`;
  };
  await expect(page.getByRole('heading', { level: 2, name: 'Biểu mẫu' })).toBeVisible();
  expect(await page.getByRole('heading', { level: 2, name: 'Biểu mẫu' }).evaluate(style)).toBe('22px 800');

  for (const [hash, name] of [
    ['#/builder/new', 'Biểu mẫu mới'],
    ['#/members', /^Thành viên · /],
    ['#/settings', 'Cài đặt'],
    ['#/orgs', 'Tổ chức'],
  ] as const) {
    await page.goto(`/${hash}`);
    const heading = page.getByRole('heading', { level: 2, name });
    await expect(heading).toBeVisible();
    expect(await heading.evaluate(style)).toBe('22px 800');
  }
});
