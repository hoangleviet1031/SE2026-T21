import { describe, expect, it } from 'vitest';
import {
  canAssignRole,
  parseAddMemberRequest,
  parseUpdateMemberRequest,
  parseUpdateSettingsRequest,
} from './memberValidation';

describe('canAssignRole (ADR 0003 §2)', () => {
  it('owner đụng được mọi vai trò', () => {
    expect(canAssignRole('owner', 'surveyor')).toBe(true);
    expect(canAssignRole('owner', 'supervisor')).toBe(true);
    expect(canAssignRole('owner', 'owner')).toBe(true);
  });

  it('supervisor chỉ đụng tới điều tra viên', () => {
    expect(canAssignRole('supervisor', 'surveyor')).toBe(true);
    expect(canAssignRole('supervisor', 'supervisor')).toBe(false);
    expect(canAssignRole('supervisor', 'owner')).toBe(false);
  });

  it('surveyor không đụng được ai', () => {
    expect(canAssignRole('surveyor', 'surveyor')).toBe(false);
  });
});

describe('parseAddMemberRequest', () => {
  it('cắt khoảng trắng, chuyển tên đăng nhập về chữ thường', () => {
    expect(parseAddMemberRequest({ username: '  Lan.Nguyen ', role: 'surveyor' })).toEqual({
      username: 'lan.nguyen',
      role: 'surveyor',
    });
  });

  it.each([
    ['không phải object', 'lan'],
    ['mảng', ['lan']],
    ['thiếu username', { role: 'surveyor' }],
    ['username rỗng', { username: '   ', role: 'surveyor' }],
    ['username không phải chuỗi', { username: 1, role: 'surveyor' }],
    ['vai trò lạ', { username: 'lan', role: 'admin' }],
    ['thiếu vai trò', { username: 'lan' }],
  ])('sai: %s', (_name, body) => {
    expect(parseAddMemberRequest(body)).toBeUndefined();
  });
});

describe('parseUpdateMemberRequest', () => {
  it('nhận vai trò hợp lệ', () => {
    expect(parseUpdateMemberRequest({ role: 'owner' })).toEqual({ role: 'owner' });
  });

  it.each([[null], [{}], [{ role: 'admin' }], [{ role: 1 }]])('sai: %j', (body) => {
    expect(parseUpdateMemberRequest(body)).toBeUndefined();
  });
});

describe('parseUpdateSettingsRequest', () => {
  it('tên cắt khoảng trắng hai đầu; public giữ nguyên', () => {
    expect(parseUpdateSettingsRequest({ name: '  Y tế  ', public: true })).toEqual({ name: 'Y tế', public: true });
    expect(parseUpdateSettingsRequest({ public: false })).toEqual({ public: false });
    expect(parseUpdateSettingsRequest({ name: 'a'.repeat(100) })).toEqual({ name: 'a'.repeat(100) });
  });

  it.each([
    ['không có trường nào', {}],
    ['tên rỗng sau khi cắt', { name: '   ' }],
    ['tên quá 100 ký tự', { name: 'a'.repeat(101) }],
    ['tên không phải chuỗi', { name: 1 }],
    ['public không phải boolean', { public: 'true' }],
    ['null', null],
  ])('sai: %s', (_name, body) => {
    expect(parseUpdateSettingsRequest(body)).toBeUndefined();
  });
});
