import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminProjectRequest, DirectoryEntry, MeResponse, ProjectRequest, Role } from '@field-survey/shared';
import { DEMO_USER_IDS } from '../src/seedDemo';
import { insertSession, insertUser, newSessionToken } from '../src/repo/users';
import { createTestServer, type TestServer } from './fixtures';

// Yêu cầu mở tổ chức và danh bạ công khai (TV2-15): ca Q1–Q7, D1 ở design §10.1 và ADR 0003 Kiểm chứng.

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer();
});
afterAll(() => t.close());

function call(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${t.base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

interface TestUser {
  id: string;
  username: string;
  token: string;
}

let seq = 0;

/** Tài khoản mới ghi thẳng vào CSDL, không qua /auth/register vì giới hạn 5 tài khoản/giờ/IP. */
function newUser(): TestUser {
  seq += 1;
  const username = `q${seq}.user`;
  const now = new Date().toISOString();
  const id = insertUser(t.db, { username, name: `Người ${seq}`, passwordHash: 'x', now });
  const token = newSessionToken();
  insertSession(t.db, id, token, now);
  return { id, username, token };
}

function newProject(opts: { roles?: Array<[TestUser, Role]>; public?: boolean; archived?: boolean } = {}): string {
  seq += 1;
  const projectId = `q-${seq}`;
  const now = new Date().toISOString();
  t.db
    .prepare(`INSERT INTO projects (id, name, archived, public, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(projectId, `Tổ chức ${seq}`, opts.archived ? 1 : 0, opts.public ? 1 : 0, now);
  const add = t.db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`);
  for (const [user, role] of opts.roles ?? []) add.run(projectId, user.id, role, now);
  return projectId;
}

async function submit(user: TestUser, body: unknown = { name: 'HTX Rau sạch', note: '200 hộ' }) {
  return call('POST', '/project-requests', user.token, body);
}

async function submitOk(user: TestUser, name = 'HTX Rau sạch'): Promise<ProjectRequest> {
  const res = await submit(user, { name });
  expect(res.status).toBe(201);
  return (await res.json()) as ProjectRequest;
}

function decide(id: string, body: unknown, token = t.tokens.admin) {
  return call('POST', `/admin/project-requests/${id}`, token, body);
}

async function myRequests(user: TestUser): Promise<ProjectRequest[]> {
  const res = await call('GET', '/project-requests', user.token);
  expect(res.status).toBe(200);
  return (await res.json()) as ProjectRequest[];
}

async function me(token: string): Promise<MeResponse> {
  const res = await call('GET', '/me', token);
  expect(res.status).toBe(200);
  return (await res.json()) as MeResponse;
}

function projectCount(): number {
  return (t.db.prepare(`SELECT COUNT(*) AS n FROM projects`).get() as { n: number }).n;
}

describe('POST /api/project-requests', () => {
  it('Q1: gửi yêu cầu → 201 pending; chưa tạo tổ chức nào, /me vẫn rỗng', async () => {
    const hoa = newUser();
    const before = projectCount();
    const res = await submit(hoa, { name: '  HTX Rau sạch ', note: ' 200 hộ ' });
    expect(res.status).toBe(201);
    const created = (await res.json()) as ProjectRequest;
    expect(created).toEqual({
      id: expect.any(String),
      name: 'HTX Rau sạch',
      note: '200 hộ',
      status: 'pending',
      createdAt: expect.any(String),
    });
    expect(projectCount()).toBe(before);
    expect((await me(hoa.token)).projects).toEqual([]);
    expect(await myRequests(hoa)).toEqual([created]);
  });

  it('thân sai trả 400 invalid_body', async () => {
    const hoa = newUser();
    for (const body of [{}, { name: '   ' }, { name: 'x'.repeat(101) }, { name: 'A', note: 'y'.repeat(501) }, { name: 5 }]) {
      const res = await submit(hoa, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toBe('invalid_body');
    }
    expect(await myRequests(hoa)).toEqual([]);
  });

  it('không có token trả 401', async () => {
    expect((await call('POST', '/project-requests', undefined, { name: 'A' })).status).toBe(401);
    expect((await call('GET', '/project-requests')).status).toBe(401);
  });

  it('Q5: đang có yêu cầu chờ thì yêu cầu thứ hai → 409 project_limit_reached', async () => {
    const hoa = newUser();
    await submitOk(hoa);
    const res = await submit(hoa, { name: 'Tổ chức thứ hai' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('project_limit_reached');
    expect(await myRequests(hoa)).toHaveLength(1);
  });

  it('Q5: đã là Owner của 3 tổ chức chưa lưu trữ → 409; tổ chức đã lưu trữ không tính', async () => {
    const hoa = newUser();
    newProject({ roles: [[hoa, 'owner']] });
    newProject({ roles: [[hoa, 'owner']] });
    newProject({ roles: [[hoa, 'owner']], archived: true });
    newProject({ roles: [[hoa, 'supervisor']] });
    // 2 tổ chức chưa lưu trữ: còn gửi được
    await submitOk(hoa);

    const lan = newUser();
    for (let i = 0; i < 3; i++) newProject({ roles: [[lan, 'owner']] });
    const res = await submit(lan);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('project_limit_reached');
  });

  it('Q3: bị từ chối thì gửi được yêu cầu mới', async () => {
    const hoa = newUser();
    const first = await submitOk(hoa);
    expect((await decide(first.id, { decision: 'reject', reason: 'Thiếu thông tin' })).status).toBe(200);
    await submitOk(hoa, 'Lần hai');
  });
});

describe('GET /api/project-requests', () => {
  it('chỉ trả yêu cầu của chính mình, mới nhất trước', async () => {
    const hoa = newUser();
    const other = newUser();
    const a = await submitOk(hoa, 'Lần một');
    await decide(a.id, { decision: 'reject', reason: 'Trùng' });
    const b = await submitOk(hoa, 'Lần hai');
    await submitOk(other, 'Của người khác');
    expect((await myRequests(hoa)).map((r) => r.id)).toEqual([b.id, a.id]);
  });
});

describe('DELETE /api/project-requests/:id', () => {
  it('huỷ yêu cầu đang chờ của mình → 204, trạng thái cancelled, gửi được yêu cầu mới', async () => {
    const hoa = newUser();
    const req = await submitOk(hoa);
    const res = await call('DELETE', `/project-requests/${req.id}`, hoa.token);
    expect(res.status).toBe(204);
    expect(await myRequests(hoa)).toEqual([{ ...req, status: 'cancelled' }]);
    await submitOk(hoa, 'Lần hai');
  });

  it('Q6: huỷ yêu cầu của người khác, yêu cầu đã xử lý hoặc không có → 404', async () => {
    const hoa = newUser();
    const other = newUser();
    const req = await submitOk(hoa);
    const res = await call('DELETE', `/project-requests/${req.id}`, other.token);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
    expect((await myRequests(hoa))[0]?.status).toBe('pending');

    expect((await decide(req.id, { decision: 'reject', reason: 'Trùng' })).status).toBe(200);
    expect((await call('DELETE', `/project-requests/${req.id}`, hoa.token)).status).toBe(404);
    expect((await call('DELETE', '/project-requests/khong-co', hoa.token)).status).toBe(404);
  });
});

describe('/api/admin/project-requests', () => {
  it('Q4: người thường gọi → 403 forbidden, không có gì đổi', async () => {
    const hoa = newUser();
    const req = await submitOk(hoa);
    const calls = [
      call('GET', '/admin/project-requests', hoa.token),
      call('GET', '/admin/project-requests?status=pending', t.tokens.chu),
      decide(req.id, { decision: 'approve' }, hoa.token),
      decide(req.id, { decision: 'approve' }, t.tokens.chu),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('forbidden');
    }
    expect((await myRequests(hoa))[0]?.status).toBe('pending');
  });

  it('GET mặc định trả yêu cầu đang chờ, cũ nhất trước, kèm người gửi', async () => {
    const hoa = newUser();
    const lan = newUser();
    const a = await submitOk(hoa, 'Của Hoa');
    const b = await submitOk(lan, 'Của Lan');
    const res = await call('GET', '/admin/project-requests', t.tokens.admin);
    expect(res.status).toBe(200);
    const list = (await res.json()) as AdminProjectRequest[];
    const ids = list.map((r) => r.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    expect(list.find((r) => r.id === a.id)).toEqual({
      id: a.id,
      name: 'Của Hoa',
      user: { id: hoa.id, username: hoa.username, name: expect.any(String) },
      createdAt: a.createdAt,
    });
  });

  it('GET ?status= lọc theo trạng thái; giá trị lạ → 400', async () => {
    const hoa = newUser();
    const req = await submitOk(hoa);
    await decide(req.id, { decision: 'reject', reason: 'Trùng' });
    const pending = (await (await call('GET', '/admin/project-requests', t.tokens.admin)).json()) as AdminProjectRequest[];
    expect(pending.map((r) => r.id)).not.toContain(req.id);
    const rejected = (await (
      await call('GET', '/admin/project-requests?status=rejected', t.tokens.admin)
    ).json()) as AdminProjectRequest[];
    expect(rejected.map((r) => r.id)).toContain(req.id);

    const bad = await call('GET', '/admin/project-requests?status=all', t.tokens.admin);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('invalid_body');
  });

  it('Q2: duyệt → tổ chức p-xxxxxxxx, người gửi là owner (added_by = admin), admin không có membership', async () => {
    const hoa = newUser();
    const req = await submitOk(hoa, 'HTX Rau sạch');
    const res = await decide(req.id, { decision: 'approve' });
    expect(res.status).toBe(200);
    const { projectId } = (await res.json()) as { projectId: string };
    expect(projectId).toMatch(/^p-[a-z0-9]{8}$/);

    const project = t.db.prepare(`SELECT name, public, archived FROM projects WHERE id = ?`).get(projectId);
    expect(project).toEqual({ name: 'HTX Rau sạch', public: 0, archived: 0 });
    const rows = t.db.prepare(`SELECT user_id, role, added_by FROM memberships WHERE project_id = ?`).all(projectId);
    expect(rows).toEqual([{ user_id: hoa.id, role: 'owner', added_by: DEMO_USER_IDS.admin }]);
    expect(t.db.prepare(`SELECT 1 FROM memberships WHERE user_id = ?`).get(DEMO_USER_IDS.admin)).toBeUndefined();

    expect((await me(hoa.token)).projects).toEqual([{ id: projectId, name: 'HTX Rau sạch', role: 'owner' }]);
    expect(await myRequests(hoa)).toEqual([{ ...req, status: 'approved', projectId }]);
    // Owner vào được tổ chức mới và lưu được form
    const form = await call('POST', `/projects/${projectId}/forms`, hoa.token, {
      id: 'ho',
      title: 'Hộ',
      fields: [{ id: 'ten', type: 'text', label: 'Tên' }],
    });
    expect(form.status).toBe(201);
  });

  it('Q7: sau khi duyệt, admin gọi P/forms, P/records của tổ chức mới → 403 not_member', async () => {
    const hoa = newUser();
    const req = await submitOk(hoa);
    const { projectId } = (await (await decide(req.id, { decision: 'approve' })).json()) as { projectId: string };
    for (const path of ['/forms', '/records?since=0']) {
      const res = await call('GET', `/projects/${projectId}${path}`, t.tokens.admin);
      expect(res.status, path).toBe(403);
      expect((await res.json()).error).toBe('not_member');
    }
  });

  it('Q3: từ chối kèm lý do → người gửi đọc được lý do, không có tổ chức; thiếu lý do → 400', async () => {
    const hoa = newUser();
    const req = await submitOk(hoa);
    const before = projectCount();

    const noReason = await decide(req.id, { decision: 'reject' });
    expect(noReason.status).toBe(400);
    expect((await noReason.json()).error).toBe('invalid_body');
    expect((await myRequests(hoa))[0]?.status).toBe('pending');

    const res = await decide(req.id, { decision: 'reject', reason: '  Tên tổ chức chưa rõ ' });
    expect(res.status).toBe(200);
    expect(await myRequests(hoa)).toEqual([{ ...req, status: 'rejected', reason: 'Tên tổ chức chưa rõ' }]);
    expect(projectCount()).toBe(before);
    expect((await me(hoa.token)).projects).toEqual([]);
  });

  it('Q6: duyệt hoặc từ chối lại yêu cầu đã xử lý → 409 request_decided; không có → 404', async () => {
    const hoa = newUser();
    const approved = await submitOk(hoa);
    expect((await decide(approved.id, { decision: 'approve' })).status).toBe(200);
    const before = projectCount();
    for (const body of [{ decision: 'approve' }, { decision: 'reject', reason: 'x' }]) {
      const res = await decide(approved.id, body);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('request_decided');
    }
    expect(projectCount()).toBe(before);

    const lan = newUser();
    const cancelled = await submitOk(lan);
    await call('DELETE', `/project-requests/${cancelled.id}`, lan.token);
    expect((await decide(cancelled.id, { decision: 'approve' })).status).toBe(409);

    const missing = await decide('khong-co', { decision: 'approve' });
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe('not_found');
  });

  it('duyệt khi người gửi đã thành Owner của 3 tổ chức trong lúc chờ → 409, yêu cầu vẫn chờ', async () => {
    const hoa = newUser();
    const req = await submitOk(hoa);
    for (let i = 0; i < 3; i++) newProject({ roles: [[hoa, 'owner']] });
    const before = projectCount();
    const res = await decide(req.id, { decision: 'approve' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('project_limit_reached');
    expect(projectCount()).toBe(before);
    expect((await myRequests(hoa))[0]?.status).toBe('pending');
  });

  it('decision sai → 400', async () => {
    const hoa = newUser();
    const req = await submitOk(hoa);
    for (const body of [{}, { decision: 'yes' }]) {
      const res = await decide(req.id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('GET /api/directory', () => {
  async function directory(token: string): Promise<DirectoryEntry[]> {
    const res = await call('GET', '/directory', token);
    expect(res.status).toBe(200);
    return (await res.json()) as DirectoryEntry[];
  }

  it('D1: chỉ id, name của tổ chức công khai, chưa lưu trữ, mình chưa là thành viên', async () => {
    const hoa = newUser();
    const open = newProject({ public: true });
    const closed = newProject();
    const archived = newProject({ public: true, archived: true });
    const mine = newProject({ public: true, roles: [[hoa, 'surveyor']] });

    const list = await directory(hoa.token);
    const ids = list.map((e) => e.id);
    expect(ids).toContain(open);
    expect(ids).not.toContain(closed);
    expect(ids).not.toContain(archived);
    expect(ids).not.toContain(mine);
    for (const entry of list) expect(Object.keys(entry).sort()).toEqual(['id', 'name']);
    expect(list.find((e) => e.id === open)).toEqual({ id: open, name: expect.any(String) });
  });

  it('D2 (vế D1): Owner bật công khai thì tổ chức hiện, tắt thì ẩn', async () => {
    const owner = newUser();
    const hoa = newUser();
    const projectId = newProject({ roles: [[owner, 'owner']] });
    expect((await directory(hoa.token)).map((e) => e.id)).not.toContain(projectId);

    expect((await call('PATCH', `/projects/${projectId}/settings`, owner.token, { public: true })).status).toBe(200);
    expect((await directory(hoa.token)).map((e) => e.id)).toContain(projectId);

    expect((await call('PATCH', `/projects/${projectId}/settings`, owner.token, { public: false })).status).toBe(200);
    expect((await directory(hoa.token)).map((e) => e.id)).not.toContain(projectId);
  });

  it('không có token trả 401', async () => {
    expect((await call('GET', '/directory')).status).toBe(401);
  });
});
