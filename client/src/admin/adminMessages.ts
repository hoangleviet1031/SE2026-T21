import { MAX_OWNED_PROJECTS } from '@field-survey/shared';
import type { AdminErrorCode } from './adminApi';

// Câu hiện cho admin theo mã lỗi (design §7.1, §8). Hàm thuần để unit test, không phụ thuộc React.

export const SERVER_ERROR_MSG = 'Máy chủ đang lỗi, thử lại sau';
export const OFFLINE_MSG = 'Cần kết nối mạng';
export const SESSION_LOST_MSG = 'Phiên đăng nhập hết hạn, đăng nhập lại';
export const NOT_ADMIN_MSG = 'Tài khoản này không phải quản trị';

export function adminErrorMessage(code: AdminErrorCode): string {
  switch (code) {
    case 'request_decided':
      return 'Yêu cầu này đã được xử lý';
    case 'project_limit_reached':
      return `Người gửi đã sở hữu ${MAX_OWNED_PROJECTS} tổ chức, chưa duyệt được`;
    case 'not_found':
      return 'Không có tài khoản hoặc tổ chức này';
    case 'admin_account':
      return 'Không chỉ định được tài khoản quản trị';
    case 'invalid_body':
      // Màn hình đã kiểm trước khi gửi; tới đây là luật hai bên lệch nhau
      return 'Thông tin chưa hợp lệ, kiểm tra lại';
    case 'self_action':
      return 'Không tự khoá hay tự thu hồi phiên của chính mình được';
  }
}

/** Số tài khoản tối đa `GET /admin/users` trả về (design §7, server/src/repo/users.ts SEARCH_LIMIT) */
export const USER_SEARCH_LIMIT = 50;

/** Câu dưới bảng A3 khi nhận đủ số tối đa: có thể còn tài khoản khác không hiện */
export function userLimitHint(count: number): string | null {
  return count >= USER_SEARCH_LIMIT ? `Chỉ hiện ${USER_SEARCH_LIMIT} tài khoản đầu, gõ thêm để thu hẹp` : null;
}

/** Ngày giờ theo giờ máy, dạng "12/10 09:12" như ui.md A1 (chỉ để đọc, không dùng so thứ tự) */
export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Cột Owner ở A2: tổ chức có từ trước migration 4 có thể chưa có Owner (design §6.1) */
export function ownersLabel(ownerUsernames: readonly string[]): string {
  return ownerUsernames.length === 0 ? 'Chưa có Owner' : ownerUsernames.join(', ');
}
