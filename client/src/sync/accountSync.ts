import type { ProjectSummary } from '@field-survey/shared';
import type { AccountProject } from '../db/accountDb';

// Hàm thuần cho bước đầu vòng đồng bộ: gộp kết quả GET /api/me vào danh sách dự án đã lưu và
// chọn thứ tự đồng bộ. Xem design §5.3 (Nhiều dự án), ADR 0002 §5–6.

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
export function projectsToSync(projects: AccountProject[], currentProjectId: string): string[] {
  const active = projects.filter((p) => p.status === 'active').map((p) => p.id);
  return active.includes(currentProjectId)
    ? [currentProjectId, ...active.filter((id) => id !== currentProjectId)]
    : active;
}
