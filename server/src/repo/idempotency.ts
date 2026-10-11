import { createHash } from 'node:crypto';
import type { Ctx } from '../auth';
import type { Db } from '../db';

export interface StoredResponse {
  projectId: string;
  recordId: string;
  status: number;
  body: unknown;
}

interface IdempotencyRow {
  project_id: string;
  record_id: string;
  status: number;
  body: string;
}

export function findResponse(db: Db, key: string): StoredResponse | undefined {
  // Cố ý không lọc project_id: key là khoá toàn hệ thống, phải thấy được key của dự án khác
  // để từ chối thay vì replay response của họ (ADR 0002 §3).
  const row = db
    .prepare(`SELECT project_id, record_id, status, body FROM idempotency WHERE key = ?`)
    .get(key) as IdempotencyRow | undefined;
  if (!row) return undefined;
  return { projectId: row.project_id, recordId: row.record_id, status: row.status, body: JSON.parse(row.body) };
}

/**
 * Lưu response thành công. PHẢI gọi trong cùng transaction với lần ghi phiếu.
 * `request_hash` mới chỉ được ghi; việc so hash và trả 422 theo nội dung là của TV2-08.
 */
export function saveResponse(
  ctx: Ctx,
  db: Db,
  key: string,
  recordId: string,
  requestBody: unknown,
  status: number,
  body: unknown,
): void {
  const hash = createHash('sha256')
    .update(JSON.stringify([ctx.projectId, recordId, requestBody]))
    .digest('hex');
  db.prepare(
    `INSERT INTO idempotency (key, project_id, record_id, request_hash, status, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(key, ctx.projectId, recordId, hash, status, JSON.stringify(body), new Date().toISOString());
}
