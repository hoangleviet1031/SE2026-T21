import { describe, expect, it } from 'vitest';
import { NOT_MEMBER_MSG, SERVER_ERROR_MSG, SESSION_EXPIRED_MSG, apiFailureText } from './apiErrors';

describe('apiFailureText', () => {
  it('mất mạng dùng câu riêng của màn hình', () => {
    expect(apiFailureText('network', 'Cần kết nối để lưu form')).toBe('Cần kết nối để lưu form');
  });

  it('5xx, 401, không còn thành viên dùng câu chung theo design §8', () => {
    expect(apiFailureText('server', 'x')).toBe(SERVER_ERROR_MSG);
    expect(SERVER_ERROR_MSG).toBe('Máy chủ đang lỗi, thử lại sau');
    expect(apiFailureText('auth', 'x')).toBe(SESSION_EXPIRED_MSG);
    expect(SESSION_EXPIRED_MSG).toBe('Phiên đăng nhập hết hạn, đăng nhập lại');
    expect(apiFailureText('not_member', 'x')).toBe(NOT_MEMBER_MSG);
  });
});
