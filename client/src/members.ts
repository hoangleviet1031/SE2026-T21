import { canAssignRole, type Member, type Role } from '@field-survey/shared';
import { ROLE_LABEL } from './projects';

// Hàm thuần cho màn hình Thành viên (ui.md màn hình 6, design §4.7). Tách khỏi React để unit test được.

/** Mã lỗi `P/members`, `P/settings` mà người dùng sửa được hoặc cần được báo (design §7.1). */
export type MemberErrorCode = 'invalid_body' | 'forbidden' | 'not_found' | 'already_member' | 'admin_account' | 'last_owner';

export const MEMBER_ERROR_CODES: readonly MemberErrorCode[] = [
  'invalid_body',
  'forbidden',
  'not_found',
  'already_member',
  'admin_account',
  'last_owner',
];

export const MEMBER_ERROR_TEXT: Record<MemberErrorCode, string> = {
  invalid_body: 'Thông tin chưa hợp lệ',
  forbidden: 'Bạn không có quyền làm việc này',
  not_found: 'Không có tên đăng nhập này',
  already_member: 'Người này đã là thành viên',
  admin_account: 'Không thêm được tài khoản quản trị',
  last_owner: 'Tổ chức phải còn ít nhất một Owner',
};

const ROLES: readonly Role[] = ['surveyor', 'supervisor', 'owner'];

/** Vai trò mình được chọn khi thêm hoặc đổi vai trò người khác: supervisor chỉ có Điều tra viên. */
export function assignableRoles(myRole: Role): Role[] {
  return ROLES.filter((r) => canAssignRole(myRole, r));
}

export interface MemberActions {
  /** Vai trò đổi sang được; rỗng thì không hiện "Đổi vai trò". */
  changeTo: Role[];
  canRemove: boolean;
}

/**
 * Thao tác mình được làm trên một dòng, giống luật server (`canAssignRole`). Supervisor không đụng
 * tới dòng supervisor, kể cả dòng của chính mình, nên không tự rút được (Dương chốt khi làm TV1-08).
 */
export function memberActions(myRole: Role, member: Member): MemberActions {
  if (!canAssignRole(myRole, member.role)) return { changeTo: [], canRemove: false };
  return { changeTo: assignableRoles(myRole).filter((r) => r !== member.role), canRemove: true };
}

/**
 * Câu hỏi xác nhận trước khi đổi vai trò hoặc rút (`newRole` null). Đổi vai trò người khác không hỏi;
 * tự hạ hay tự rút mình thì nói rõ là mất quyền ngay.
 */
export function confirmText(myUserId: string, member: Member, newRole: Role | null): string | null {
  const self = member.userId === myUserId;
  if (newRole === null) {
    return self
      ? 'Bạn sẽ rời tổ chức này ngay và không xem được dữ liệu của tổ chức nữa. Tiếp tục?'
      : `Rút ${member.name} (${member.username}) khỏi tổ chức?`;
  }
  if (!self || newRole === member.role) return null;
  return `Bạn sẽ mất quyền ${ROLE_LABEL[member.role]} ngay, chỉ còn quyền ${ROLE_LABEL[newRole]}. Tiếp tục?`;
}
