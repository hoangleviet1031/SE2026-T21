import { createHash } from 'node:crypto';
import type { Ctx } from '../auth';
import { canonicalJson } from '../canonicalJson';
import { tx, type Db } from '../db';

// Key idempotency sống 30 ngày (ADR 0001 quy tắc 3).
const KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface StoredResponse {
  projectId: string;
  recordId: string;
  requestHash: string;
  status: number;
  body: unknown;
}

interface IdempotencyRow {
  project_id: string;
  record_id: string;
  request_hash: string;
  status: number;
  body: string;
}

/**
 * SHA-256 của JSON chuẩn hoá gồm dự án, phiếu và các trường của PushRecordRequest. Chỉ lấy các
 * trường server dùng khi ghi: trường lạ (vd. `updatedBy` client cũ còn gửi) không đổi kết quả ghi
 * nên cũng không đổi hash (ADR 0001 quy tắc 3).
 */
export function requestHash(ctx: Ctx, recordId: string, requestBody: unknown): string {
  const b = typeof requestBody === 'object' && requestBody !== null ? (requestBody as Record<string, unknown>) : {};
  const payload = {
    projectId: ctx.projectId,
    recordId,
    formId: b.formId,
    formVersion: b.formVersion,
    baseVersion: b.baseVersion,
    data: b.data,
    deleted: b.deleted,
  };
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export function findResponse(db: Db, key: string): StoredResponse | undefined {
  // Cố ý không lọc project_id: key là khoá toàn hệ thống, phải thấy được key của dự án khác
  // để từ chối thay vì replay response của họ (ADR 0002 §3).
  const row = db
    .prepare(`SELECT project_id, record_id, request_hash, status, body FROM idempotency WHERE key = ?`)
    .get(key) as IdempotencyRow | undefined;
  if (!row) return undefined;
  return {
    projectId: row.project_id,
    recordId: row.record_id,
    requestHash: row.request_hash,
    status: row.status,
    body: JSON.parse(row.body),
  };
}

/** Lưu response thành công. PHẢI gọi trong cùng transaction với lần ghi phiếu. */
export function saveResponse(
  ctx: Ctx,
  db: Db,
  key: string,
  recordId: string,
  hash: string,
  status: number,
  body: unknown,
): void {
  db.prepare(
    `INSERT INTO idempotency (key, project_id, record_id, request_hash, status, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(key, ctx.projectId, recordId, hash, status, JSON.stringify(body), new Date().toISOString());
}

/**
 * Xoá key quá 30 ngày, trả số key đã xoá. Không nhận `ctx`: việc bảo trì chạy cho mọi dự án và
 * không đọc dữ liệu của dự án nào. Gửi lại op có key đã bị xoá vẫn an toàn: server thấy
 * baseVersion lệch và trả 409 (ADR 0001 quy tắc 3).
 */
export function deleteExpiredKeys(db: Db, now: Date): number {
  const cutoff = new Date(now.getTime() - KEY_TTL_MS).toISOString();
  return tx(db, () => Number(db.prepare(`DELETE FROM idempotency WHERE created_at < ?`).run(cutoff).changes));
}
