import { Router, type Request } from 'express';
import type { FormSchema, ServerRecord } from '@field-survey/shared';
import { getCtx, type Ctx } from '../auth';
import { readTx, type Db } from '../db';
import { toCsv } from '../lib/csv';
import { exportTable } from '../lib/exportTable';
import { listAllFormVersions, listFormVersions } from '../repo/forms';
import { listRecordsByForm, listRecordsByProject } from '../repo/records';

// GET P/export/:formId?format=csv|json&includeDeleted=0 (design §4.6). Gắn dưới
// /api/projects/:projectId sau requireMember('supervisor') nên supervisor và owner gọi được, surveyor
// nhận 403 forbidden (A3). Chỉ dùng getCtx(req); phiếu và form đều lọc theo dự án.
// Ảnh xuất dạng URL tuyệt đối (gốc là PUBLIC_BASE_URL, design §12); mở URL cần đăng nhập như mọi API ảnh.

/**
 * Form và phiếu của cả dự án trong MỘT ảnh chụp (readTx): kết nối khác ghi form mới rồi phiếu dùng form
 * đó giữa hai câu đọc thì file vẫn nhất quán, thấy cả hai hoặc không thấy cái nào (ca EX-14).
 */
export function readProjectExport(ctx: Ctx, db: Db, includeDeleted: boolean): { forms: FormSchema[]; records: ServerRecord[] } {
  return readTx(db, () => ({ forms: listAllFormVersions(ctx, db), records: listRecordsByProject(ctx, db, includeDeleted) }));
}

export function exportRouter(db: Db, publicBaseUrl: string): Router {
  const r = Router();
  const base = publicBaseUrl.replace(/\/+$/, '');

  // GET P/export?format=json&includeDeleted=0: cả dự án, chỉ JSON vì một bảng CSV không chứa được nhiều
  // form khác cột (design §4.6). Quyền như xuất theo form: requireMember('supervisor') ở app.ts.
  r.get('/', (req, res) => {
    const format = req.query.format ?? 'json';
    if (format !== 'json') return void res.status(400).json({ error: 'invalid_body' });
    const ctx = getCtx(req);
    const body = readProjectExport(ctx, db, req.query.includeDeleted === '1');
    // projectId đã qua requireMember nhưng vẫn lọc ký tự như tên file theo form.
    res.set('Content-Disposition', `attachment; filename="${ctx.projectId.replace(/[^A-Za-z0-9_-]/g, '_')}.json"`);
    res.json(body);
  });

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
