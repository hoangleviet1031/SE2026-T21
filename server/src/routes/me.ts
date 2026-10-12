import { Router } from 'express';
import type { MeResponse } from '@field-survey/shared';
import type { Db } from '../db';
import { listMyProjects } from '../repo/projects';

// GET /api/me: client dùng để kiểm mã đăng nhập và so danh sách dự án với bản đã lưu
// (dự án biến mất = bị rút hoặc bị lưu trữ, ADR 0002 §6). Xem docs/design.md §7.
export function meRouter(db: Db): Router {
  const r = Router();

  r.get('/', (req, res) => {
    if (!req.user) throw new Error('req.user chưa có: /me phải đi qua requireAuth');
    // Chép từng trường thay vì trả nguyên req.user, để sau này AuthUser có thêm gì cũng không lộ ra.
    const { id, name, isAdmin } = req.user;
    const body: MeResponse = { user: { id, name, isAdmin }, projects: listMyProjects(db, id) };
    res.json(body);
  });

  return r;
}
