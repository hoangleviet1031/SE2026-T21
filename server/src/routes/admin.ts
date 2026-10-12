import { Router } from 'express';
import type { CreateProjectRequest, UpdateProjectRequest } from '@field-survey/shared';
import type { Db } from '../db';
import { assignSupervisor, createProject, listProjects, updateProject } from '../repo/projects';

// /api/admin/projects: tạo, đổi tên, lưu trữ dự án và chỉ định giám sát viên đầu tiên.
// Chỉ admin (requireAdmin gắn ở app.ts). Xem docs/design.md §4.7, §7; ADR 0002 §2.

// id dự án nằm trong URL và tên IndexedDB `field-survey-p-<id>` (design §4.2), nên chỉ cho
// chữ thường, số và gạch nối, giống `demo-yte`.
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_NAME = 100;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Tên đã cắt khoảng trắng, hoặc undefined nếu không hợp lệ. */
function parseName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const name = v.trim();
  return name && name.length <= MAX_NAME ? name : undefined;
}

function parseCreate(body: unknown): CreateProjectRequest | undefined {
  if (!isObject(body) || typeof body.id !== 'string' || !PROJECT_ID.test(body.id)) return undefined;
  const name = parseName(body.name);
  return name ? { id: body.id, name } : undefined;
}

function parseUpdate(body: unknown): UpdateProjectRequest | undefined {
  if (!isObject(body)) return undefined;
  const patch: UpdateProjectRequest = {};
  if (body.name !== undefined) {
    const name = parseName(body.name);
    if (!name) return undefined;
    patch.name = name;
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') return undefined;
    patch.archived = body.archived;
  }
  return patch.name === undefined && patch.archived === undefined ? undefined : patch;
}

export function adminRouter(db: Db): Router {
  const r = Router();

  r.get('/projects', (_req, res) => {
    res.json(listProjects(db));
  });

  r.post('/projects', (req, res) => {
    const input = parseCreate(req.body);
    if (!input) return void res.status(400).json({ error: 'invalid_body' });
    const project = createProject(db, input.id, input.name, new Date().toISOString());
    if (!project) return void res.status(409).json({ error: 'project_exists' });
    res.status(201).json(project);
  });

  r.patch('/projects/:projectId', (req, res) => {
    const patch = parseUpdate(req.body);
    if (!patch) return void res.status(400).json({ error: 'invalid_body' });
    const project = updateProject(db, req.params.projectId, patch);
    if (!project) return void res.status(404).json({ error: 'not_found' });
    res.json(project);
  });

  // Chỉ để chỉ định giám sát viên; thêm surveyor, đổi vai trò, rút là việc của giám sát viên
  // qua P/members (TV1-08). Không có thân request.
  r.put('/projects/:projectId/members/:userId', (req, res) => {
    const { projectId, userId } = req.params;
    if (!assignSupervisor(db, projectId, userId, new Date().toISOString())) {
      return void res.status(404).json({ error: 'not_found' });
    }
    res.json({ projectId, userId, role: 'supervisor' });
  });

  return r;
}
