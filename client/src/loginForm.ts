import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@field-survey/shared';
import type { AccountErrorCode } from './sync/api';

// Kiểm form Đăng nhập / Tạo tài khoản trước khi gọi API (design §4.7, ui.md màn hình 1). Luật lấy từ
// shared/accountValidation.ts để client không chặt hơn hay lỏng hơn server.

export const OFFLINE_MSG = 'Cần kết nối mạng';

export interface LoginInput {
  username: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  name: string;
  password: string;
  password2: string;
}

/**
 * Đăng nhập chỉ cần hai ô không rỗng. Không kiểm mẫu tên: tài khoản cũ có tên là `userId` (migration 4),
 * và tên sai thì server cũng chỉ trả "Sai tên đăng nhập hoặc mật khẩu".
 */
export function loginReady({ username, password }: LoginInput): boolean {
  return username.trim() !== '' && password !== '';
}

/** Lỗi đầu tiên của form Tạo tài khoản, hoặc null nếu gửi được. */
export function registerError({ username, name, password, password2 }: RegisterInput): string | null {
  if (!USERNAME_PATTERN.test(username.trim().toLowerCase())) {
    return 'Tên đăng nhập chỉ gồm chữ thường, số, dấu . và _ (3–32 ký tự)';
  }
  if (name.trim() === '') return 'Nhập tên hiển thị';
  if (name.trim().length > DISPLAY_NAME_MAX_LENGTH) return `Tên hiển thị tối đa ${DISPLAY_NAME_MAX_LENGTH} ký tự`;
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `Mật khẩu cần từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự`;
  }
  if (password !== password2) return 'Mật khẩu nhập lại không khớp';
  return null;
}

/** Câu báo theo mã lỗi của server (design §7.1). */
export function accountErrorMessage(code: AccountErrorCode): string {
  switch (code) {
    case 'invalid_credentials':
      return 'Sai tên đăng nhập hoặc mật khẩu';
    case 'username_taken':
      return 'Tên đăng nhập đã có người dùng';
    case 'too_many_requests':
      return 'Thử lại sau ít phút';
    case 'invalid_body':
      // Client đã kiểm cùng luật; tới đây là luật hai bên lệch nhau
      return 'Thông tin chưa hợp lệ, kiểm tra lại các ô';
  }
}

/** Câu báo khi máy còn dữ liệu chưa gửi của người khác (design §4.7). */
export function blockedMessage(previousName: string, unsentRecords: number): string {
  const who = previousName ? ` của ${previousName}` : '';
  const what = unsentRecords > 0 ? `${unsentRecords} phiếu chưa gửi` : 'dữ liệu chưa gửi';
  return `Máy này còn ${what}${who}. Đăng nhập lại bằng tài khoản của người đó để gửi, hoặc xuất JSON trước.`;
}
