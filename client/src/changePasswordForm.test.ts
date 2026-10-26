import { describe, expect, it } from 'vitest';
import { changePasswordError, changePasswordErrorText } from './changePasswordForm';

describe('changePasswordError', () => {
  const ok = { currentPassword: 'mat-khau-cu', newPassword: '12345678', newPassword2: '12345678' };

  it('đủ và đúng luật: null', () => {
    expect(changePasswordError(ok)).toBeNull();
    expect(changePasswordError({ ...ok, newPassword: 'x'.repeat(128), newPassword2: 'x'.repeat(128) })).toBeNull();
  });

  it('thiếu mật khẩu hiện tại', () => {
    expect(changePasswordError({ ...ok, currentPassword: '' })).toBe('Nhập mật khẩu hiện tại');
  });

  it('mật khẩu mới 7 hoặc 129 ký tự', () => {
    expect(changePasswordError({ ...ok, newPassword: '1234567', newPassword2: '1234567' })).toBe(
      'Mật khẩu cần từ 8 đến 128 ký tự',
    );
    expect(changePasswordError({ ...ok, newPassword: 'x'.repeat(129), newPassword2: 'x'.repeat(129) })).toBe(
      'Mật khẩu cần từ 8 đến 128 ký tự',
    );
  });

  it('nhập lại không khớp', () => {
    expect(changePasswordError({ ...ok, newPassword2: '12345679' })).toBe('Mật khẩu nhập lại không khớp');
  });

  it('báo lỗi đầu tiên theo thứ tự ô', () => {
    expect(changePasswordError({ currentPassword: '', newPassword: '1', newPassword2: '2' })).toBe(
      'Nhập mật khẩu hiện tại',
    );
  });
});

describe('changePasswordErrorText', () => {
  it('câu theo mã lỗi (design §7.1)', () => {
    expect(changePasswordErrorText('wrong_password')).toBe('Mật khẩu hiện tại không đúng');
    expect(changePasswordErrorText('too_many_requests')).toBe('Thử lại sau ít phút');
    expect(changePasswordErrorText('invalid_body')).toBe('Mật khẩu cần từ 8 đến 128 ký tự');
  });
});
