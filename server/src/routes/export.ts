import { Router, type Request } from 'express';
import { getCtx } from '../auth';
import type { Db } from '../db';
import { toCsv } from '../lib/csv';
import { exportTable } from '../lib/exportTable';
import { listFormVersions } from '../repo/forms';
import { listRecordsByForm } from '../repo/records';

// GET P/export/:formId?format=csv|json&includeDeleted=0 (design §4.6). Gắn dưới
// /api/projects/:projectId sau requireMember('supervisor') nên supervisor và owner gọi được, surveyor
// nhận 403 forbidden (A3). Chỉ dùng getCtx(req); phiếu và form đều lọc theo dự án.
// Ảnh xuất dạng URL tuyệt đối (gốc là PUBLIC_BASE_URL, design §12); mở URL cần đăng nhập như mọi API ảnh.

export function exportRouter(db: Db, publicBaseUrl: string): Router {
  const r = Router();
  const base = publicBaseUrl.replace(/\/+$/, '');

  r.get('/:formId', (req: Request<{ formId: string }>, res) => {
    const ctx = getCtx(req);
    const format = req.query.format ?? 'csv';
    if (format !== 'csv' && format !== 'json') return void res.status(400).json({ error: 'invalid_body' });
    const includeDeleted = req.query.includeDeleted === '1';
    const formId = req.params.formId;

    const forms = listFormVersions(ctx, db, formId);
    if (forms.length === 0) return void res.status(404).json({ error: 'not_found' });
    const records = listRecordsByForm(ctx, db, formId, includeDeleted);

    // Tên file chỉ gồm ký tự an toàn: id form đã qua validate (design §4.1) nhưng không tin thêm.
    const filename = `${formId.replace(/[^A-Za-z0-9_-]/g, '_')}.${format}`;
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    if (format === 'json') return void res.json({ forms, records });

    const photoUrl = (id: string) =>
      `${base}/api/projects/${encodeURIComponent(ctx.projectId)}/attachments/${encodeURIComponent(id)}`;
    res.type('text/csv; charset=utf-8').send(toCsv(exportTable(forms, records, photoUrl)));
  });

  return r;
}
