import type { IconName } from './components/Icon';
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_REQUEST_NOTE_MAX_LENGTH,
  type CreateProjectRequestBody,
  type ProjectRequest,
} from '@field-survey/shared';

// Màn hình Tổ chức (design §4.7, ui.md màn hình 9): kiểm form "Mở tổ chức mới" và chữ hiển thị.
// Luật lấy từ shared/projectRequestValidation.ts (cắt khoảng trắng, tên 1–100, ghi chú ≤ 500) để
// client báo lỗi giống server.

export const ORG_OFFLINE_MSG = 'Cần kết nối mạng để dùng chức năng này';

/** Mã lỗi người dùng gặp được ở `/project-requests` (design §7.1). */
export type OrgErrorCode = 'project_limit_reached' | 'invalid_body' | 'not_found';

export const ORG_ERROR_CODES: readonly OrgErrorCode[] = ['project_limit_reached', 'invalid_body', 'not_found'];

export const ORG_ERROR_TEXT: Record<OrgErrorCode, string> = {
  project_limit_reached: 'Bạn đã có yêu cầu đang chờ hoặc đã sở hữu 3 tổ chức',
  // Client đã kiểm cùng luật; tới đây là luật hai bên lệch nhau
  invalid_body: 'Thông tin chưa hợp lệ, kiểm tra lại các ô',
  // Huỷ một yêu cầu admin vừa xử lý xong
  not_found: 'Yêu cầu này đã được xử lý',
};

/** Thân gửi đi, hoặc câu lỗi đầu tiên. Ghi chú chỉ có khoảng trắng coi như không có, như server. */
export function orgRequestBody(name: string, note: string): { body: CreateProjectRequestBody } | { error: string } {
  const n = name.trim();
  if (n === '') return { error: 'Nhập tên tổ chức' };
  if (n.length > PROJECT_NAME_MAX_LENGTH) return { error: `Tên tổ chức tối đa ${PROJECT_NAME_MAX_LENGTH} ký tự` };
  const t = note.trim();
  if (t.length > PROJECT_REQUEST_NOTE_MAX_LENGTH) {
    return { error: `Ghi chú tối đa ${PROJECT_REQUEST_NOTE_MAX_LENGTH} ký tự` };
  }
  return { body: t ? { name: n, note: t } : { name: n } };
}

/** Trạng thái một yêu cầu của mình (ui.md màn hình 9). */
export function requestStatusText(r: ProjectRequest): string {
  switch (r.status) {
    case 'pending':
      return 'Đang chờ duyệt';
    case 'approved':
      return 'Đã duyệt';
    case 'rejected':
      return r.reason ? `Bị từ chối: ${r.reason}` : 'Bị từ chối';
    case 'cancelled':
      return 'Đã huỷ';
  }
}

/**
 * Kiểu nhãn trạng thái yêu cầu (ui.md màn hình 9, TV1-12 b2): dùng chung màu và biểu tượng với nhãn trạng
 * thái phiếu để nhìn ra ngay chờ / ổn / lỗi. Chữ luôn đi kèm, màu chỉ là thêm.
 */
export function requestStatusKind(status: ProjectRequest['status']): { className: string; icon: IconName } {
  switch (status) {
    case 'pending':
      return { className: 'st-pending', icon: 'pending' };
    case 'approved':
      return { className: 'st-synced', icon: 'synced' };
    case 'rejected':
      return { className: 'st-error', icon: 'alert' };
    case 'cancelled':
      return { className: 'st-cancel', icon: 'cancel' };
  }
}

/** Mới nhất trước: yêu cầu vừa gửi nằm trên cùng. */
export function sortRequests(list: ProjectRequest[]): ProjectRequest[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
