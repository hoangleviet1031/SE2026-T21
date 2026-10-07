import { Router } from 'express';
import type { Db } from '../db';

// TODO(Thành viên 3): GET /api/export/:formId?format=csv|json[&includeDeleted=1]
// CSV: một cột cho mỗi trường của phiên bản form mới nhất, multiselect nối bằng "; ",
// gps tách lat/lng, photo xuất URL. Có BOM UTF-8 để Excel đọc đúng tiếng Việt. Xem docs/design.md §4.6.
export function exportRouter(_db: Db): Router {
  const r = Router();
  r.get('/:formId', (_req, res) => {
    res.status(501).json({ error: 'not_implemented' });
  });
  return r;
}
