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

export type LoginTab = 'login' | 'register';

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

/** Ô của màn hình 1 mà một lỗi gắn vào, để trình đọc màn hình đọc câu lỗi khi tới ô (design §11.3). */
export type LoginField = 'username' | 'name' | 'password' | 'password2';

export interface FieldProblem {
  text: string;
  fields: LoginField[];
}

/** Lỗi đầu tiên của form Tạo tài khoản kèm ô bị lỗi, hoặc null nếu gửi được. */
export function registerProblem({ username, name, password, password2 }: RegisterInput): FieldProblem | null {
  if (!USERNAME_PATTERN.test(username.trim().toLowerCase())) {
    return { text: 'Tên đăng nhập chỉ gồm chữ thường, số, dấu . và _ (3–32 ký tự)', fields: ['username'] };
  }
  if (name.trim() === '') return { text: 'Nhập tên hiển thị', fields: ['name'] };
  if (name.trim().length > DISPLAY_NAME_MAX_LENGTH) {
    return { text: `Tên hiển thị tối đa ${DISPLAY_NAME_MAX_LENGTH} ký tự`, fields: ['name'] };
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return { text: `Mật khẩu cần từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự`, fields: ['password'] };
  }
  if (password !== password2) return { text: 'Mật khẩu nhập lại không khớp', fields: ['password2'] };
  return null;
}

/** Lỗi đầu tiên của form Tạo tài khoản, hoặc null nếu gửi được. */
export function registerError(input: RegisterInput): string | null {
  return registerProblem(input)?.text ?? null;
}

/**
 * Ô gắn với lỗi của server. Sai tên hoặc mật khẩu thì gắn cả hai ô vì server không nói ô nào sai;
 * quá số lần và invalid_body không phải lỗi của một ô.
 */
export function accountErrorFields(code: AccountErrorCode): LoginField[] {
  switch (code) {
    case 'invalid_credentials':
      return ['username', 'password'];
    case 'username_taken':
      return ['username'];
    case 'too_many_requests':
    case 'invalid_body':
      return [];
  }
}

/** Tab ứng với phím trong hàng tab (←/→ đổi sang tab kia vì chỉ có hai tab), null nếu không phải phím đổi tab. */
export function tabForKey(current: LoginTab, key: string): LoginTab | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowRight':
      return current === 'login' ? 'register' : 'login';
    case 'Home':
      return 'login';
    case 'End':
      return 'register';
    default:
      return null;
  }
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

/** Lỗi khi tải file Xuất JSON lúc bị từ chối đổi tài khoản (dữ liệu trên máy không bị đụng tới) */
export const EXPORT_FAILED_MSG = 'Không xuất được file, thử lại.';

/**
 * Kết quả nút "Xuất JSON" khi bị từ chối đổi tài khoản: số file đã tải. 0 nghĩa là phiếu chưa gửi đã
 * được gửi xong trong lúc chờ (vòng đồng bộ chạy nền), nên đăng nhập lại là được.
 */
export function exportResultText(files: number): string {
  return files === 0 ? 'Máy không còn phiếu chưa gửi. Bấm Tiếp tục để đăng nhập lại.' : `Đã tải ${files} file.`;
}
