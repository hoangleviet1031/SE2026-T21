import { Router } from 'express';
import { getCtx } from '../auth';
import type { Db } from '../db';
import { getFormVersion, listLatestForms } from '../repo/forms';

export function formsRouter(db: Db): Router {
  const r = Router();

  // Trả về phiên bản mới nhất của mỗi form trong dự án
  r.get('/', (req, res) => {
    res.json(listLatestForms(getCtx(req), db));
  });

  r.get('/:id/versions/:version', (req, res) => {
    const form = getFormVersion(getCtx(req), db, req.params.id, Number(req.params.version));
    if (!form) return void res.status(404).json({ error: 'not_found' });
    res.json(form);
  });

  // TODO(Dương, TV1-03): POST /api/projects/:projectId/forms — lưu form từ Form builder, tự tăng version.
  // Validate schema (id trường không trùng, select phải có options). Xem docs/design.md §4.1.
  r.post('/', (_req, res) => {
    res.status(501).json({ error: 'not_implemented' });
  });

  return r;
}
