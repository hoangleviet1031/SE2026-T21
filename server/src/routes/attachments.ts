import { Router } from 'express';

// TODO(Thành viên 3): upload ảnh theo chunk, tiếp tục được khi mất mạng giữa chừng.
// Xem docs/design.md §4.4. API dự kiến:
//   GET  /api/attachments/:id/status          -> { received: number[] }
//   PUT  /api/attachments/:id/chunks/:index    (body: application/octet-stream, tối đa 256 KB)
//   POST /api/attachments/:id/complete         { totalChunks, mimeType, sha256 }
//   GET  /api/attachments/:id                  -> file
export function attachmentsRouter(): Router {
  const r = Router();
  r.all('/{*rest}', (_req, res) => {
    res.status(501).json({ error: 'not_implemented' });
  });
  return r;
}
