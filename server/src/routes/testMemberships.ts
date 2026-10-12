import { Router } from 'express';
import { tx, type Db } from '../db';

// Đổi thành viên trực tiếp cho E2E T7–T9 (ADR 0002), chỉ đăng ký khi ENABLE_TEST_ROUTES=1.
// Không xác thực vì chỉ chạy trên server kiểm thử. Route thật cho giám sát viên là
// P/members (TV1-08). Xem docs/design.md §10.1 (API kiểm thử).
//   PUT    /api/__test/memberships/:projectId/:userId  { "role": "surveyor" | "supervisor" }
//   DELETE /api/__test/memberships/:projectId/:userId
export function testMembershipsRouter(db: Db): Router {
  const r = Router();

  r.put('/memberships/:projectId/:userId', (req, res) => {
    const { projectId, userId } = req.params;
    const role: unknown = (req.body as { role?: unknown } | undefined)?.role;
    if (role !== 'surveyor' && role !== 'supervisor') return void res.status(400).json({ error: 'invalid_body' });
    const ok = tx(db, () => {
      const projectExists = db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(projectId) !== undefined;
      const userExists = db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(userId) !== undefined;
      if (!projectExists || !userExists) return false;
      db.prepare(
        `INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role`,
      ).run(projectId, userId, role, new Date().toISOString());
      return true;
    });
    if (!ok) return void res.status(404).json({ error: 'not_found' });
    res.json({ projectId, userId, role });
  });

  r.delete('/memberships/:projectId/:userId', (req, res) => {
    const { projectId, userId } = req.params;
    tx(db, () => {
      db.prepare(`DELETE FROM memberships WHERE project_id = ? AND user_id = ?`).run(projectId, userId);
    });
    res.json({ ok: true });
  });

  return r;
}
