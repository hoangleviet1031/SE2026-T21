import { Router, type Request } from 'express';
import type { ConflictResponse, PullResponse, PushRecordRequest } from '@field-survey/shared';
import { getCtx, type Ctx } from '../auth';
import { tx, type Db } from '../db';
import { findResponse, requestHash, saveResponse } from '../repo/idempotency';
import { getHistory, getRecordAccess, pullRecords, writeRecord } from '../repo/records';

// Route theo dự án: chỉ dùng `getCtx(req)`, không đọc projectId/userId từ body hay query.
// Xem docs/design.md §5.5, §7 và ADR 0002 §3.

function isValidPush(body: unknown): body is PushRecordRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    Number.isInteger(b.baseVersion) &&
    (b.baseVersion as number) >= 0 &&
    typeof b.data === 'object' &&
    b.data !== null &&
    !Array.isArray(b.data) &&
    typeof b.formId === 'string' &&
    b.formId !== '' &&
    Number.isInteger(b.formVersion) &&
    typeof b.deleted === 'boolean'
  );
}

function applyPush(ctx: Ctx, db: Db, id: string, body: unknown): { status: number; body: unknown } {
  if (!isValidPush(body)) return { status: 400, body: { error: 'invalid_body' } };

  const access = getRecordAccess(ctx, db, id);
  // Phiếu ở dự án khác hoặc ngoài phạm vi: trả y như "không có" để không lộ sự tồn tại.
  if (access.kind === 'hidden') return { status: 404, body: { error: 'not_found' } };

  const currentVersion = access.kind === 'visible' ? access.record.version : 0;
  if (currentVersion !== body.baseVersion) {
    if (access.kind === 'none') return { status: 404, body: { error: 'not_found' } };
    const conflict: ConflictResponse = {
      error: 'version_conflict',
      current: access.record,
      history: getHistory(ctx, db, id, body.baseVersion) ?? [],
    };
    return { status: 409, body: conflict };
  }

  const saved = writeRecord(ctx, db, {
    id,
    formId: body.formId,
    formVersion: body.formVersion,
    data: body.data,
    deleted: body.deleted,
  });
  return { status: currentVersion === 0 ? 201 : 200, body: saved };
}

export function recordsRouter(db: Db): Router {
  const r = Router();

  // Pull: các bản ghi thay đổi sau cursor, trong phạm vi của vai trò (design §5.5)
  r.get('/', (req, res) => {
    const ctx = getCtx(req);
    const since = Math.max(0, Math.trunc(Number(req.query.since ?? 0)) || 0);
    const limit = Math.min(Math.max(1, Math.trunc(Number(req.query.limit ?? 500)) || 500), 1000);
    const page = pullRecords(ctx, db, since, limit);
    const body: PullResponse = { records: page.records, cursor: page.cursor, scope: page.scope };
    res.json(body);
  });

  r.get('/:id/history', (req, res) => {
    const history = getHistory(getCtx(req), db, req.params.id);
    if (!history) return void res.status(404).json({ error: 'not_found' });
    res.json(history);
  });

  // Push: ghi có điều kiện theo baseVersion (optimistic concurrency).
  // Header Idempotency-Key bắt buộc: gửi lại cùng key trả lại đúng response cũ.
  r.put('/:id', (req: Request<{ id: string }>, res) => {
    const ctx = getCtx(req);
    const key = req.header('Idempotency-Key');
    if (!key) return void res.status(400).json({ error: 'missing_idempotency_key' });

    const hash = requestHash(ctx, req.params.id, req.body);
    const result = tx(db, () => {
      const seen = findResponse(db, key);
      if (seen) {
        // Key đã dùng cho request khác (khác dự án, khác phiếu hoặc khác nội dung): không replay,
        // vì replay sẽ trả kết quả của request kia, có thể lộ dữ liệu dự án khác (ADR 0001 quy tắc 3).
        // Hash đã gồm projectId và recordId; so riêng hai trường cho rõ ý.
        if (seen.projectId !== ctx.projectId || seen.recordId !== req.params.id || seen.requestHash !== hash) {
          return { status: 422, body: { error: 'idempotency_key_reused' }, replay: false };
        }
        return { status: seen.status, body: seen.body, replay: true };
      }

      const out = applyPush(ctx, db, req.params.id, req.body);
      // Chỉ lưu kết quả thành công; 409 không lưu để client gửi lại sau khi merge (với key mới)
      if (out.status < 300) saveResponse(ctx, db, key, req.params.id, hash, out.status, out.body);
      return { ...out, replay: false };
    });

    if (result.replay) res.setHeader('Idempotent-Replayed', 'true');
    res.status(result.status).json(result.body);
  });

  return r;
}
