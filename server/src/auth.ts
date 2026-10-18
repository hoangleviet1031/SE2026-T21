import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@field-survey/shared';
import { tx, type Db } from './db';
import { getMemberRole } from './repo/memberships';

// Xác thực và kiểm tra thành viên dự án. Xem docs/design.md §9, ADR 0002 §3.

export interface AuthUser {
  id: string;
  username: string;
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
      /** SHA-256 của token phiên đang dùng, để `/auth/logout` xoá đúng phiên của máy này. */
      sessionHash?: string;
      ctx?: Ctx;
    }
  }
}

/** SHA-256 dạng hex. Server chỉ lưu và so sánh giá trị này, không bao giờ lưu hay ghi log token gốc. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Owner có mọi quyền của supervisor nên route cần supervisor cũng cho owner qua (ADR 0003 §2).
const ROLE_RANK: Record<Role, number> = { surveyor: 0, supervisor: 1, owner: 2 };

interface SessionUserRow {
  token_hash: string;
  id: string;
  username: string | null;
  name: string;
  is_admin: number;
}

/** Tài khoản do CLI cũ tạo (trước TV3-12) chưa có username; dùng id như migration 4 làm với tài khoản cũ. */
export function toAuthUser(row: { id: string; username: string | null; name: string; is_admin: number }): AuthUser {
  return { id: row.id, username: row.username ?? row.id, name: row.name, isAdmin: row.is_admin === 1 };
}

/** Lấy `ctx` trong handler đã đi qua `requireMember`. Thiếu `ctx` là lỗi lập trình (quên gắn middleware). */
export function getCtx(req: Request): Ctx {
  if (!req.ctx) throw new Error('req.ctx chưa có: route theo dự án phải đi qua requireMember');
  return req.ctx;
}

/** Lấy người dùng trong handler đã đi qua `requireAuth`. Thiếu là lỗi lập trình, như `getCtx`. */
export function getUser(req: Request): AuthUser {
  if (!req.user) throw new Error('req.user chưa có: route phải đi qua requireAuth');
  return req.user;
}

export function createAuth(db: Db): {
  requireAuth: RequestHandler;
  requireMember: (minRole: Role) => RequestHandler;
  requireAdmin: RequestHandler;
} {
  // Tra bảng sessions, không còn users.token_hash (ADR 0003 §1). Tài khoản bị khoá thì mọi phiên mất hiệu lực.
  const findSession = db.prepare(
    `SELECT s.token_hash, u.id, u.username, u.name, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND u.disabled = 0`,
  );
  const touchSession = db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`);

  const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const match = /^Bearer +(\S+)$/i.exec(req.header('Authorization') ?? '');
    if (!match?.[1]) return void res.status(401).json({ error: 'unauthorized' });

    const hash = hashToken(match[1]);
    const row = findSession.get(hash) as SessionUserRow | undefined;
    // Tra bằng hash đã loại phần lớn rủi ro timing; so lại bằng hàm hằng thời gian cho chắc.
    if (!row || !timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(hash, 'hex'))) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    // Chỉ để admin biết phiên nào còn dùng (vd. trước khi thu hồi); không dùng để hết hạn phiên.
    tx(db, () => touchSession.run(new Date().toISOString(), hash));
    req.user = toAuthUser(row);
    req.sessionHash = hash;
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

  // Admin quản lý dự án nhưng không vì thế mà đọc được dữ liệu dự án: route theo dự án vẫn chỉ
  // xét memberships (ADR 0002 §2, ca T4).
  const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return void res.status(401).json({ error: 'unauthorized' });
    if (!req.user.isAdmin) return void res.status(403).json({ error: 'forbidden' });
    next();
  };

  return { requireAuth, requireMember, requireAdmin };
}
