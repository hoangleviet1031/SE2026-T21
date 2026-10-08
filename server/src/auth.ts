import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@field-survey/shared';
import type { Db } from './db';
import { getMemberRole } from './repo/memberships';

// Xác thực và kiểm tra thành viên dự án. Xem docs/design.md §9, ADR 0002 §3.

export interface AuthUser {
  id: string;
  name: string;
  isAdmin: boolean;
}

/** Ngữ cảnh của một request theo dự án. Chỉ `requireMember` được tạo ra nó. */
export interface Ctx {
  userId: string;
  projectId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      ctx?: Ctx;
    }
  }
}

/** SHA-256 dạng hex. Server chỉ lưu và so sánh giá trị này, không bao giờ lưu hay ghi log token gốc. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const ROLE_RANK: Record<Role, number> = { surveyor: 0, supervisor: 1 };

interface UserRow {
  id: string;
  name: string;
  token_hash: string;
  is_admin: number;
}

/** Lấy `ctx` trong handler đã đi qua `requireMember`. Thiếu `ctx` là lỗi lập trình (quên gắn middleware). */
export function getCtx(req: Request): Ctx {
  if (!req.ctx) throw new Error('req.ctx chưa có: route theo dự án phải đi qua requireMember');
  return req.ctx;
}

export function createAuth(db: Db): {
  requireAuth: RequestHandler;
  requireMember: (minRole: Role) => RequestHandler;
} {
  const findUser = db.prepare(
    `SELECT id, name, token_hash, is_admin FROM users WHERE token_hash = ? AND disabled = 0`,
  );

  const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const match = /^Bearer +(\S+)$/i.exec(req.header('Authorization') ?? '');
    if (!match?.[1]) return void res.status(401).json({ error: 'unauthorized' });

    const hash = hashToken(match[1]);
    const row = findUser.get(hash) as UserRow | undefined;
    // Tra bằng hash đã loại phần lớn rủi ro timing; so lại bằng hàm hằng thời gian cho chắc.
    if (!row || !timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(hash, 'hex'))) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    req.user = { id: row.id, name: row.name, isAdmin: row.is_admin === 1 };
    next();
  };

  const requireMember =
    (minRole: Role): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) return void res.status(401).json({ error: 'unauthorized' });

      // projectId chỉ đến từ đường dẫn; không đọc body hay query ở đây hay ở bất kỳ handler nào.
      const rawProjectId = req.params.projectId;
      const projectId = typeof rawProjectId === 'string' ? rawProjectId : undefined;
      // Dự án không có, đã lưu trữ hay mình không thuộc: cùng một mã để không lộ dự án có tồn tại.
      const role = projectId ? getMemberRole(db, req.user.id, projectId) : undefined;
      if (!projectId || !role) return void res.status(403).json({ error: 'not_member' });
      if (ROLE_RANK[role] < ROLE_RANK[minRole]) return void res.status(403).json({ error: 'forbidden' });

      req.ctx = { userId: req.user.id, projectId, role };
      next();
    };

  return { requireAuth, requireMember };
}
