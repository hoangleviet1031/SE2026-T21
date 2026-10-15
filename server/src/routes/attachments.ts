import express, { Router, type ErrorRequestHandler, type Request } from 'express';
import { createHash } from 'node:crypto';
import { getCtx } from '../auth';
import { tx, type Db } from '../db';
import { createAttachment, getAttachmentAccess } from '../repo/attachments';
import { getRecordAccess } from '../repo/records';
import {
  detectImageType,
  IMAGE_TYPES,
  isAttachmentId,
  MAX_CHUNK_BYTES,
  MAX_CHUNKS,
  MAX_IMAGE_BYTES,
  type ImageType,
  type UploadStore,
} from '../uploads';

// Upload ảnh theo chunk, tiếp tục được khi mất mạng giữa chừng. Gắn dưới /api/projects/:projectId
// sau requireMember; chỉ dùng getCtx(req). Xem docs/design.md §4.4, §5.6, §7, §7.1, §9.
//   GET  P/attachments/:id/status        -> { received: number[] }
//   PUT  P/attachments/:id/chunks/:index (application/octet-stream, ≤ 256 KB)
//   POST P/attachments/:id/complete      { recordId, totalChunks, mimeType, sha256 }
//   GET  P/attachments/:id               -> file

interface CompleteBody {
  recordId: string;
  totalChunks: number;
  mimeType: string;
  sha256: string;
}

function isCompleteBody(body: unknown): body is CompleteBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.recordId === 'string' &&
    b.recordId !== '' &&
    Number.isInteger(b.totalChunks) &&
    (b.totalChunks as number) >= 1 &&
    typeof b.mimeType === 'string' &&
    typeof b.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(b.sha256)
  );
}

const isImageType = (s: string): s is ImageType => (IMAGE_TYPES as readonly string[]).includes(s);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const sha256Hex = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

const NOT_FOUND = { error: 'not_found' };

export function attachmentsRouter(db: Db, store: UploadStore): Router {
  const r = Router();

  // Id ghép vào đường dẫn file nên phải là UUID trước khi làm bất cứ việc gì (chống path traversal).
  r.param('id', (req, res, next, id: string) => {
    if (!isAttachmentId(id)) return void res.status(400).json({ error: 'invalid_body' });
    next();
  });

  r.get('/:id/status', (req: Request<{ id: string }>, res) => {
    const ctx = getCtx(req);
    const access = getAttachmentAccess(ctx, db, req.params.id);
    if (access.kind === 'hidden') return void res.status(404).json(NOT_FOUND);
    // Ảnh đã ghép: báo đủ mọi chunk để client không gửi lại.
    if (access.kind === 'visible') return void res.json({ received: range(access.totalChunks) });
    res.json({ received: store.listChunks(ctx.projectId, req.params.id) });
  });

  r.put(
    '/:id/chunks/:index',
    // Nhận mọi Content-Type: chunk là byte thô, loại ảnh kiểm bằng magic bytes lúc complete.
    express.raw({ type: () => true, limit: MAX_CHUNK_BYTES }),
    (req: Request<{ id: string; index: string }>, res) => {
      const ctx = getCtx(req);
      const { id, index: rawIndex } = req.params;
      if (!/^\d+$/.test(rawIndex)) return void res.status(400).json({ error: 'invalid_body' });
      const index = Number(rawIndex);
      if (index >= MAX_CHUNKS) return void res.status(413).json({ error: 'payload_too_large' });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return void res.status(400).json({ error: 'invalid_body' });
      }

      const access = getAttachmentAccess(ctx, db, id);
      if (access.kind === 'hidden') return void res.status(404).json(NOT_FOUND);
      // Ảnh đã ghép xong: coi như chunk đã có, không đụng tới file.
      if (access.kind === 'visible') return void res.status(200).json({ index });

      const written = store.writeChunk(ctx.projectId, id, index, req.body);
      res.status(written ? 201 : 200).json({ index });
    },
  );

  r.post('/:id/complete', (req: Request<{ id: string }>, res) => {
    const ctx = getCtx(req);
    const { id } = req.params;
    const body: unknown = req.body;
    if (!isCompleteBody(body)) return void res.status(400).json({ error: 'invalid_body' });
    if (body.totalChunks > MAX_CHUNKS) return void res.status(413).json({ error: 'payload_too_large' });
    const mimeType = body.mimeType;
    if (!isImageType(mimeType)) return void res.status(415).json({ error: 'unsupported_media_type' });

    const access = getAttachmentAccess(ctx, db, id);
    if (access.kind === 'hidden') return void res.status(404).json(NOT_FOUND);
    if (access.kind === 'visible') {
      // Gọi lại complete (vd. mất response lần trước): cùng nội dung thì trả lại kết quả cũ.
      if (access.attachment.sha256 === body.sha256) return void res.status(200).json(access.attachment);
      return void res.status(422).json({ error: 'checksum_mismatch' });
    }
    if (getRecordAccess(ctx, db, body.recordId).kind !== 'visible') return void res.status(404).json(NOT_FOUND);

    const have = new Set(store.listChunks(ctx.projectId, id));
    const missing = range(body.totalChunks).filter((i) => !have.has(i));
    if (missing.length > 0) return void res.status(409).json({ error: 'missing_chunks', details: missing });

    const file = store.readChunks(ctx.projectId, id, body.totalChunks);
    // Các lỗi dưới đây không sửa được bằng cách gửi tiếp chunk: xoá chunk để client gửi lại từ đầu (§5.6).
    if (file.length > MAX_IMAGE_BYTES) {
      store.removeChunks(ctx.projectId, id);
      return void res.status(413).json({ error: 'payload_too_large' });
    }
    if (sha256Hex(file) !== body.sha256) {
      store.removeChunks(ctx.projectId, id);
      return void res.status(422).json({ error: 'checksum_mismatch' });
    }
    if (detectImageType(file) !== mimeType) {
      store.removeChunks(ctx.projectId, id);
      return void res.status(415).json({ error: 'unsupported_media_type' });
    }

    const info = { id, recordId: body.recordId, mimeType, size: file.length, sha256: body.sha256 };
    // Ghi file trước rồi mới ghi DB: DB có dòng thì file chắc chắn đã có.
    store.saveFile(ctx.projectId, id, file);
    tx(db, () => createAttachment(ctx, db, { ...info, totalChunks: body.totalChunks }, new Date().toISOString()));
    store.removeChunks(ctx.projectId, id);
    res.status(201).json(info);
  });

  r.get('/:id', (req: Request<{ id: string }>, res) => {
    const ctx = getCtx(req);
    const access = getAttachmentAccess(ctx, db, req.params.id);
    if (access.kind !== 'visible') return void res.status(404).json(NOT_FOUND);
    // nosniff: trình duyệt không được đoán lại loại file, chỉ hiển thị như ảnh.
    res.set('X-Content-Type-Options', 'nosniff');
    res.type(access.attachment.mimeType).send(store.readFile(ctx.projectId, req.params.id));
  });

  // express.raw báo chunk quá giới hạn bằng lỗi 'entity.too.large'; trả đúng mã của §7.1.
  const tooLarge: ErrorRequestHandler = (err: unknown, _req, res, next) => {
    if (typeof err === 'object' && err !== null && (err as { type?: unknown }).type === 'entity.too.large') {
      return void res.status(413).json({ error: 'payload_too_large' });
    }
    next(err);
  };
  r.use(tooLarge);

  return r;
}
