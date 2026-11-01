import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@field-survey/shared';

// Đổi mật khẩu ở trang Cài đặt (design §4.7, ui.md màn hình 8). Luật mật khẩu mới lấy từ
// shared/accountValidation.ts như form Tạo tài khoản, để client không chặt hơn hay lỏng hơn server.

export const CHANGE_PASSWORD_OFFLINE_MSG = 'Cần kết nối mạng để đổi mật khẩu';
export const CHANGE_PASSWORD_DONE_MSG = 'Đã đổi mật khẩu. Các máy khác cần đăng nhập lại.';

/** Mã lỗi của `POST /auth/change-password` mà trang báo thành câu (design §7, §7.1). */
export const CHANGE_PASSWORD_ERROR_CODES = ['wrong_password', 'too_many_requests', 'invalid_body'] as const;
export type ChangePasswordErrorCode = (typeof CHANGE_PASSWORD_ERROR_CODES)[number];

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  newPassword2: string;
}

/** Lỗi đầu tiên của form, hoặc null nếu gửi được. Câu giống form Tạo tài khoản (loginForm.ts). */
export function changePasswordError({ currentPassword, newPassword, newPassword2 }: ChangePasswordInput): string | null {
  if (currentPassword === '') return 'Nhập mật khẩu hiện tại';
  if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
    return `Mật khẩu cần từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự`;
  }
  if (newPassword !== newPassword2) return 'Mật khẩu nhập lại không khớp';
  return null;
}

export function changePasswordErrorText(code: ChangePasswordErrorCode): string {
  switch (code) {
    case 'wrong_password':
      return 'Mật khẩu hiện tại không đúng';
    case 'too_many_requests':
      return 'Thử lại sau ít phút';
    case 'invalid_body':
      // Form đã kiểm trước khi gửi; tới đây là client và server lệch luật
      return `Mật khẩu cần từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự`;
  }
}
