import { Router } from 'express';
import { parseCreateProjectRequest } from '@field-survey/shared';
import { getUser } from '../auth';
import type { Db } from '../db';
import { cancelProjectRequest, createProjectRequest, listMyProjectRequests } from '../repo/projectRequests';

// /api/project-requests: người dùng gửi, xem, huỷ yêu cầu mở tổ chức của chính mình (ADR 0003 §3 mục 1).
// Chỉ cần đăng nhập (requireAuth gắn ở app.ts). Duyệt/từ chối nằm ở /api/admin/project-requests.
export function projectRequestsRouter(db: Db): Router {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(listMyProjectRequests(db, getUser(req).id));
  });

  r.post('/', (req, res) => {
    const input = parseCreateProjectRequest(req.body);
    if (!input) return void res.status(400).json({ error: 'invalid_body' });
    const result = createProjectRequest(db, getUser(req).id, input, new Date().toISOString());
    if (!result.ok) return void res.status(409).json({ error: result.error });
    res.status(201).json(result.request);
  });

  // Yêu cầu của người khác cũng trả 404 như yêu cầu không có, để không lộ id nào đang tồn tại.
  r.delete('/:id', (req, res) => {
    if (!cancelProjectRequest(db, getUser(req).id, req.params.id, new Date().toISOString())) {
      return void res.status(404).json({ error: 'not_found' });
    }
    res.status(204).end();
  });

  return r;
}
