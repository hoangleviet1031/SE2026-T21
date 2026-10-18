import { Router } from 'express';
import { parseDecideProjectRequest, parseProjectRequestStatus, type UpdateProjectRequest } from '@field-survey/shared';
import { getUser } from '../auth';
import type { Db } from '../db';
import { assignOwner, listProjects, setProjectArchived } from '../repo/projects';
import { decideProjectRequest, listProjectRequestsForAdmin } from '../repo/projectRequests';

// /api/admin: duyệt yêu cầu mở tổ chức, khoá/mở tổ chức, chỉ định Owner. Chỉ admin (requireAdmin gắn
// ở app.ts). Admin không tạo tổ chức trực tiếp và không bao giờ là thành viên tổ chức nào, nên không
// có đường nào tới form, phiếu (ADR 0003 §6, §8, Y8). Xem docs/design.md §7.

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Chỉ nhận đúng `{ archived }`: tên và công khai là quyền của Owner, gửi kèm thì báo sai thay vì lờ đi. */
function parseUpdate(body: unknown): UpdateProjectRequest | undefined {
  if (!isObject(body) || typeof body.archived !== 'boolean') return undefined;
  if (Object.keys(body).length !== 1) return undefined;
  return { archived: body.archived };
}

export function adminRouter(db: Db): Router {
  const r = Router();

  r.get('/project-requests', (req, res) => {
    const status = parseProjectRequestStatus(req.query.status);
    if (!status) return void res.status(400).json({ error: 'invalid_body' });
    res.json(listProjectRequestsForAdmin(db, status));
  });

  r.post('/project-requests/:id', (req, res) => {
    const decision = parseDecideProjectRequest(req.body);
    if (!decision) return void res.status(400).json({ error: 'invalid_body' });
    const result = decideProjectRequest(db, req.params.id, decision, getUser(req).id, new Date().toISOString());
    if (!result.ok) return void res.status(result.error === 'not_found' ? 404 : 409).json({ error: result.error });
    res.json(result.projectId ? { projectId: result.projectId } : {});
  });

  r.get('/projects', (_req, res) => {
    res.json(listProjects(db));
  });

  r.patch('/projects/:projectId', (req, res) => {
    const patch = parseUpdate(req.body);
    if (!patch) return void res.status(400).json({ error: 'invalid_body' });
    const project = setProjectArchived(db, req.params.projectId, patch.archived);
    if (!project) return void res.status(404).json({ error: 'not_found' });
    res.json(project);
  });

  // Khi khách hàng mất tài khoản Owner, hoặc tổ chức có từ trước migration 4 chưa có Owner (ADR 0003 §5).
  // Không có thân request.
  r.put('/projects/:projectId/owners/:username', (req, res) => {
    const { projectId, username } = req.params;
    const result = assignOwner(db, projectId, username, getUser(req).id, new Date().toISOString());
    if (!result.ok) return void res.status(result.error === 'not_found' ? 404 : 409).json({ error: result.error });
    res.json({ projectId, userId: result.userId, role: 'owner' });
  });

  return r;
}
