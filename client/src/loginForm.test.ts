import { describe, expect, it } from 'vitest';
import { accountErrorMessage, blockedMessage, exportResultText, loginReady, registerError } from './loginForm';

const ok = { username: 'minh.nguyen_2', name: 'Minh', password: '12345678', password2: '12345678' };

describe('loginReady', () => {
  it('cần đủ tên và mật khẩu', () => {
    expect(loginReady({ username: 'minh', password: 'x' })).toBe(true);
    expect(loginReady({ username: '  ', password: 'x' })).toBe(false);
    expect(loginReady({ username: 'minh', password: '' })).toBe(false);
  });

  it('không kiểm mẫu tên: tài khoản cũ tên là userId, tên lạ để server trả sai tên/mật khẩu', () => {
    expect(loginReady({ username: 'u_ovwt7i59', password: 'x' })).toBe(true);
    expect(loginReady({ username: 'Minh Nguyễn', password: 'x' })).toBe(true);
  });
});

describe('registerError', () => {
  it('đủ và đúng luật thì gửi được; tên chữ hoa được đổi về chữ thường như server', () => {
    expect(registerError(ok)).toBeNull();
    expect(registerError({ ...ok, username: 'MINH' })).toBeNull();
    expect(registerError({ ...ok, username: 'u_ovwt7i59' })).toBeNull();
  });

  it('tên đăng nhập sai mẫu hoặc sai độ dài', () => {
    const msg = 'Tên đăng nhập chỉ gồm chữ thường, số, dấu . và _ (3–32 ký tự)';
    expect(registerError({ ...ok, username: 'ab' })).toBe(msg);
    expect(registerError({ ...ok, username: 'a'.repeat(33) })).toBe(msg);
    expect(registerError({ ...ok, username: 'minh-nguyen' })).toBe(msg);
    expect(registerError({ ...ok, username: 'minh nguyen' })).toBe(msg);
    expect(registerError({ ...ok, username: 'a'.repeat(32) })).toBeNull();
  });

  it('tên hiển thị rỗng hoặc quá 100 ký tự', () => {
    expect(registerError({ ...ok, name: '   ' })).toBe('Nhập tên hiển thị');
    expect(registerError({ ...ok, name: 'a'.repeat(101) })).toBe('Tên hiển thị tối đa 100 ký tự');
    expect(registerError({ ...ok, name: 'a'.repeat(100) })).toBeNull();
  });

  it('mật khẩu 8–128 ký tự', () => {
    const msg = 'Mật khẩu cần từ 8 đến 128 ký tự';
    expect(registerError({ ...ok, password: '1234567', password2: '1234567' })).toBe(msg);
    const long = 'a'.repeat(129);
    expect(registerError({ ...ok, password: long, password2: long })).toBe(msg);
    const max = 'a'.repeat(128);
    expect(registerError({ ...ok, password: max, password2: max })).toBeNull();
  });

  it('nhập lại không khớp', () => {
    expect(registerError({ ...ok, password2: '12345679' })).toBe('Mật khẩu nhập lại không khớp');
  });
});

describe('accountErrorMessage', () => {
  it('câu theo mã lỗi của server', () => {
    expect(accountErrorMessage('invalid_credentials')).toBe('Sai tên đăng nhập hoặc mật khẩu');
    expect(accountErrorMessage('username_taken')).toBe('Tên đăng nhập đã có người dùng');
    expect(accountErrorMessage('too_many_requests')).toBe('Thử lại sau ít phút');
  });
});

describe('blockedMessage', () => {
  it('có số phiếu và tên người cũ', () => {
    expect(blockedMessage('Minh', 2)).toBe(
      'Máy này còn 2 phiếu chưa gửi của Minh. Đăng nhập lại bằng tài khoản của người đó để gửi, hoặc xuất JSON trước.',
    );
  });

  it('chỉ còn ảnh hoặc op, chưa biết tên người cũ', () => {
    expect(blockedMessage('', 0)).toBe(
      'Máy này còn dữ liệu chưa gửi. Đăng nhập lại bằng tài khoản của người đó để gửi, hoặc xuất JSON trước.',
    );
  });
});

describe('exportResultText', () => {
  it('đã tải file: báo số file', () => {
    expect(exportResultText(2)).toBe('Đã tải 2 file.');
  });
  it('không còn phiếu chưa gửi: bảo đăng nhập lại, không im lặng', () => {
    expect(exportResultText(0)).toBe('Máy không còn phiếu chưa gửi. Bấm Tiếp tục để đăng nhập lại.');
  });
});
