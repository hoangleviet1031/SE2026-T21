import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createAuth, getCtx, hashToken } from '../src/auth';
import { openDb } from '../src/db';

// Dữ liệu: hai dự án; lan = supervisor ở yte, minh = surveyor ở yte, vy = chỉ ở nongnghiep,
// root = admin không là thành viên dự án nào, off = bị vô hiệu hoá dù còn là thành viên.
const TOKENS = {
  lan: 'token-lan',
  minh: 'token-minh',
  vy: 'token-vy',
  root: 'token-root',
  off: 'token-off',
};

let server: Server;
let base: string;

beforeAll(async () => {
  const db = openDb(':memory:');
  const now = '2026-10-08T00:00:00Z';
  const addProject = db.prepare(`INSERT INTO projects (id, name, archived, created_at) VALUES (?, ?, ?, ?)`);
  addProject.run('yte', 'Y tế', 0, now);
  addProject.run('nongnghiep', 'Nông nghiệp', 0, now);
  addProject.run('cu', 'Dự án đã lưu trữ', 1, now);

  const addUser = db.prepare(
    `INSERT INTO users (id, name, token_hash, is_admin, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  addUser.run('lan', 'Lan', hashToken(TOKENS.lan), 0, 0, now);
  addUser.run('minh', 'Minh', hashToken(TOKENS.minh), 0, 0, now);
  addUser.run('vy', 'Vy', hashToken(TOKENS.vy), 0, 0, now);
  addUser.run('root', 'Quản trị', hashToken(TOKENS.root), 1, 0, now);
  addUser.run('off', 'Đã khoá', hashToken(TOKENS.off), 0, 1, now);

  const addMember = db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`);
  addMember.run('yte', 'lan', 'supervisor', now);
  addMember.run('yte', 'minh', 'surveyor', now);
  addMember.run('nongnghiep', 'vy', 'surveyor', now);
  addMember.run('yte', 'off', 'supervisor', now);
  addMember.run('cu', 'lan', 'supervisor', now);

  const { requireAuth, requireMember } = createAuth(db);
  const app = express();
  app.use(express.json());
  app.get('/api/whoami', requireAuth, (req, res) => {
    res.json(req.user);
  });
  const projects = express.Router({ mergeParams: true });
  projects.get('/surveyor-route', requireMember('surveyor'), (req, res) => {
    res.json(getCtx(req));
  });
  projects.post('/surveyor-route', requireMember('surveyor'), (req, res) => {
    res.json(getCtx(req));
  });
  projects.get('/supervisor-route', requireMember('supervisor'), (req, res) => {
    res.json(getCtx(req));
  });
  app.use('/api/projects/:projectId', requireAuth, projects);

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

function get(path: string, token?: string, scheme = 'Bearer') {
  return fetch(`${base}${path}`, { headers: token ? { Authorization: `${scheme} ${token}` } : {} });
}

describe('hashToken', () => {
  it('là SHA-256 dạng hex, ổn định và không trả lại token', () => {
    const h = hashToken('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('abc')).toBe(h);
    expect(h).not.toContain('abc');
  });
});

describe('requireAuth', () => {
  it('A1: không có token thì 401 unauthorized', async () => {
    const res = await get('/api/projects/yte/surveyor-route');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('token sai thì 401', async () => {
    const res = await get('/api/projects/yte/surveyor-route', 'khong-ton-tai');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('sai kiểu Authorization (không phải Bearer) thì 401', async () => {
    const res = await get('/api/projects/yte/surveyor-route', TOKENS.lan, 'Basic');
    expect(res.status).toBe(401);
  });

  it('Bearer rỗng thì 401', async () => {
    const res = await fetch(`${base}/api/whoami`, { headers: { Authorization: 'Bearer ' } });
    expect(res.status).toBe(401);
  });

  it('người dùng bị vô hiệu hoá thì 401 dù token đúng và còn là thành viên', async () => {
    const res = await get('/api/projects/yte/surveyor-route', TOKENS.off);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('token đúng thì gắn req.user, không lộ token_hash', async () => {
    const res = await get('/api/whoami', TOKENS.root);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'root', name: 'Quản trị', isAdmin: true });
  });
});

describe('requireMember', () => {
  it('thành viên đủ vai trò thì gắn ctx từ đường dẫn và token', async () => {
    const res = await get('/api/projects/yte/surveyor-route', TOKENS.minh);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'minh', projectId: 'yte', role: 'surveyor' });
  });

  it('supervisor vào được route yêu cầu surveyor', async () => {
    const res = await get('/api/projects/yte/surveyor-route', TOKENS.lan);
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('supervisor');
  });

  it('không là thành viên dự án thì 403 not_member', async () => {
    const res = await get('/api/projects/nongnghiep/surveyor-route', TOKENS.minh);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_member' });
  });

  it('T4: admin không là thành viên thì 403 not_member (admin không tự đọc dữ liệu dự án)', async () => {
    const res = await get('/api/projects/yte/surveyor-route', TOKENS.root);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_member' });
  });

  it('dự án không tồn tại trả 403 not_member, giống dự án của người khác (không lộ thông tin)', async () => {
    const res = await get('/api/projects/khong-co/surveyor-route', TOKENS.lan);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_member' });
  });

  it('dự án đã lưu trữ thì 403 not_member kể cả với thành viên', async () => {
    const res = await get('/api/projects/cu/surveyor-route', TOKENS.lan);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_member' });
  });

  it('là thành viên nhưng thiếu vai trò thì 403 forbidden', async () => {
    const res = await get('/api/projects/yte/supervisor-route', TOKENS.minh);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('supervisor vào được route yêu cầu supervisor', async () => {
    const res = await get('/api/projects/yte/supervisor-route', TOKENS.lan);
    expect(res.status).toBe(200);
  });

  it('projectId chỉ lấy từ đường dẫn, không từ query hay body', async () => {
    // minh chỉ thuộc yte; query và body cố ép sang nongnghiep
    const viaQuery = await get('/api/projects/yte/surveyor-route?projectId=nongnghiep', TOKENS.minh);
    expect((await viaQuery.json()).projectId).toBe('yte');

    const viaBody = await fetch(`${base}/api/projects/yte/surveyor-route`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKENS.minh}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'nongnghiep', userId: 'vy', role: 'supervisor' }),
    });
    expect(await viaBody.json()).toEqual({ userId: 'minh', projectId: 'yte', role: 'surveyor' });
  });
});
