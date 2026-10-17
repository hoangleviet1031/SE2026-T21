import type { AdminProject, ProjectSettings, ProjectSummary, UpdateSettingsRequest } from '@field-survey/shared';
import type { Ctx } from '../auth';
import { tx, type Db } from '../db';
import { toRole } from './memberships';

// Truy vấn không theo dự án: danh sách dự án của một người (/me) và quản trị dự án (/admin).
// Không nhận `ctx` vì không đọc dữ liệu bên trong dự án (form, phiếu); quyền đã kiểm ở
// requireAuth/requireAdmin. Xem ADR 0002 §2–3. Riêng updateProjectSettings là route theo dự án nên nhận `ctx`.

interface ProjectRow {
  id: string;
  name: string;
  archived: number;
  created_at: string;
}

interface MemberProjectRow {
  id: string;
  name: string;
  role: string;
}

function toAdminProject(row: ProjectRow): AdminProject {
  return { id: row.id, name: row.name, archived: row.archived === 1, createdAt: row.created_at };
}

/** Dự án người dùng đang là thành viên và chưa lưu trữ (design §7, `GET /me`). */
export function listMyProjects(db: Db, userId: string): ProjectSummary[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, m.role FROM memberships m JOIN projects p ON p.id = m.project_id
       WHERE m.user_id = ? AND p.archived = 0
       ORDER BY p.id`,
    )
    .all(userId) as unknown as MemberProjectRow[];
  return rows.map((r) => ({ id: r.id, name: r.name, role: toRole(r.role) }));
}

export function listProjects(db: Db): AdminProject[] {
  const rows = db
    .prepare(`SELECT id, name, archived, created_at FROM projects ORDER BY id`)
    .all() as unknown as ProjectRow[];
  return rows.map(toAdminProject);
}

export function getProject(db: Db, projectId: string): AdminProject | undefined {
  const row = db.prepare(`SELECT id, name, archived, created_at FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;
  return row ? toAdminProject(row) : undefined;
}

/** Tạo dự án; trả undefined nếu id đã có. Admin tạo dự án không tự thành thành viên (ADR 0002 §2). */
export function createProject(db: Db, id: string, name: string, now: string): AdminProject | undefined {
  return tx(db, () => {
    const result = db
      .prepare(`INSERT OR IGNORE INTO projects (id, name, archived, created_at) VALUES (?, ?, 0, ?)`)
      .run(id, name, now);
    if (result.changes === 0) return undefined;
    return { id, name, archived: false, createdAt: now };
  });
}

/** Đổi tên và/hoặc lưu trữ; trả undefined nếu dự án không có. */
export function updateProject(
  db: Db,
  projectId: string,
  patch: { name?: string; archived?: boolean },
): AdminProject | undefined {
  return tx(db, () => {
    const current = getProject(db, projectId);
    if (!current) return undefined;
    const name = patch.name ?? current.name;
    const archived = patch.archived ?? current.archived;
    db.prepare(`UPDATE projects SET name = ?, archived = ? WHERE id = ?`).run(name, archived ? 1 : 0, projectId);
    return { ...current, name, archived };
  });
}

/**
 * Đặt người dùng làm giám sát viên của dự án (thêm mới hoặc nâng từ surveyor).
 * Trả false nếu dự án hoặc người dùng không có. Chạy được cả với dự án đã lưu trữ.
 */
export function assignSupervisor(db: Db, projectId: string, userId: string, now: string): boolean {
  return tx(db, () => {
    const projectExists = db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(projectId) !== undefined;
    const userExists = db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(userId) !== undefined;
    if (!projectExists || !userExists) return false;
    db.prepare(
      `INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, 'supervisor', ?)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'supervisor'`,
    ).run(projectId, userId, now);
    return true;
  });
}

/** Tên và cờ công khai của tổ chức (`GET P/settings`). Dự án chắc chắn có vì requireMember vừa kiểm. */
export function getProjectSettings(ctx: Ctx, db: Db): ProjectSettings {
  const row = db.prepare(`SELECT name, public FROM projects WHERE id = ?`).get(ctx.projectId) as
    | { name: string; public: number }
    | undefined;
  if (!row) throw new Error(`không thấy dự án ${ctx.projectId} dù đã qua requireMember`);
  return { name: row.name, public: row.public === 1 };
}

/** Owner đổi tên và/hoặc bật tắt công khai tổ chức của mình (`PATCH P/settings`, ADR 0003 §3 mục 4). */
export function updateProjectSettings(ctx: Ctx, db: Db, patch: UpdateSettingsRequest): ProjectSettings {
  return tx(db, () => {
    const current = getProjectSettings(ctx, db);
    const settings: ProjectSettings = { name: patch.name ?? current.name, public: patch.public ?? current.public };
    db.prepare(`UPDATE projects SET name = ?, public = ? WHERE id = ?`).run(
      settings.name,
      settings.public ? 1 : 0,
      ctx.projectId,
    );
    return settings;
  });
}
