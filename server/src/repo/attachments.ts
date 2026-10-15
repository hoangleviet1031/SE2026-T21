import type { Ctx } from '../auth';
import type { Db } from '../db';
import type { ImageType } from '../uploads';
import { getRecordAccess } from './records';

// Ảnh đã ghép xong của dự án (design §4.4, §6.1). Ảnh theo phạm vi của phiếu chứa nó:
// surveyor chỉ thấy ảnh của phiếu mình tạo, supervisor thấy mọi ảnh của dự án.

/** Response của `POST P/attachments/:id/complete` (design §7). */
export interface AttachmentInfo {
  id: string;
  recordId: string;
  mimeType: ImageType;
  size: number;
  sha256: string;
}

interface AttachmentRow {
  id: string;
  project_id: string;
  record_id: string;
  mime_type: ImageType;
  size: number;
  sha256: string;
  total_chunks: number;
}

function toInfo(row: AttachmentRow): AttachmentInfo {
  return { id: row.id, recordId: row.record_id, mimeType: row.mime_type, size: row.size, sha256: row.sha256 };
}

/**
 * - `none`: chưa có ảnh nào đã ghép với id này (đang tải lên hoặc chưa bắt đầu).
 * - `hidden`: có, nhưng ở dự án khác hoặc thuộc phiếu ngoài phạm vi. Route trả 404, không ghi.
 * - `visible`: có trong dự án và trong phạm vi.
 */
export type AttachmentAccess =
  | { kind: 'none' }
  | { kind: 'hidden' }
  | { kind: 'visible'; attachment: AttachmentInfo; totalChunks: number };

export function getAttachmentAccess(ctx: Ctx, db: Db, id: string): AttachmentAccess {
  // Cố ý KHÔNG lọc project_id: id ảnh là khoá toàn hệ thống, phải biết id đang thuộc dự án khác
  // để trả 404 thay vì cho tải chunk mới đè lên (ADR 0002 §3). Kết quả lọc ngay bên dưới.
  const row = db
    .prepare(`SELECT id, project_id, record_id, mime_type, size, sha256, total_chunks FROM attachments WHERE id = ?`)
    .get(id) as AttachmentRow | undefined;
  if (!row) return { kind: 'none' };
  if (row.project_id !== ctx.projectId) return { kind: 'hidden' };
  if (getRecordAccess(ctx, db, row.record_id).kind !== 'visible') return { kind: 'hidden' };
  return { kind: 'visible', attachment: toInfo(row), totalChunks: row.total_chunks };
}

/** Ghi ảnh đã ghép. PHẢI gọi trong `tx(db, ...)`; route đã kiểm phiếu thuộc phạm vi trước đó. */
export function createAttachment(
  ctx: Ctx,
  db: Db,
  input: AttachmentInfo & { totalChunks: number },
  now: string,
): void {
  db.prepare(
    `INSERT INTO attachments (id, project_id, record_id, mime_type, size, sha256, total_chunks, created_by, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    ctx.projectId,
    input.recordId,
    input.mimeType,
    input.size,
    input.sha256,
    input.totalChunks,
    ctx.userId,
    now,
    now,
  );
}
