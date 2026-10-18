import { randomUUID } from 'node:crypto';
import {
  MAX_OWNED_PROJECTS,
  MAX_PENDING_REQUESTS,
  type AdminProjectRequest,
  type CreateProjectRequestBody,
  type DecideProjectRequest,
  type ProjectRequest,
  type ProjectRequestStatus,
} from '@field-survey/shared';
import { tx, type Db } from '../db';
import { countOwnedProjects, insertProjectWithOwner } from './projects';

// Yêu cầu mở tổ chức (ADR 0003 §3 mục 1). Không nhận `ctx`: bảng này nằm ngoài mọi dự án và không
// chạm form, phiếu, ảnh (ADR 0003 §4). Kiểm giới hạn và ghi trong cùng transaction, để hai request
// gửi cùng lúc không vượt giới hạn.

interface RequestRow {
  id: string;
  name: string;
  note: string | null;
  status: string;
  reason: string | null;
  project_id: string | null;
  created_at: string;
}

interface AdminRequestRow {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
  user_id: string;
  username: string;
  user_name: string;
}

/** CHECK trong schema đã đảm bảo; kiểm lại để không ép kiểu mù (như `toRole`). */
function toStatus(status: string): ProjectRequestStatus {
  if (status !== 'pending' && status !== 'approved' && status !== 'rejected' && status !== 'cancelled') {
    throw new Error(`trạng thái yêu cầu không hợp lệ trong CSDL: ${status}`);
  }
  return status;
}

function toProjectRequest(row: RequestRow): ProjectRequest {
  const req: ProjectRequest = { id: row.id, name: row.name, status: toStatus(row.status), createdAt: row.created_at };
  if (row.note !== null) req.note = row.note;
  if (row.reason !== null) req.reason = row.reason;
  if (row.project_id !== null) req.projectId = row.project_id;
  return req;
}

const REQUEST_SELECT = `SELECT id, name, note, status, reason, project_id, created_at FROM project_requests`;

function countPending(db: Db, userId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM project_requests WHERE user_id = ? AND status = 'pending'`)
    .get(userId) as { n: number };
  return row.n;
}

export type CreateRequestResult = { ok: true; request: ProjectRequest } | { ok: false; error: 'project_limit_reached' };

export function createProjectRequest(
  db: Db,
  userId: string,
  input: CreateProjectRequestBody,
  now: string,
): CreateRequestResult {
  return tx(db, (): CreateRequestResult => {
    if (countPending(db, userId) >= MAX_PENDING_REQUESTS || countOwnedProjects(db, userId) >= MAX_OWNED_PROJECTS) {
      return { ok: false, error: 'project_limit_reached' };
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO project_requests (id, user_id, name, note, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
    ).run(id, userId, input.name, input.note ?? null, now);
    const request: ProjectRequest = { id, name: input.name, status: 'pending', createdAt: now };
    if (input.note !== undefined) request.note = input.note;
    return { ok: true, request };
  });
}

/** Yêu cầu của chính mình, mới nhất trước. `rowid` phân thứ tự khi hai yêu cầu cùng thời điểm. */
export function listMyProjectRequests(db: Db, userId: string): ProjectRequest[] {
  const rows = db
    .prepare(`${REQUEST_SELECT} WHERE user_id = ? ORDER BY created_at DESC, rowid DESC`)
    .all(userId) as unknown as RequestRow[];
  return rows.map(toProjectRequest);
}

/** Huỷ yêu cầu đang chờ của mình. Trả false nếu không có, của người khác hoặc đã xử lý (đều `404`). */
export function cancelProjectRequest(db: Db, userId: string, requestId: string, now: string): boolean {
  return tx(db, () => {
    const result = db
      .prepare(
        `UPDATE project_requests SET status = 'cancelled', decided_at = ?, decided_by = ?
         WHERE id = ? AND user_id = ? AND status = 'pending'`,
      )
      .run(now, userId, requestId, userId);
    return result.changes > 0;
  });
}

/** Danh sách cho màn hình A1, cũ nhất trước để admin duyệt theo thứ tự gửi. */
export function listProjectRequestsForAdmin(db: Db, status: ProjectRequestStatus): AdminProjectRequest[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.name, r.note, r.created_at, u.id AS user_id, COALESCE(u.username, u.id) AS username,
              u.name AS user_name
       FROM project_requests r JOIN users u ON u.id = r.user_id
       WHERE r.status = ?
       ORDER BY r.created_at, r.rowid`,
    )
    .all(status) as unknown as AdminRequestRow[];
  return rows.map((r) => {
    const req: AdminProjectRequest = {
      id: r.id,
      name: r.name,
      user: { id: r.user_id, username: r.username, name: r.user_name },
      createdAt: r.created_at,
    };
    if (r.note !== null) req.note = r.note;
    return req;
  });
}

export type DecideResult =
  | { ok: true; projectId?: string }
  | { ok: false; error: 'not_found' | 'request_decided' | 'project_limit_reached' };

/**
 * Duyệt hoặc từ chối. Duyệt: tạo tổ chức, thêm người gửi làm Owner và đánh dấu yêu cầu trong MỘT
 * transaction, nên không có tổ chức nào thiếu Owner hay yêu cầu nào duyệt hai lần. Admin không thành
 * thành viên (ADR 0003 Y8). Giới hạn 3 tổ chức kiểm lại lúc duyệt vì người gửi có thể đã được thêm làm
 * Owner ở nơi khác trong lúc chờ; vượt thì yêu cầu vẫn chờ.
 */
export function decideProjectRequest(
  db: Db,
  requestId: string,
  decision: DecideProjectRequest,
  adminId: string,
  now: string,
): DecideResult {
  return tx(db, (): DecideResult => {
    const row = db.prepare(`SELECT user_id, name, status FROM project_requests WHERE id = ?`).get(requestId) as
      | { user_id: string; name: string; status: string }
      | undefined;
    if (!row) return { ok: false, error: 'not_found' };
    if (row.status !== 'pending') return { ok: false, error: 'request_decided' };

    if (decision.decision === 'reject') {
      db.prepare(
        `UPDATE project_requests SET status = 'rejected', decided_at = ?, decided_by = ?, reason = ? WHERE id = ?`,
      ).run(now, adminId, decision.reason, requestId);
      return { ok: true };
    }

    if (countOwnedProjects(db, row.user_id) >= MAX_OWNED_PROJECTS) return { ok: false, error: 'project_limit_reached' };
    const projectId = insertProjectWithOwner(db, { name: row.name, ownerId: row.user_id, addedBy: adminId, now });
    db.prepare(
      `UPDATE project_requests SET status = 'approved', decided_at = ?, decided_by = ?, project_id = ? WHERE id = ?`,
    ).run(now, adminId, projectId, requestId);
    return { ok: true, projectId };
  });
}
