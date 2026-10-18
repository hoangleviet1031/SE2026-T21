import type { ProjectSummary, Role } from '@field-survey/shared';
import type { AccountProject } from '../db/accountDb';

// Hàm thuần của vòng đồng bộ nhiều dự án: gộp kết quả GET /api/me vào danh sách dự án đã lưu,
// chọn thứ tự đồng bộ, và quyết định cursor theo phạm vi. Xem design §5.3, §5.5; ADR 0002 §5–6.

/**
 * Dự án trong /me: active, cập nhật tên và vai trò, giữ số đếm đã lưu.
 * Dự án đã lưu mà không còn trong /me: removed, giữ nguyên để không mất dữ liệu chưa gửi;
 * xoá CSDL hay giữ lại là việc của TV2-07 (ADR 0002 §6).
 */
export function mergeMeIntoProjects(saved: AccountProject[], me: ProjectSummary[]): AccountProject[] {
  const savedById = new Map(saved.map((p) => [p.id, p]));
  const result: AccountProject[] = me.map((p) => {
    const old = savedById.get(p.id);
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      status: 'active',
      needsAttention: old?.needsAttention ?? 0,
      unsynced: old?.unsynced ?? 0,
    };
  });
  const inMe = new Set(me.map((p) => p.id));
  for (const old of saved) {
    if (!inMe.has(old.id)) result.push({ ...old, status: 'removed' });
  }
  return result;
}

/** Id các dự án cần đồng bộ: chỉ dự án active, dự án đang chọn trước (design §5.3). */
export function projectsToSync(projects: AccountProject[], currentProjectId: string | null): string[] {
  const active = projects.filter((p) => p.status === 'active').map((p) => p.id);
  return currentProjectId !== null && active.includes(currentProjectId)
    ? [currentProjectId, ...active.filter((id) => id !== currentProjectId)]
    : active;
}

export type PullScope = 'own' | 'all';

/**
 * Trạng thái pull lưu ở `meta.pull` của CSDL dự án. `scope` là phạm vi **rộng nhất** mà dữ liệu
 * trên máy đang có, không phải phạm vi lần pull cuối: bị hạ vai trò mà còn dữ liệu chưa gửi thì
 * vẫn giữ "all" cho tới khi xoá được phiếu ngoài phạm vi (needsRescope).
 */
export interface PullState {
  cursor: number;
  scope: PullScope | null;
}

/**
 * Sau khi nhận một trang pull: có cần pull lại từ cursor 0 không, và phạm vi lưu lại là gì.
 * Phạm vi rộng ra thì phải pull lại từ đầu để lấy phiếu người khác có seq nhỏ hơn cursor
 * (ADR 0001 quy tắc 10). Phạm vi hẹp lại thì không cần pull lại.
 */
export function pullStateAfterPage(
  stored: PullState,
  pageScope: PullScope,
): { restart: boolean; scope: PullScope } {
  if (stored.scope === 'own' && pageScope === 'all') return { restart: stored.cursor > 0, scope: 'all' };
  if (stored.scope === 'all') return { restart: false, scope: 'all' };
  return { restart: false, scope: pageScope };
}

/** Máy đang giữ phiếu phạm vi "all" nhưng vai trò giờ chỉ được thấy phiếu của mình (ADR 0002 §6). */
export function needsRescope(storedScope: PullScope | null, role: Role): boolean {
  return storedScope === 'all' && role === 'surveyor';
}

/**
 * Sau khi đăng nhập (hoặc nhập mã), trước khi lưu token: làm gì với dữ liệu đang có trên máy
 * (design §4.7, ADR 0003 §1, §8). `stored` là người dùng đang lưu trong `field-survey-account`.
 * - `admin`: tài khoản quản trị không dùng app khảo sát; không lưu token, không đụng dữ liệu.
 * - `same`: cùng người, chỉ thay token.
 * - `switch`: khác người và máy không còn gì chưa gửi: xoá dữ liệu người cũ rồi vào.
 * - `blocked`: khác người mà máy còn dữ liệu chưa gửi: từ chối, vì phiếu phải lên server dưới tên
 *   người tạo (bất biến 6) và không được xoá khi người dùng chưa xác nhận (bất biến 1).
 */
export type SignInDecision = 'admin' | 'same' | 'switch' | 'blocked';

export function decideSignIn(
  stored: { id: string } | null,
  next: { id: string; isAdmin: boolean },
  hasUnsentData: boolean,
): SignInDecision {
  if (next.isAdmin) return 'admin';
  if (stored?.id === next.id) return 'same';
  return hasUnsentData ? 'blocked' : 'switch';
}
