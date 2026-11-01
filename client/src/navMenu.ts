import type { IconName } from './components/Icon';

// Menu điều hướng (ui.md "Menu điều hướng"): chỉ ở màn hình 2, 6, 8, 9. Màn hình điền phiếu, xung đột,
// builder đã có "← Quay lại" và cần trọn bề ngang cho nội dung nên không có menu.

export type NavId = 'home' | 'orgs' | 'members' | 'settings';

export interface NavItem {
  id: NavId;
  href: string;
  label: string;
  icon: IconName;
}

const ITEMS: readonly NavItem[] = [
  { id: 'home', href: '#/', label: 'Phiếu', icon: 'form' },
  { id: 'orgs', href: '#/orgs', label: 'Tổ chức', icon: 'org' },
  { id: 'members', href: '#/members', label: 'Thành viên', icon: 'users' },
  { id: 'settings', href: '#/settings', label: 'Cài đặt', icon: 'gear' },
];

/**
 * Mục đang ở theo route, chọn trang giống App.tsx; `null` là màn hình không có menu.
 * Chưa thuộc tổ chức nào thì trang chủ chính là màn hình Tổ chức (design §4.7), nên đánh dấu mục Tổ chức.
 */
export function currentNavId(route: readonly string[], hasProject: boolean): NavId | null {
  const [page, arg] = route;
  if ((page === 'fill' || page === 'conflict' || page === 'builder') && arg) return null;
  if (page === 'members' || page === 'orgs' || page === 'settings') return page;
  return hasProject ? 'home' : 'orgs';
}

/** Thành viên chỉ cho giám sát viên và Owner (ui.md màn hình 6); chưa có tổ chức thì không có phiếu để xem. */
export function navItems(canManage: boolean, hasProject: boolean): NavItem[] {
  return ITEMS.filter((item) => (item.id === 'home' ? hasProject : item.id === 'members' ? canManage : true));
}
