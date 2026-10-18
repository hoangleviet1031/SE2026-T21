import { Router } from 'express';
import { getUser } from '../auth';
import type { Db } from '../db';
import { listDirectory } from '../repo/projects';

// GET /api/directory: tên các tổ chức công khai mình chưa thuộc (ADR 0003 §3 mục 4). Chỉ id và tên;
// không có nút xin vào, người dùng tự liên hệ tổ chức để được thêm. Không chạm form, phiếu (§4).
export function directoryRouter(db: Db): Router {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(listDirectory(db, getUser(req).id));
  });

  return r;
}
