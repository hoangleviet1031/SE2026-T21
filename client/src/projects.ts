import type { Role } from '@field-survey/shared';
import type { AccountProject } from './db/accountDb';

// Hàm thuần cho bộ chọn dự án (design §4.7, ui.md màn hình 2). Tách khỏi React để unit test được.

/**
 * Dự án đang chọn: dự án đã lưu nếu còn active; không thì dự án active đầu tiên theo thứ tự /me;
 * không còn dự án active nào thì `null`. Dự án "Đã rời" không được chọn, dữ liệu chưa gửi của nó
 * xử lý qua banner (nhóm chốt khi làm TV1-06).
 */
export function resolveCurrentProjectId(projects: AccountProject[], storedId: string | null): string | null {
  const active = projects.filter((p) => p.status === 'active');
  if (storedId !== null && active.some((p) => p.id === storedId)) return storedId;
  return active[0]?.id ?? null;
}

export const ROLE_LABEL: Record<Role, string> = {
  surveyor: 'Điều tra viên',
  supervisor: 'Giám sát viên',
  owner: 'Owner',
};

/** Dòng phụ dưới tên dự án trong bộ chọn, vd. "Giám sát viên · 1 cần xử lý · 4 chưa đồng bộ". */
export function projectSubtitle(p: AccountProject): string {
  const parts = [ROLE_LABEL[p.role]];
  if (p.needsAttention > 0) parts.push(`${p.needsAttention} cần xử lý`);
  if (p.unsynced > 0) parts.push(`${p.unsynced} chưa đồng bộ`);
  return parts.join(' · ');
}

/** Vai trò được thấy nút Sửa form, Xuất, Thành viên (ui.md màn hình 2). */
// TODO(TV2-16): owner cũng được (ADR 0003)
export function canManageProject(role: Role): boolean {
  return role === 'supervisor';
}
