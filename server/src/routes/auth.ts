import { Router, type Request, type RequestHandler } from 'express';
import { parseLoginRequest, parseRegisterRequest, type AuthResponse } from '@field-survey/shared';
import { tx, type Db } from '../db';
import { toAuthUser } from '../auth';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../password';
import { createRateLimiter } from '../rateLimit';
import {
  deleteSession,
  findUserByUsername,
  insertSession,
  insertUser,
  newSessionToken,
  type LoginUserRow,
} from '../repo/users';

// Tự tạo tài khoản, đăng nhập, đăng xuất (ADR 0003 §1, design §7). Không bao giờ ghi log mật khẩu
// hay token; DB chỉ giữ scrypt của mật khẩu và SHA-256 của token phiên.

const MINUTE = 60_000;

// IP thật của người dùng: app đặt `trust proxy` = loopback nên sau Caddy đây là địa chỉ trong
// X-Forwarded-For, không phải 127.0.0.1 của chính Caddy.
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? '';
}

export function authRouter(db: Db, requireAuth: RequestHandler): Router {
  const r = Router();
  // Mỗi app một bộ đếm (test tạo nhiều app không dùng chung). Số liệu theo ADR 0003 §1.
  const loginFailures = createRateLimiter({ limit: 10, windowMs: 15 * MINUTE });
  const registrations = createRateLimiter({ limit: 5, windowMs: 60 * MINUTE });

  r.post('/register', async (req, res) => {
    const body = parseRegisterRequest(req.body);
    if (!body) return void res.status(400).json({ error: 'invalid_body' });
    const ip = clientIp(req);
    // Giữ chỗ một lượt trước khi chờ scrypt (xem rateLimit.ts); không tạo được tài khoản thì trả lại,
    // vì chỉ đăng ký thành công mới tính vào giới hạn.
    const reservedAt = Date.now();
    if (registrations.isBlocked(ip, reservedAt)) return void res.status(429).json({ error: 'too_many_requests' });
    registrations.hit(ip, reservedAt);

    let userId: string | undefined;
    let token = '';
    try {
      // Băm trước khi mở transaction: scrypt chạy bất đồng bộ, không được nằm giữa BEGIN và COMMIT.
      const passwordHash = await hashPassword(body.password);
      token = newSessionToken();
      const now = new Date().toISOString();
      userId = tx(db, () => {
        // Kiểm rồi ghi trong cùng một BEGIN IMMEDIATE nên hai request cùng tên không lọt cả hai.
        if (findUserByUsername(db, body.username)) return undefined;
        const id = insertUser(db, { username: body.username, name: body.name, passwordHash, now });
        insertSession(db, id, token, now);
        return id;
      });
    } finally {
      if (!userId) registrations.release(ip, reservedAt);
    }
    if (!userId) return void res.status(409).json({ error: 'username_taken' });

    const out: AuthResponse = {
      token,
      user: { id: userId, username: body.username, name: body.name, isAdmin: false },
    };
    res.status(201).json(out);
  });

  r.post('/login', async (req, res) => {
    const body = parseLoginRequest(req.body);
    if (!body) return void res.status(400).json({ error: 'invalid_body' });
    const ip = clientIp(req);
    const userKey = `u:${body.username}`;
    const ipKey = `ip:${ip}`;
    // Đang bị chặn thì trả 429 kể cả khi mật khẩu đúng (ca U4), và không chạy scrypt.
    const reservedAt = Date.now();
    if (loginFailures.isBlocked(userKey, reservedAt) || loginFailures.isBlocked(ipKey, reservedAt)) {
      return void res.status(429).json({ error: 'too_many_requests' });
    }
    // Giữ chỗ như một lần sai trước khi chờ scrypt (xem rateLimit.ts): request gửi cùng lúc thấy
    // lượt này ngay. Đăng nhập đúng thì trả lại, không chiếm lượt sai; lần sai thì giữ đủ 15 phút
    // (đăng nhập đúng sau đó cũng không xoá các lần sai đã có).
    loginFailures.hit(userKey, reservedAt);
    loginFailures.hit(ipKey, reservedAt);

    let ok = false;
    let user: LoginUserRow | undefined;
    try {
      user = findUserByUsername(db, body.username);
      // Không có tên đó, chưa có mật khẩu (tài khoản cũ) hay bị khoá thì vẫn chạy scrypt trên hash giả,
      // để thời gian trả lời không lộ tên nào đã có. Mọi trường hợp sai đều cùng một lỗi.
      const stored = user?.password_hash ?? (await DUMMY_PASSWORD_HASH);
      const passwordOk = await verifyPassword(body.password, stored);
      ok = user !== undefined && user.password_hash !== null && user.disabled === 0 && passwordOk;
    } finally {
      if (ok) {
        loginFailures.release(userKey, reservedAt);
        loginFailures.release(ipKey, reservedAt);
      }
    }
    // `ok` đúng thì `user` chắc chắn có; kiểm lại để TypeScript thu hẹp kiểu.
    const found = user;
    if (!ok || !found) return void res.status(401).json({ error: 'invalid_credentials' });

    // Mỗi máy một phiên; không thu hồi phiên của máy khác (có thể đang giữ phiếu chưa gửi).
    const token = newSessionToken();
    tx(db, () => insertSession(db, found.id, token, new Date().toISOString()));
    const out: AuthResponse = { token, user: toAuthUser(found) };
    res.json(out);
  });

  r.post('/logout', requireAuth, (req, res) => {
    if (!req.sessionHash) throw new Error('req.sessionHash chưa có: /logout phải đi qua requireAuth');
    const sessionHash = req.sessionHash;
    // Chỉ phiên của máy đang gửi; máy khác của cùng người vẫn đăng nhập.
    tx(db, () => deleteSession(db, sessionHash));
    res.status(204).end();
  });

  return r;
}
