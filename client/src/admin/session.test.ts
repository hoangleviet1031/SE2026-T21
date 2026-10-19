import { describe, expect, it } from 'vitest';
import { parseSession } from './session';

const admin = { token: 't1', user: { id: 'u_a', username: 'admin', name: 'Quản trị', isAdmin: true } };

describe('parseSession', () => {
  it('đọc lại phiên admin đã lưu', () => {
    expect(parseSession(JSON.stringify(admin))).toEqual(admin);
  });

  it('chưa có gì → chưa đăng nhập', () => {
    expect(parseSession(null)).toBeNull();
  });

  it('không phải JSON → chưa đăng nhập', () => {
    expect(parseSession('{hỏng')).toBeNull();
  });

  it('tài khoản không phải admin → chưa đăng nhập', () => {
    expect(parseSession(JSON.stringify({ ...admin, user: { ...admin.user, isAdmin: false } }))).toBeNull();
  });

  it('thiếu token hoặc thiếu trường người dùng → chưa đăng nhập', () => {
    expect(parseSession(JSON.stringify({ ...admin, token: '' }))).toBeNull();
    expect(parseSession(JSON.stringify({ user: admin.user }))).toBeNull();
    expect(parseSession(JSON.stringify({ token: 't1', user: { id: 'u_a', isAdmin: true } }))).toBeNull();
    expect(parseSession(JSON.stringify([admin]))).toBeNull();
  });

  it('bỏ trường lạ, chỉ giữ token và người dùng', () => {
    expect(parseSession(JSON.stringify({ ...admin, extra: 1, user: { ...admin.user, x: 2 } }))).toEqual(admin);
  });
});
