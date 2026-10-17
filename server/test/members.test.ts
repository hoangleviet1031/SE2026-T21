import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Member, ProjectSettings, Role } from '@field-survey/shared';
import { DEMO_USER_IDS } from '../src/seedDemo';
import { insertSession, insertUser, newSessionToken } from '../src/repo/users';
import { createTestServer, type TestServer } from './fixtures';

// P/members, P/settings (TV1-08): ca M1, M2, A6, A7, Q9, D2 ở design §10.1 và ADR 0003 Kiểm chứng.

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer();
});
afterAll(() => t.close());

function call(method: string, path: string, token: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${t.base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const members = (projectId: string) => `/projects/${projectId}/members`;
const settings = (projectId: string) => `/projects/${projectId}/settings`;

interface TestUser {
  id: string;
  username: string;
  token: string;
}

let seq = 0;

/**
 * Tài khoản mới ghi thẳng vào CSDL. Không đi qua /auth/register vì giới hạn 5 tài khoản/giờ/IP
 * (ADR 0003 §1) sẽ làm hỏng test.
 */
function newUser(): TestUser {
  seq += 1;
  const username = `m${seq}.user`;
  const now = new Date().toISOString();
  const id = insertUser(t.db, { username, name: `Người ${seq}`, passwordHash: 'x', now });
  const token = newSessionToken();
  insertSession(t.db, id, token, now);
  return { id, username, token };
}

/** Dự án riêng cho mỗi test để không phụ thuộc thứ tự chạy. */
function newProject(roles: Array<[TestUser, Role]>): string {
  seq += 1;
  const projectId = `m-${seq}`;
  const now = new Date().toISOString();
  t.db.prepare(`INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`).run(projectId, `Dự án ${seq}`, now);
  const add = t.db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`);
  for (const [user, role] of roles) add.run(projectId, user.id, role, now);
  return projectId;
}

function membership(projectId: string, userId: string) {
  return t.db
    .prepare(`SELECT role, added_at, added_by FROM memberships WHERE project_id = ? AND user_id = ?`)
    .get(projectId, userId) as { role: string; added_at: string; added_by: string | null } | undefined;
}

async function errorOf(res: Response): Promise<{ status: number; error: unknown }> {
  return { status: res.status, error: ((await res.json()) as { error?: unknown }).error };
}

describe('GET P/members', () => {
  it('supervisor thấy danh sách: Owner trước, đủ tên đăng nhập và tên hiển thị', async () => {
    const res = await call('GET', members(t.projects.yte), t.tokens.lan);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Member[];
    expect(list[0]).toMatchObject({ userId: DEMO_USER_IDS.chu, username: 'chu', name: 'Chủ (demo)', role: 'owner' });
    expect(list.map((m) => m.userId)).toEqual(expect.arrayContaining([DEMO_USER_IDS.lan, DEMO_USER_IDS.minh]));
    expect(list.every((m) => typeof m.addedAt === 'string')).toBe(true);
  });

  it('surveyor → 403 forbidden', async () => {
    expect(await errorOf(await call('GET', members(t.projects.yte), t.tokens.minh))).toEqual({
      status: 403,
      error: 'forbidden',
    });
  });

  it('không thuộc dự án (kể cả admin) → 403 not_member', async () => {
    for (const token of [t.tokens.minh, t.tokens.admin]) {
      expect(await errorOf(await call('GET', members(t.projects.nongnghiep), token))).toEqual({
        status: 403,
        error: 'not_member',
      });
    }
  });
});

describe('POST P/members', () => {
  it('M1: supervisor thêm surveyor bằng tên đăng nhập (không phân biệt hoa thường) → 201, ghi added_by', async () => {
    const sup = newUser();
    const owner = newUser();
    const projectId = newProject([[owner, 'owner'], [sup, 'supervisor']]);
    const target = newUser();

    const res = await call('POST', members(projectId), sup.token, { username: ` ${target.username.toUpperCase()} `, role: 'surveyor' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ userId: target.id, username: target.username, role: 'surveyor' });
    expect(membership(projectId, target.id)).toMatchObject({ role: 'surveyor', added_by: sup.id });

    // Người được thêm thấy dự án ở /me (luồng T6).
    const me = (await (await call('GET', '/me', target.token)).json()) as { projects: Array<{ id: string; role: Role }> };
    expect(me.projects).toContainEqual(expect.objectContaining({ id: projectId, role: 'surveyor' }));
  });

  it('M1: supervisor thêm supervisor hoặc Owner → 403 forbidden, không ghi gì', async () => {
    const sup = newUser();
    const projectId = newProject([[newUser(), 'owner'], [sup, 'supervisor']]);
    const target = newUser();
    for (const role of ['supervisor', 'owner'] as const) {
      expect(await errorOf(await call('POST', members(projectId), sup.token, { username: target.username, role }))).toEqual({
        status: 403,
        error: 'forbidden',
      });
    }
    expect(membership(projectId, target.id)).toBeUndefined();
  });

  it('M2: Owner thêm supervisor và Owner → 201', async () => {
    const owner = newUser();
    const projectId = newProject([[owner, 'owner']]);
    const sup = newUser();
    const owner2 = newUser();
    expect((await call('POST', members(projectId), owner.token, { username: sup.username, role: 'supervisor' })).status).toBe(201);
    expect((await call('POST', members(projectId), owner.token, { username: owner2.username, role: 'owner' })).status).toBe(201);
    expect(membership(projectId, sup.id)?.role).toBe('supervisor');
    expect(membership(projectId, owner2.id)).toMatchObject({ role: 'owner', added_by: owner.id });
  });

  it('M2: tên không có → 404 not_found; người đã là thành viên → 409 already_member', async () => {
    const owner = newUser();
    const member = newUser();
    const projectId = newProject([[owner, 'owner'], [member, 'surveyor']]);
    expect(await errorOf(await call('POST', members(projectId), owner.token, { username: 'khong.co.ai', role: 'surveyor' }))).toEqual({
      status: 404,
      error: 'not_found',
    });
    expect(await errorOf(await call('POST', members(projectId), owner.token, { username: member.username, role: 'supervisor' }))).toEqual({
      status: 409,
      error: 'already_member',
    });
    // Không lặng lẽ đổi vai trò người đã có.
    expect(membership(projectId, member.id)?.role).toBe('surveyor');
  });

  it('Q9: thêm tài khoản admin → 409 admin_account (Owner hay supervisor đều vậy)', async () => {
    const owner = newUser();
    const sup = newUser();
    const projectId = newProject([[owner, 'owner'], [sup, 'supervisor']]);
    expect(await errorOf(await call('POST', members(projectId), owner.token, { username: 'admin', role: 'owner' }))).toEqual({
      status: 409,
      error: 'admin_account',
    });
    expect(await errorOf(await call('POST', members(projectId), sup.token, { username: 'ADMIN', role: 'surveyor' }))).toEqual({
      status: 409,
      error: 'admin_account',
    });
    expect(membership(projectId, DEMO_USER_IDS.admin)).toBeUndefined();
  });

  it('thân sai → 400 invalid_body; surveyor → 403 forbidden', async () => {
    const owner = newUser();
    const surveyor = newUser();
    const projectId = newProject([[owner, 'owner'], [surveyor, 'surveyor']]);
    expect(await errorOf(await call('POST', members(projectId), owner.token, { username: 'x', role: 'admin' }))).toEqual({
      status: 400,
      error: 'invalid_body',
    });
    expect(await errorOf(await call('POST', members(projectId), surveyor.token, { username: newUser().username, role: 'surveyor' }))).toEqual({
      status: 403,
      error: 'forbidden',
    });
  });
});

describe('PUT, DELETE P/members/:userId', () => {
  it('supervisor rút surveyor → 204; không đổi, không rút được supervisor, Owner hay chính mình', async () => {
    const owner = newUser();
    const sup = newUser();
    const sup2 = newUser();
    const surveyor = newUser();
    const projectId = newProject([[owner, 'owner'], [sup, 'supervisor'], [sup2, 'supervisor'], [surveyor, 'surveyor']]);

    expect(await errorOf(await call('PUT', `${members(projectId)}/${surveyor.id}`, sup.token, { role: 'supervisor' }))).toEqual({
      status: 403,
      error: 'forbidden',
    });
    for (const target of [owner, sup2, sup]) {
      expect(await errorOf(await call('PUT', `${members(projectId)}/${target.id}`, sup.token, { role: 'surveyor' }))).toEqual({
        status: 403,
        error: 'forbidden',
      });
      expect(await errorOf(await call('DELETE', `${members(projectId)}/${target.id}`, sup.token))).toEqual({
        status: 403,
        error: 'forbidden',
      });
    }

    expect((await call('DELETE', `${members(projectId)}/${surveyor.id}`, sup.token)).status).toBe(204);
    expect(membership(projectId, surveyor.id)).toBeUndefined();
  });

  it('Owner đổi vai trò: giữ added_at, ghi added_by người đổi', async () => {
    const owner = newUser();
    const surveyor = newUser();
    const projectId = newProject([[owner, 'owner'], [surveyor, 'surveyor']]);
    const before = membership(projectId, surveyor.id);

    const res = await call('PUT', `${members(projectId)}/${surveyor.id}`, owner.token, { role: 'supervisor' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ userId: surveyor.id, role: 'supervisor' });
    expect(membership(projectId, surveyor.id)).toEqual({ role: 'supervisor', added_at: before?.added_at, added_by: owner.id });
  });

  it('userId không thuộc dự án này (kể cả người ở dự án khác) → 404 not_found', async () => {
    const owner = newUser();
    const projectId = newProject([[owner, 'owner']]);
    const elsewhere = newUser();
    newProject([[elsewhere, 'surveyor']]);
    for (const id of [elsewhere.id, 'u_khongco']) {
      expect(await errorOf(await call('PUT', `${members(projectId)}/${id}`, owner.token, { role: 'surveyor' }))).toEqual({
        status: 404,
        error: 'not_found',
      });
      expect(await errorOf(await call('DELETE', `${members(projectId)}/${id}`, owner.token))).toEqual({
        status: 404,
        error: 'not_found',
      });
    }
  });

  it('A7: rút hoặc hạ Owner cuối cùng → 409 last_owner; còn Owner khác thì được', async () => {
    const owner = newUser();
    const owner2 = newUser();
    const projectId = newProject([[owner, 'owner']]);

    expect(await errorOf(await call('DELETE', `${members(projectId)}/${owner.id}`, owner.token))).toEqual({
      status: 409,
      error: 'last_owner',
    });
    expect(await errorOf(await call('PUT', `${members(projectId)}/${owner.id}`, owner.token, { role: 'supervisor' }))).toEqual({
      status: 409,
      error: 'last_owner',
    });
    // Giữ nguyên vai trò Owner thì không chặn.
    expect((await call('PUT', `${members(projectId)}/${owner.id}`, owner.token, { role: 'owner' })).status).toBe(200);

    expect((await call('POST', members(projectId), owner.token, { username: owner2.username, role: 'owner' })).status).toBe(201);
    expect((await call('PUT', `${members(projectId)}/${owner.id}`, owner.token, { role: 'supervisor' })).status).toBe(200);
    // owner2 giờ là Owner cuối cùng.
    expect(await errorOf(await call('DELETE', `${members(projectId)}/${owner2.id}`, owner2.token))).toEqual({
      status: 409,
      error: 'last_owner',
    });
    expect(membership(projectId, owner2.id)?.role).toBe('owner');
  });
});

describe('PATCH P/settings', () => {
  it('D2: Owner đổi tên và bật/tắt công khai → 200, cột public đổi đúng', async () => {
    const owner = newUser();
    const projectId = newProject([[owner, 'owner']]);
    const publicOf = () => (t.db.prepare(`SELECT name, public FROM projects WHERE id = ?`).get(projectId) as { name: string; public: number });

    const res = await call('PATCH', settings(projectId), owner.token, { name: '  Y tế Tân Lập  ', public: true });
    expect(res.status).toBe(200);
    expect((await res.json()) as ProjectSettings).toEqual({ name: 'Y tế Tân Lập', public: true });
    expect(publicOf()).toEqual({ name: 'Y tế Tân Lập', public: 1 });

    const res2 = await call('PATCH', settings(projectId), owner.token, { public: false });
    expect(await res2.json()).toEqual({ name: 'Y tế Tân Lập', public: false });
    expect(publicOf().public).toBe(0);

    // /me thấy tên mới.
    const me = (await (await call('GET', '/me', owner.token)).json()) as { projects: Array<{ id: string; name: string }> };
    expect(me.projects).toContainEqual(expect.objectContaining({ id: projectId, name: 'Y tế Tân Lập' }));
  });

  it('D2: supervisor, surveyor → 403 forbidden; người ngoài → 403 not_member; thân sai → 400', async () => {
    const owner = newUser();
    const sup = newUser();
    const surveyor = newUser();
    const projectId = newProject([[owner, 'owner'], [sup, 'supervisor'], [surveyor, 'surveyor']]);
    for (const user of [sup, surveyor]) {
      expect(await errorOf(await call('PATCH', settings(projectId), user.token, { public: true }))).toEqual({
        status: 403,
        error: 'forbidden',
      });
    }
    expect(await errorOf(await call('PATCH', settings(projectId), t.tokens.admin, { public: true }))).toEqual({
      status: 403,
      error: 'not_member',
    });
    expect(await errorOf(await call('PATCH', settings(projectId), owner.token, {}))).toEqual({
      status: 400,
      error: 'invalid_body',
    });
    expect((t.db.prepare(`SELECT public FROM projects WHERE id = ?`).get(projectId) as { public: number }).public).toBe(0);
  });
});

describe('A6: quyền ở tổ chức này không có hiệu lực ở tổ chức khác', () => {
  it('owner ở A, surveyor ở B: sửa form, PATCH P/settings, thêm người được ở A; 403 forbidden ở B', async () => {
    const user = newUser();
    const a = newProject([[user, 'owner']]);
    const b = newProject([[newUser(), 'owner'], [user, 'surveyor']]);
    const form = { id: 'a6', title: 'A6', fields: [{ id: 'q', type: 'text', label: 'Hỏi' }] };

    expect((await call('POST', `/projects/${a}/forms`, user.token, form)).status).toBe(201);
    expect((await call('PATCH', settings(a), user.token, { public: true })).status).toBe(200);
    expect((await call('POST', members(a), user.token, { username: newUser().username, role: 'supervisor' })).status).toBe(201);

    for (const [method, path, body] of [
      ['POST', `/projects/${b}/forms`, form],
      ['PATCH', settings(b), { public: true }],
      ['POST', members(b), { username: newUser().username, role: 'surveyor' }],
    ] as const) {
      expect(await errorOf(await call(method, path, user.token, body))).toEqual({ status: 403, error: 'forbidden' });
    }
  });
});
