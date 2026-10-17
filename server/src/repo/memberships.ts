import { canAssignRole, type AddMemberRequest, type Member, type Role } from '@field-survey/shared';
import type { Ctx } from '../auth';
import { tx, type Db } from '../db';
import { findUserByUsername } from './users';

// getMemberRole là hàm duy nhất ở lớp repo không nhận `ctx`: nó chính là thứ tạo ra `ctx` (xem auth.ts).
// Các hàm còn lại phục vụ P/members (TV1-08): kiểm quyền và ghi trong cùng một transaction, để hai
// người cùng rút/hạ Owner một lúc không làm tổ chức mất Owner cuối cùng (ADR 0003 §2).

/** Vai trò của người dùng trong dự án, hoặc undefined nếu không là thành viên hoặc dự án đã lưu trữ. */
export function getMemberRole(db: Db, userId: string, projectId: string): Role | undefined {
  const row = db
    .prepare(
      `SELECT m.role FROM memberships m JOIN projects p ON p.id = m.project_id
       WHERE m.project_id = ? AND m.user_id = ? AND p.archived = 0`,
    )
    .get(projectId, userId) as { role: string } | undefined;
  if (!row) return undefined;
  return toRole(row.role);
}

/** Đổi cột `role` đọc từ CSDL sang `Role`. CHECK trong schema đã đảm bảo; kiểm lại để không ép kiểu mù. */
export function toRole(role: string): Role {
  if (role !== 'surveyor' && role !== 'supervisor' && role !== 'owner') {
    throw new Error(`vai trò không hợp lệ trong CSDL: ${role}`);
  }
  return role;
}

interface MemberRow {
  user_id: string;
  username: string | null;
  name: string;
  role: string;
  added_at: string;
}

function toMember(row: MemberRow): Member {
  // Migration 4 đặt username cho mọi tài khoản cũ, nhưng cột vẫn cho NULL nên lùi về id cho chắc.
  return {
    userId: row.user_id,
    username: row.username ?? row.user_id,
    name: row.name,
    role: toRole(row.role),
    addedAt: row.added_at,
  };
}

const MEMBER_SELECT = `SELECT m.user_id, u.username, u.name, m.role, m.added_at
  FROM memberships m JOIN users u ON u.id = m.user_id`;

/** Thành viên của dự án: Owner trước rồi tới supervisor, surveyor; cùng vai trò thì theo tên đăng nhập. */
export function listMembers(ctx: Ctx, db: Db): Member[] {
  const rows = db
    .prepare(
      `${MEMBER_SELECT} WHERE m.project_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END, u.username`,
    )
    .all(ctx.projectId) as unknown as MemberRow[];
  return rows.map(toMember);
}

function getMember(ctx: Ctx, db: Db, userId: string): Member | undefined {
  const row = db.prepare(`${MEMBER_SELECT} WHERE m.project_id = ? AND m.user_id = ?`).get(ctx.projectId, userId) as
    | MemberRow
    | undefined;
  return row ? toMember(row) : undefined;
}

function countOwners(ctx: Ctx, db: Db): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM memberships WHERE project_id = ? AND role = 'owner'`)
    .get(ctx.projectId) as { n: number };
  return row.n;
}

export type AddMemberResult =
  | { ok: true; member: Member }
  | { ok: false; error: 'forbidden' | 'not_found' | 'admin_account' | 'already_member' };

/**
 * Thêm người vào dự án bằng tên đăng nhập. Kiểm quyền với vai trò trước khi tra tên, để supervisor
 * gửi vai trò sai luôn nhận `403` dù tên có hay không. Admin không bao giờ là thành viên (ADR 0003 §5).
 */
export function addMember(ctx: Ctx, db: Db, input: AddMemberRequest, now: string): AddMemberResult {
  if (!canAssignRole(ctx.role, input.role)) return { ok: false, error: 'forbidden' };
  return tx(db, (): AddMemberResult => {
    const user = findUserByUsername(db, input.username);
    if (!user) return { ok: false, error: 'not_found' };
    if (user.is_admin === 1) return { ok: false, error: 'admin_account' };
    if (getMember(ctx, db, user.id)) return { ok: false, error: 'already_member' };
    db.prepare(
      `INSERT INTO memberships (project_id, user_id, role, added_at, added_by) VALUES (?, ?, ?, ?, ?)`,
    ).run(ctx.projectId, user.id, input.role, now, ctx.userId);
    return {
      ok: true,
      member: { userId: user.id, username: user.username ?? user.id, name: user.name, role: input.role, addedAt: now },
    };
  });
}

export type ChangeMemberError = 'not_found' | 'forbidden' | 'last_owner';

/**
 * Kiểm chung cho đổi vai trò và rút: người đó phải thuộc dự án này (dự án khác cũng `404`, không lộ
 * thông tin), người làm phải đụng được cả vai trò hiện tại lẫn vai trò mới, và không làm mất Owner
 * cuối cùng. `newRole` undefined nghĩa là rút khỏi dự án.
 */
function checkChange(ctx: Ctx, db: Db, target: Member, newRole: Role | undefined): ChangeMemberError | undefined {
  if (!canAssignRole(ctx.role, target.role)) return 'forbidden';
  if (newRole !== undefined && !canAssignRole(ctx.role, newRole)) return 'forbidden';
  if (target.role === 'owner' && newRole !== 'owner' && countOwners(ctx, db) <= 1) return 'last_owner';
  return undefined;
}

export type ChangeRoleResult = { ok: true; member: Member } | { ok: false; error: ChangeMemberError };

/** Đổi vai trò. Giữ `added_at`; `added_by` ghi người đổi lần cuối (ADR 0003 §2, ghi vết). */
export function changeMemberRole(ctx: Ctx, db: Db, userId: string, role: Role): ChangeRoleResult {
  return tx(db, (): ChangeRoleResult => {
    const target = getMember(ctx, db, userId);
    if (!target) return { ok: false, error: 'not_found' };
    const error = checkChange(ctx, db, target, role);
    if (error) return { ok: false, error };
    if (target.role === role) return { ok: true, member: target };
    db.prepare(`UPDATE memberships SET role = ?, added_by = ? WHERE project_id = ? AND user_id = ?`).run(
      role,
      ctx.userId,
      ctx.projectId,
      userId,
    );
    return { ok: true, member: { ...target, role } };
  });
}

export type RemoveMemberResult = { ok: true } | { ok: false; error: ChangeMemberError };

/** Rút khỏi dự án. Phiếu người đó đã tạo vẫn ở lại dự án. */
export function removeMember(ctx: Ctx, db: Db, userId: string): RemoveMemberResult {
  return tx(db, (): RemoveMemberResult => {
    const target = getMember(ctx, db, userId);
    if (!target) return { ok: false, error: 'not_found' };
    const error = checkChange(ctx, db, target, undefined);
    if (error) return { ok: false, error };
    db.prepare(`DELETE FROM memberships WHERE project_id = ? AND user_id = ?`).run(ctx.projectId, userId);
    return { ok: true };
  });
}
