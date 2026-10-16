import { Router } from 'express';
import { parseSaveFormRequest } from '@field-survey/shared';
import { getCtx } from '../auth';
import type { Db } from '../db';
import { getFormVersion, listLatestForms, saveFormVersion } from '../repo/forms';

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

  // Lưu form từ builder thành phiên bản mới. Chỉ giám sát viên: chặn ở app.ts (design §7).
  r.post('/', (req, res) => {
    const input = parseSaveFormRequest(req.body);
    if (!input) return void res.status(400).json({ error: 'invalid_body' });
    const result = saveFormVersion(getCtx(req), db, input, new Date().toISOString());
    if (!result.ok) return void res.status(400).json({ error: 'invalid_form', details: result.errors });
    res.status(201).json(result.form);
  });

  return r;
}
