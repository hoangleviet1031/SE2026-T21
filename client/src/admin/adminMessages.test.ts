import { MAX_OWNED_PROJECTS } from '@field-survey/shared';
import { describe, expect, it } from 'vitest';
import { adminErrorMessage, formatShortTime, ownersLabel } from './adminMessages';

describe('adminErrorMessage', () => {
  it('mỗi mã một câu riêng', () => {
    expect(adminErrorMessage('request_decided')).toBe('Yêu cầu này đã được xử lý');
    expect(adminErrorMessage('project_limit_reached')).toBe(
      `Người gửi đã sở hữu ${MAX_OWNED_PROJECTS} tổ chức, chưa duyệt được`,
    );
    expect(adminErrorMessage('not_found')).toBe('Không có tài khoản hoặc tổ chức này');
    expect(adminErrorMessage('admin_account')).toBe('Không chỉ định được tài khoản quản trị');
    expect(adminErrorMessage('invalid_body')).toBe('Thông tin chưa hợp lệ, kiểm tra lại');
  });
});

describe('formatShortTime', () => {
  it('ngày/tháng giờ:phút theo giờ máy, có số 0 đầu', () => {
    const d = new Date(2026, 9, 2, 9, 5);
    expect(formatShortTime(d.toISOString())).toBe('02/10 09:05');
  });
});

describe('ownersLabel', () => {
  it('chưa có Owner', () => {
    expect(ownersLabel([])).toBe('Chưa có Owner');
  });
  it('nhiều Owner nối bằng dấu phẩy', () => {
    expect(ownersLabel(['hoa', 'lan'])).toBe('hoa, lan');
  });
});
