import { describe, expect, it } from 'vitest';
import { parseLoginRequest, parseRegisterRequest } from './accountValidation';

describe('parseRegisterRequest (ADR 0003 §1)', () => {
  const ok = { username: 'lan.nguyen_1', name: 'Lan', password: '12345678' };

  it('thân hợp lệ: trả nguyên', () => {
    expect(parseRegisterRequest(ok)).toEqual(ok);
  });

  it('tên đăng nhập chuyển về chữ thường, tên hiển thị cắt khoảng trắng hai đầu', () => {
    expect(parseRegisterRequest({ ...ok, username: 'Lan.Nguyen', name: '  Lan  ' })).toEqual({
      ...ok,
      username: 'lan.nguyen',
      name: 'Lan',
    });
  });

  it.each([
    ['quá ngắn', 'ab'],
    ['quá dài', 'a'.repeat(33)],
    ['ký tự lạ', 'lan-nguyen'],
    ['có dấu cách', 'lan nguyen'],
    ['có dấu tiếng Việt', 'lân'],
  ])('tên đăng nhập %s: undefined', (_label, username) => {
    expect(parseRegisterRequest({ ...ok, username })).toBeUndefined();
  });

  it('tên đăng nhập đúng 3 và đúng 32 ký tự: hợp lệ', () => {
    expect(parseRegisterRequest({ ...ok, username: 'abc' })).toBeDefined();
    expect(parseRegisterRequest({ ...ok, username: 'a'.repeat(32) })).toBeDefined();
  });

  it('mật khẩu 8 và 128 ký tự hợp lệ; 7 và 129 ký tự không', () => {
    expect(parseRegisterRequest({ ...ok, password: 'x'.repeat(8) })).toBeDefined();
    expect(parseRegisterRequest({ ...ok, password: 'x'.repeat(128) })).toBeDefined();
    expect(parseRegisterRequest({ ...ok, password: 'x'.repeat(7) })).toBeUndefined();
    expect(parseRegisterRequest({ ...ok, password: 'x'.repeat(129) })).toBeUndefined();
  });

  it('mật khẩu giữ nguyên khoảng trắng (không cắt)', () => {
    expect(parseRegisterRequest({ ...ok, password: ' 1234567 ' })?.password).toBe(' 1234567 ');
  });

  it('tên hiển thị trống (sau khi cắt) hoặc quá 100 ký tự: undefined', () => {
    expect(parseRegisterRequest({ ...ok, name: '   ' })).toBeUndefined();
    expect(parseRegisterRequest({ ...ok, name: 'a'.repeat(101) })).toBeUndefined();
    expect(parseRegisterRequest({ ...ok, name: 'a'.repeat(100) })).toBeDefined();
  });

  it.each([null, 'chuoi', 42, {}, { ...ok, password: 12345678 }, { username: 'lan', name: 'Lan' }])(
    'sai kiểu %j: undefined',
    (body) => {
      expect(parseRegisterRequest(body)).toBeUndefined();
    },
  );
});

describe('parseLoginRequest', () => {
  it('tên đăng nhập chuyển về chữ thường, mật khẩu giữ nguyên', () => {
    expect(parseLoginRequest({ username: 'LAN', password: ' Ab ' })).toEqual({ username: 'lan', password: ' Ab ' });
  });

  it('không kiểm định dạng tên hay độ dài mật khẩu: sai thì đăng nhập trả invalid_credentials, không lộ luật', () => {
    expect(parseLoginRequest({ username: 'x', password: 'y' })).toEqual({ username: 'x', password: 'y' });
  });

  it.each([null, {}, { username: 'lan' }, { username: 1, password: 'x' }])('sai kiểu %j: undefined', (body) => {
    expect(parseLoginRequest(body)).toBeUndefined();
  });
});
