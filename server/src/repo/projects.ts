import { randomInt } from 'node:crypto';
import type {
  AdminProject,
  DirectoryEntry,
  ProjectSettings,
  ProjectSummary,
  UpdateSettingsRequest,
} from '@field-survey/shared';
import type { Ctx } from '../auth';
import { tx, type Db } from '../db';
import { toRole } from './memberships';
import { findUserByUsername } from './users';

// Truy vấn không theo dự án: danh sách dự án của một người (/me), danh bạ công khai (/directory) và
// quản trị dự án (/admin). Không nhận `ctx` vì không đọc dữ liệu bên trong dự án (form, phiếu); quyền
// đã kiểm ở requireAuth/requireAdmin. Xem ADR 0002 §2–3, ADR 0003 §4. Riêng hai hàm settings là
// route theo dự án nên nhận `ctx`.

interface ProjectRow {
  id: string;
  name: string;
  archived: number;
  created_at: string;
  member_count: number;
}

interface MemberProjectRow {
  id: string;
  name: string;
  role: string;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `p-` + 8 ký tự a-z0-9 (ADR 0003 §3 mục 1). Khớp mẫu id dự án nên dùng được trong URL và tên IndexedDB. */
function newProjectId(): string {
  let s = 'p-';
  for (let i = 0; i < 8; i++) s += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return s;
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

/** Tổ chức công khai, chưa lưu trữ, mình chưa thuộc. Chỉ id và tên (ADR 0003 §3 mục 4). */
export function listDirectory(db: Db, userId: string): DirectoryEntry[] {
  return db
    .prepare(
      `SELECT p.id, p.name FROM projects p
       WHERE p.public = 1 AND p.archived = 0
         AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.project_id = p.id AND m.user_id = ?)
       ORDER BY p.name, p.id`,
    )
    .all(userId) as unknown as DirectoryEntry[];
}

/** Số tổ chức chưa lưu trữ người này đang là Owner, cho giới hạn mở tổ chức (ADR 0003 §3 mục 1). */
export function countOwnedProjects(db: Db, userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM memberships m JOIN projects p ON p.id = m.project_id
       WHERE m.user_id = ? AND m.role = 'owner' AND p.archived = 0`,
    )
    .get(userId) as { n: number };
  return row.n;
}

/** Tên đăng nhập các Owner theo dự án, sắp theo tên. Tài khoản cũ chưa có username thì dùng id. */
function ownerUsernamesByProject(db: Db): Map<string, string[]> {
  const rows = db
    .prepare(
      `SELECT m.project_id, COALESCE(u.username, u.id) AS username
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.role = 'owner'
       ORDER BY m.project_id, username`,
    )
    .all() as { project_id: string; username: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.project_id);
    if (list) list.push(r.username);
    else map.set(r.project_id, [r.username]);
  }
  return map;
}

const PROJECT_SELECT = `SELECT p.id, p.name, p.archived, p.created_at,
    (SELECT COUNT(*) FROM memberships m WHERE m.project_id = p.id) AS member_count
  FROM projects p`;

function toAdminProject(row: ProjectRow, owners: string[]): AdminProject {
  return {
    id: row.id,
    name: row.name,
    archived: row.archived === 1,
    createdAt: row.created_at,
    ownerUsernames: owners,
    memberCount: row.member_count,
  };
}

/** Mọi dự án kể cả đã lưu trữ, chỉ thông tin quản trị (ADR 0003 Y8). */
export function listProjects(db: Db): AdminProject[] {
  const rows = db.prepare(`${PROJECT_SELECT} ORDER BY p.id`).all() as unknown as ProjectRow[];
  const owners = ownerUsernamesByProject(db);
  return rows.map((r) => toAdminProject(r, owners.get(r.id) ?? []));
}

function getProject(db: Db, projectId: string): AdminProject | undefined {
  const row = db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(projectId) as ProjectRow | undefined;
  return row ? toAdminProject(row, ownerUsernamesByProject(db).get(projectId) ?? []) : undefined;
}

/** Khoá (lưu trữ) hoặc mở lại; trả undefined nếu dự án không có. Tên do Owner đổi qua P/settings. */
export function setProjectArchived(db: Db, projectId: string, archived: boolean): AdminProject | undefined {
  return tx(db, () => {
    const result = db.prepare(`UPDATE projects SET archived = ? WHERE id = ?`).run(archived ? 1 : 0, projectId);
    if (result.changes === 0) return undefined;
    return getProject(db, projectId);
  });
}

/**
 * Tạo tổ chức mới (không công khai) với `ownerId` là Owner duy nhất, `added_by` là admin duyệt.
 * Người gọi bọc trong transaction cùng với việc cập nhật yêu cầu, để tổ chức không bao giờ thiếu Owner.
 */
export function insertProjectWithOwner(
  db: Db,
  p: { name: string; ownerId: string; addedBy: string; now: string },
): string {
  let id = newProjectId();
  // 36^8 khả năng nên gần như không trùng, nhưng trùng thì khoá chính làm hỏng lần duyệt.
  while (db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(id) !== undefined) id = newProjectId();
  db.prepare(`INSERT INTO projects (id, name, archived, public, created_at) VALUES (?, ?, 0, 0, ?)`).run(
    id,
    p.name,
    p.now,
  );
  db.prepare(
    `INSERT INTO memberships (project_id, user_id, role, added_at, added_by) VALUES (?, ?, 'owner', ?, ?)`,
  ).run(id, p.ownerId, p.now, p.addedBy);
  return id;
}

export type AssignOwnerResult = { ok: true; userId: string } | { ok: false; error: 'not_found' | 'admin_account' };

/**
 * Admin thêm hoặc nâng người đó thành Owner, khi khách hàng mất tài khoản Owner (ADR 0003 §5 mục 2).
 * Giữ `added_at` nếu đã là thành viên; `added_by` ghi admin để biết ai đã cấp quyền. Chạy được cả khi
 * dự án đang lưu trữ. Admin không bao giờ là thành viên (ADR 0003 §8).
 */
export function assignOwner(db: Db, projectId: string, username: string, adminId: string, now: string): AssignOwnerResult {
  return tx(db, (): AssignOwnerResult => {
    if (db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(projectId) === undefined) {
      return { ok: false, error: 'not_found' };
    }
    const user = findUserByUsername(db, username.trim().toLowerCase());
    if (!user) return { ok: false, error: 'not_found' };
    if (user.is_admin === 1) return { ok: false, error: 'admin_account' };
    const current = db
      .prepare(`SELECT role FROM memberships WHERE project_id = ? AND user_id = ?`)
      .get(projectId, user.id) as { role: string } | undefined;
    // Đã là Owner thì không ghi gì, giống đổi sang đúng vai trò đang có ở P/members.
    if (current?.role !== 'owner') {
      db.prepare(
        `INSERT INTO memberships (project_id, user_id, role, added_at, added_by) VALUES (?, ?, 'owner', ?, ?)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'owner', added_by = excluded.added_by`,
      ).run(projectId, user.id, now, adminId);
    }
    return { ok: true, userId: user.id };
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
