import { canAssignRole, type Member, type Role } from '@field-survey/shared';
import { USERNAME_SHARE_LABEL } from './accountDisplay';
import { ROLE_LABEL } from './projects';
import type { MemberResult } from './sync/api';

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

/** Chặn dán nhầm cả văn bản, không phải giới hạn của server (ui.md màn hình 6). */
export const MAX_ADD_NAMES = 50;

export function tooManyNamesText(count: number): string {
  return `Tối đa ${MAX_ADD_NAMES} tên mỗi lần, danh sách đang có ${count} tên`;
}

// Không tách theo khoảng trắng: dán "Nguyen Van An" mà tách ba tên thì có thể thêm nhầm tài khoản có thật
// tên "van", và người đó xem được dữ liệu tổ chức.
const LIST_SEPARATOR = /[\r\n\t,;]+/;
const SHARE_LABEL = USERNAME_SHARE_LABEL.toLowerCase();

/** Chuẩn hoá giống server (`parseAddMemberRequest`) để so trùng đúng; bóc câu của tin chia sẻ (design §4.7). */
function normalizeListItem(item: string): string {
  const lower = item.trim().toLowerCase();
  return lower.startsWith(SHARE_LABEL) ? lower.slice(SHARE_LABEL.length).trim() : lower;
}

/** Tách chữ trong ô thêm thành các tên khác nhau. Không kiểm mẫu tên: tài khoản cũ có thể ngoài mẫu, server quyết. */
export function parseUsernameList(text: string): { names: string[]; duplicates: number } {
  const items = text.split(LIST_SEPARATOR).map(normalizeListItem).filter(Boolean);
  const names = [...new Set(items)];
  return { names, duplicates: items.length - names.length };
}

/** Kết quả một tên trong loạt thêm. `unsent`: không chắc đã ghi (timeout), thử lại thì server tự báo đã là thành viên. */
export type AddLine =
  | { username: string; kind: 'added' }
  | { username: string; kind: 'failed'; error: MemberErrorCode }
  | { username: string; kind: 'unsent' };

/**
 * Thêm lần lượt từng tên. Lỗi riêng của một tên thì đi tiếp; lỗi chung (mất mạng, máy chủ, hết quyền) thì
 * dừng vì tên sau cũng sẽ hỏng và design §8 không cho tự thử lại. `failureText` ném tiếp lỗi lập trình.
 */
export async function addInOrder(
  names: readonly string[],
  add: (username: string) => Promise<MemberResult<unknown>>,
  failureText: (err: unknown) => string,
): Promise<{ lines: AddLine[]; stopReason: string | null }> {
  const lines: AddLine[] = [];
  let stopReason: string | null = null;
  for (const username of names) {
    if (stopReason !== null) {
      lines.push({ username, kind: 'unsent' });
      continue;
    }
    try {
      const result = await add(username);
      if (result.ok) {
        lines.push({ username, kind: 'added' });
      } else if (result.error === 'forbidden') {
        // Cả danh sách cùng một vai trò nên tên sau cũng bị từ chối
        stopReason = MEMBER_ERROR_TEXT.forbidden;
        lines.push({ username, kind: 'unsent' });
      } else {
        lines.push({ username, kind: 'failed', error: result.error });
      }
    } catch (err) {
      stopReason = failureText(err);
      lines.push({ username, kind: 'unsent' });
    }
  }
  return { lines, stopReason };
}

/** Tên còn để lại trong ô: chỉ tên thử lại còn có ích, "đã là thành viên" hay "tài khoản quản trị" thì lần sau vẫn vậy. */
export function namesToKeep(lines: readonly AddLine[]): string[] {
  return lines
    .filter((l) => l.kind === 'unsent' || (l.kind === 'failed' && l.error !== 'already_member' && l.error !== 'admin_account'))
    .map((l) => l.username);
}

export function addLineText(line: AddLine): string {
  if (line.kind === 'added') return 'Đã thêm';
  if (line.kind === 'unsent') return 'Chưa gửi';
  return MEMBER_ERROR_TEXT[line.error];
}

export function addSummaryText(lines: readonly AddLine[], duplicates: number): string {
  const added = lines.filter((l) => l.kind === 'added').length;
  const dup = duplicates > 0 ? ` Bỏ ${duplicates} tên trùng.` : '';
  return `Đã thêm ${added}/${lines.length} tên.${dup}`;
}

/** Vai trò Owner có toàn quyền với tổ chức, mà ô Vai trò giữ giá trị từ lần thêm trước nên phải hỏi lại. */
export function addManyConfirmText(count: number, role: Role): string | null {
  return role === 'owner' && count > 1 ? `Thêm ${count} người với vai trò Owner?` : null;
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
