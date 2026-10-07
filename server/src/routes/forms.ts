import { Router } from 'express';
import type { FormSchema } from '@field-survey/shared';
import type { Db } from '../db';

export function formsRouter(db: Db): Router {
  const r = Router();

  // Trả về phiên bản mới nhất của mỗi form
  r.get('/', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT schema FROM forms f WHERE version = (SELECT MAX(version) FROM forms WHERE id = f.id) ORDER BY id`,
      )
      .all() as { schema: string }[];
    res.json(rows.map((row) => JSON.parse(row.schema) as FormSchema));
  });

  r.get('/:id/versions/:version', (req, res) => {
    const row = db
      .prepare(`SELECT schema FROM forms WHERE id = ? AND version = ?`)
      .get(req.params.id, Number(req.params.version)) as { schema: string } | undefined;
    if (!row) return void res.status(404).json({ error: 'not_found' });
    res.json(JSON.parse(row.schema));
  });

  // TODO(Thành viên 1): POST /api/forms — lưu form từ Form builder, tự tăng version.
  // Validate schema (id trường không trùng, select phải có options). Xem docs/design.md §4.1.
  r.post('/', (_req, res) => {
    res.status(501).json({ error: 'not_implemented' });
  });

  return r;
}
