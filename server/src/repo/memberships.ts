import type { Role } from '@field-survey/shared';
import type { Db } from '../db';

// Hàm duy nhất ở lớp repo không nhận `ctx`: nó chính là thứ tạo ra `ctx` (xem auth.ts).

/** Vai trò của người dùng trong dự án, hoặc undefined nếu không là thành viên hoặc dự án đã lưu trữ. */
export function getMemberRole(db: Db, userId: string, projectId: string): Role | undefined {
  const row = db
    .prepare(
      `SELECT m.role FROM memberships m JOIN projects p ON p.id = m.project_id
       WHERE m.project_id = ? AND m.user_id = ? AND p.archived = 0`,
    )
    .get(projectId, userId) as { role: string } | undefined;
  if (!row) return undefined;
  // CHECK trong schema đã đảm bảo; kiểm lại để không ép kiểu mù.
  if (row.role !== 'surveyor' && row.role !== 'supervisor') {
    throw new Error(`vai trò không hợp lệ trong CSDL: ${row.role}`);
  }
  return row.role;
}
