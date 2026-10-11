import type { RecordData, RecordHistoryEntry, ServerRecord } from '@field-survey/shared';
import type { Ctx } from '../auth';
import { nextSeq, type Db } from '../db';

// Mọi truy vấn phiếu của dự án đi qua đây. Phạm vi (design §5.5): surveyor chỉ thấy phiếu
// do mình tạo, supervisor thấy tất cả phiếu của dự án.

export type PullScope = 'own' | 'all';

interface RecordRow {
  id: string;
  project_id: string;
  form_id: string;
  form_version: number;
  data: string;
  version: number;
  deleted: number;
  created_by: string;
  updated_at: string;
  updated_by: string;
  seq: number;
}

interface HistoryRow {
  version: number;
  data: string;
  deleted: number;
  updated_at: string;
  updated_by: string;
}

function toRecord(row: RecordRow): ServerRecord {
  return {
    id: row.id,
    formId: row.form_id,
    formVersion: row.form_version,
    data: JSON.parse(row.data) as RecordData,
    version: row.version,
    deleted: row.deleted === 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function toHistory(h: HistoryRow): RecordHistoryEntry {
  return {
    version: h.version,
    data: JSON.parse(h.data) as RecordData,
    deleted: h.deleted === 1,
    updatedAt: h.updated_at,
    updatedBy: h.updated_by,
  };
}

export function scopeOf(ctx: Ctx): PullScope {
  return ctx.role === 'supervisor' ? 'all' : 'own';
}

/**
 * - `none`: id chưa tồn tại ở đâu cả (tạo mới được).
 * - `visible`: có trong dự án và trong phạm vi của người dùng.
 * - `hidden`: có, nhưng ở dự án khác hoặc ngoài phạm vi surveyor. Route phải trả 404 như `none`
 *   cho đọc (không lộ sự tồn tại), và không được ghi (ADR 0002 §3).
 */
export type RecordAccess = { kind: 'none' } | { kind: 'hidden' } | { kind: 'visible'; record: ServerRecord };

export function getRecordAccess(ctx: Ctx, db: Db, id: string): RecordAccess {
  // Cố ý KHÔNG lọc project_id ở đây: id phiếu là khoá toàn hệ thống, và phải phát hiện được id
  // đang thuộc dự án khác để không ghi đè (ADR 0002 §3). Kết quả được lọc ngay bên dưới.
  const row = db.prepare(`SELECT * FROM records WHERE id = ?`).get(id) as RecordRow | undefined;
  if (!row) return { kind: 'none' };
  if (row.project_id !== ctx.projectId) return { kind: 'hidden' };
  if (ctx.role === 'surveyor' && row.created_by !== ctx.userId) return { kind: 'hidden' };
  return { kind: 'visible', record: toRecord(row) };
}

export function pullRecords(
  ctx: Ctx,
  db: Db,
  since: number,
  limit: number,
): { records: ServerRecord[]; cursor: number; scope: PullScope } {
  const scope = scopeOf(ctx);
  const rows =
    scope === 'own'
      ? (db
          .prepare(`SELECT * FROM records WHERE project_id = ? AND created_by = ? AND seq > ? ORDER BY seq LIMIT ?`)
          .all(ctx.projectId, ctx.userId, since, limit) as unknown as RecordRow[])
      : (db
          .prepare(`SELECT * FROM records WHERE project_id = ? AND seq > ? ORDER BY seq LIMIT ?`)
          .all(ctx.projectId, since, limit) as unknown as RecordRow[]);
  const last = rows[rows.length - 1];
  return { records: rows.map(toRecord), cursor: last ? last.seq : since, scope };
}

/** Lịch sử các phiên bản sau `afterVersion`, cũ đến mới. undefined nếu phiếu không thấy được. */
export function getHistory(ctx: Ctx, db: Db, id: string, afterVersion = 0): RecordHistoryEntry[] | undefined {
  if (getRecordAccess(ctx, db, id).kind !== 'visible') return undefined;
  const rows = db
    .prepare(`SELECT * FROM record_history WHERE project_id = ? AND record_id = ? AND version > ? ORDER BY version`)
    .all(ctx.projectId, id, afterVersion) as unknown as HistoryRow[];
  return rows.map(toHistory);
}

export interface WriteRecordInput {
  id: string;
  formId: string;
  formVersion: number;
  data: RecordData;
  deleted: boolean;
}

/**
 * Tạo hoặc ghi phiên bản kế tiếp. PHẢI gọi trong `tx(db, ...)`: cấp `seq` và ghi phiếu cùng
 * lịch sử phải nằm trong một transaction (cursor sẽ sai nếu không, design §5.5).
 * Việc so `baseVersion` thuộc route, chạy trước hàm này. `created_by` chỉ đặt lúc tạo;
 * `updated_by` và `updated_at` do server quyết (bất biến 4, 6).
 */
export function writeRecord(ctx: Ctx, db: Db, input: WriteRecordInput): ServerRecord {
  const access = getRecordAccess(ctx, db, input.id);
  if (access.kind === 'hidden') throw new Error('record_not_accessible');

  const version = access.kind === 'visible' ? access.record.version + 1 : 1;
  const now = new Date().toISOString();
  const seq = nextSeq(db);
  const dataJson = JSON.stringify(input.data);
  const deleted = input.deleted ? 1 : 0;

  db.prepare(
    `INSERT INTO records (id, project_id, form_id, form_version, data, version, deleted, created_by, updated_at, updated_by, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, version = excluded.version, deleted = excluded.deleted,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by, seq = excluded.seq
       WHERE records.project_id = excluded.project_id`,
  ).run(input.id, ctx.projectId, input.formId, input.formVersion, dataJson, version, deleted, ctx.userId, now, ctx.userId, seq);
  db.prepare(
    `INSERT INTO record_history (record_id, project_id, version, data, deleted, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.id, ctx.projectId, version, dataJson, deleted, now, ctx.userId);

  const saved = db
    .prepare(`SELECT * FROM records WHERE id = ? AND project_id = ?`)
    .get(input.id, ctx.projectId) as RecordRow | undefined;
  if (!saved) throw new Error('ghi phiếu xong nhưng không đọc lại được');
  return toRecord(saved);
}
