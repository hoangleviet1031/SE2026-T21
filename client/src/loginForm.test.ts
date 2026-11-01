import { describe, expect, it } from 'vitest';
import {
  accountErrorFields,
  accountErrorMessage,
  blockedMessage,
  exportResultText,
  loginReady,
  registerError,
  registerProblem,
  tabForKey,
} from './loginForm';

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

// Ô gắn với câu lỗi để trình đọc màn hình đọc khi tới ô (design §11.3)
describe('registerProblem', () => {
  it('gắn lỗi vào đúng ô, cùng câu với registerError', () => {
    expect(registerProblem(ok)).toBeNull();
    expect(registerProblem({ ...ok, username: 'ab' })).toEqual({
      text: 'Tên đăng nhập chỉ gồm chữ thường, số, dấu . và _ (3–32 ký tự)',
      fields: ['username'],
    });
    expect(registerProblem({ ...ok, name: ' ' })).toEqual({ text: 'Nhập tên hiển thị', fields: ['name'] });
    expect(registerProblem({ ...ok, name: 'a'.repeat(101) })?.fields).toEqual(['name']);
    expect(registerProblem({ ...ok, password: '1234567', password2: '1234567' })?.fields).toEqual(['password']);
    expect(registerProblem({ ...ok, password2: '12345679' })).toEqual({
      text: 'Mật khẩu nhập lại không khớp',
      fields: ['password2'],
    });
  });

  it('nhiều ô sai thì chỉ báo ô đầu tiên, theo thứ tự trên màn hình', () => {
    expect(registerProblem({ username: 'ab', name: '', password: '1', password2: '2' })?.fields).toEqual(['username']);
  });
});

describe('accountErrorFields', () => {
  it('sai tên hoặc mật khẩu gắn cả hai ô; lỗi không thuộc ô nào thì không gắn', () => {
    expect(accountErrorFields('invalid_credentials')).toEqual(['username', 'password']);
    expect(accountErrorFields('username_taken')).toEqual(['username']);
    expect(accountErrorFields('too_many_requests')).toEqual([]);
    expect(accountErrorFields('invalid_body')).toEqual([]);
  });
});

describe('tabForKey', () => {
  it('mũi tên sang tab kia (vòng lại), Home tab đầu, End tab cuối', () => {
    expect(tabForKey('login', 'ArrowRight')).toBe('register');
    expect(tabForKey('register', 'ArrowRight')).toBe('login');
    expect(tabForKey('login', 'ArrowLeft')).toBe('register');
    expect(tabForKey('register', 'ArrowLeft')).toBe('login');
    expect(tabForKey('register', 'Home')).toBe('login');
    expect(tabForKey('login', 'End')).toBe('register');
  });

  it('phím khác không đổi tab', () => {
    expect(tabForKey('login', 'Tab')).toBeNull();
    expect(tabForKey('login', 'ArrowDown')).toBeNull();
    expect(tabForKey('login', 'Enter')).toBeNull();
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
