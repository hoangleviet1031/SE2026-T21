import { describe, expect, it } from 'vitest';
import { currentNavId, navItems } from './navMenu';

describe('currentNavId', () => {
  it('trang chủ, Tổ chức, Thành viên, Cài đặt có menu', () => {
    expect(currentNavId([], true)).toBe('home');
    expect(currentNavId(['orgs'], true)).toBe('orgs');
    expect(currentNavId(['members'], true)).toBe('members');
    expect(currentNavId(['settings'], true)).toBe('settings');
  });

  it('điền phiếu, xung đột, builder không có menu', () => {
    expect(currentNavId(['fill', 'f1'], true)).toBeNull();
    expect(currentNavId(['fill', 'f1', 'r1'], true)).toBeNull();
    expect(currentNavId(['conflict', 'r1'], true)).toBeNull();
    expect(currentNavId(['builder', 'new'], true)).toBeNull();
    expect(currentNavId(['builder', 'f1'], true)).toBeNull();
  });

  it('route lạ hoặc thiếu id rơi về trang chủ như App.tsx', () => {
    expect(currentNavId(['fill'], true)).toBe('home');
    expect(currentNavId(['khong-co'], true)).toBe('home');
  });

  it('chưa thuộc tổ chức nào: trang chủ là màn hình Tổ chức', () => {
    expect(currentNavId([], false)).toBe('orgs');
    expect(currentNavId(['settings'], false)).toBe('settings');
  });
});

describe('navItems', () => {
  const ids = (canManage: boolean, hasProject: boolean) => navItems(canManage, hasProject).map((i) => i.id);

  it('giám sát viên, Owner có Thành viên; điều tra viên không', () => {
    expect(ids(true, true)).toEqual(['home', 'orgs', 'members', 'settings']);
    expect(ids(false, true)).toEqual(['home', 'orgs', 'settings']);
  });

  it('chưa thuộc tổ chức nào: không có Phiếu', () => {
    expect(ids(false, false)).toEqual(['orgs', 'settings']);
  });
});
