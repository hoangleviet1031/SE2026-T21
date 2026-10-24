import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminProject, AdminUser, MeResponse } from '@field-survey/shared';
import { DEMO_USER_IDS } from '../src/seedDemo';
import { hashPassword } from '../src/password';
import { insertSession, insertUser, newSessionToken } from '../src/repo/users';
import { createTestServer, type TestServer } from './fixtures';

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer();
});
afterAll(() => t.close());

function call(method: string, path: string, token?: string, body?: object) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${t.base}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function me(token: string): Promise<MeResponse> {
  const res = await call('GET', '/me', token);
  expect(res.status).toBe(200);
  return (await res.json()) as MeResponse;
}

/** Dự án ghi thẳng vào CSDL: từ TV2-15 admin không tạo dự án được nữa (chỉ tạo khi duyệt yêu cầu). */
function insertProject(id: string, name: string, opts: { archived?: boolean } = {}) {
  t.db
    .prepare(`INSERT INTO projects (id, name, archived, created_at) VALUES (?, ?, ?, 'now')`)
    .run(id, name, opts.archived ? 1 : 0);
}

describe('GET /api/me', () => {
  it('trả người dùng và các dự án kèm vai trò', async () => {
    expect(await me(t.tokens.lan)).toEqual({
      user: { id: DEMO_USER_IDS.lan, username: 'lan', name: 'lan', isAdmin: false },
      projects: [
        { id: t.projects.nongnghiep, name: 'Nông nghiệp (demo)', role: 'surveyor' },
        { id: t.projects.yte, name: expect.any(String), role: 'supervisor' },
      ],
    });
  });

  it('admin không là thành viên dự án nào thì danh sách rỗng', async () => {
    expect(await me(t.tokens.admin)).toEqual({
      user: { id: DEMO_USER_IDS.admin, username: 'admin', name: 'admin', isAdmin: true },
      projects: [],
    });
  });

  it('không có token hoặc token sai trả 401', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
    expect((await call('GET', '/me', 'sai')).status).toBe(401);
  });

  it('không chứa dự án đã bị rút', async () => {
    t.db.prepare(`INSERT INTO projects (id, name, created_at) VALUES ('rut', 'Sẽ rút', 'now')`).run();
    t.db
      .prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES ('rut', ?, 'surveyor', 'now')`)
      .run(DEMO_USER_IDS.minh);
    expect((await me(t.tokens.minh)).projects.map((p) => p.id)).toContain('rut');

    t.db.prepare(`DELETE FROM memberships WHERE project_id = 'rut' AND user_id = ?`).run(DEMO_USER_IDS.minh);
    expect((await me(t.tokens.minh)).projects.map((p) => p.id)).not.toContain('rut');
  });

  it('không chứa dự án đã lưu trữ', async () => {
    t.db.prepare(`INSERT INTO projects (id, name, created_at) VALUES ('luu-tru', 'Sẽ lưu trữ', 'now')`).run();
    t.db
      .prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES ('luu-tru', ?, 'surveyor', 'now')`)
      .run(DEMO_USER_IDS.minh);
    const res = await call('PATCH', '/admin/projects/luu-tru', t.tokens.admin, { archived: true });
    expect(res.status).toBe(200);
    expect((await me(t.tokens.minh)).projects.map((p) => p.id)).not.toContain('luu-tru');
  });
});

describe('/api/admin/projects', () => {
  it('người thường gọi mọi route admin trả 403 forbidden', async () => {
    const calls = [
      call('GET', '/admin/projects', t.tokens.lan),
      call('PATCH', `/admin/projects/${t.projects.yte}`, t.tokens.lan, { archived: true }),
      call('PUT', `/admin/projects/${t.projects.yte}/owners/minh`, t.tokens.chu),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('forbidden');
    }
    // Không có gì bị đổi
    const row = t.db.prepare(`SELECT archived FROM projects WHERE id = ?`).get(t.projects.yte) as { archived: number };
    expect(row.archived).toBe(0);
    const role = t.db
      .prepare(`SELECT role FROM memberships WHERE project_id = ? AND user_id = ?`)
      .get(t.projects.yte, DEMO_USER_IDS.minh) as { role: string };
    expect(role.role).toBe('surveyor');
  });

  it('không có token trả 401', async () => {
    expect((await call('GET', '/admin/projects')).status).toBe(401);
  });

  it('GET liệt kê mọi dự án, kể cả đã lưu trữ, kèm tên đăng nhập Owner và số thành viên', async () => {
    insertProject('da-dong', 'Đã đóng', { archived: true });
    const res = await call('GET', '/admin/projects', t.tokens.admin);
    expect(res.status).toBe(200);
    const list = (await res.json()) as AdminProject[];
    expect(list).toContainEqual({
      id: 'da-dong',
      name: 'Đã đóng',
      archived: true,
      createdAt: 'now',
      ownerUsernames: [],
      memberCount: 0,
    });
    // demo-yte: chu là Owner; lan, minh, chu là thành viên
    expect(list.find((p) => p.id === t.projects.yte)).toMatchObject({ ownerUsernames: ['chu'], memberCount: 3 });
    // Chỉ thông tin quản trị, không có gì về form, phiếu (Y8)
    for (const p of list) {
      expect(Object.keys(p).sort()).toEqual(['archived', 'createdAt', 'id', 'memberCount', 'name', 'ownerUsernames']);
    }
  });

  it('GET: nhiều Owner thì sắp theo tên đăng nhập', async () => {
    insertProject('hai-owner', 'Hai Owner');
    const add = t.db.prepare(
      `INSERT INTO memberships (project_id, user_id, role, added_at) VALUES ('hai-owner', ?, ?, 'now')`,
    );
    add.run(DEMO_USER_IDS.minh, 'owner');
    add.run(DEMO_USER_IDS.lan, 'owner');
    add.run(DEMO_USER_IDS.chu, 'surveyor');
    const list = (await (await call('GET', '/admin/projects', t.tokens.admin)).json()) as AdminProject[];
    expect(list.find((p) => p.id === 'hai-owner')).toMatchObject({ ownerUsernames: ['lan', 'minh'], memberCount: 3 });
  });

  it('POST /admin/projects không còn (tổ chức chỉ tạo khi duyệt yêu cầu)', async () => {
    const res = await call('POST', '/admin/projects', t.tokens.admin, { id: 'giao-duc', name: 'Giáo dục' });
    expect(res.status).toBe(404);
    expect(t.db.prepare(`SELECT 1 FROM projects WHERE id = 'giao-duc'`).get()).toBeUndefined();
  });

  it('T4: admin không là thành viên thì đọc form, phiếu trả 403 not_member', async () => {
    insertProject('cua-admin', 'Của admin');
    for (const path of ['/forms', '/records?since=0']) {
      const res = await call('GET', `/projects/cua-admin${path}`, t.tokens.admin);
      expect(res.status, path).toBe(403);
      expect((await res.json()).error).toBe('not_member');
    }
  });

  it('PATCH khoá (lưu trữ) và mở lại', async () => {
    insertProject('khoa-mo', 'Khoá mở');
    const archived = await call('PATCH', '/admin/projects/khoa-mo', t.tokens.admin, { archived: true });
    expect(archived.status).toBe(200);
    expect(await archived.json()).toMatchObject({ id: 'khoa-mo', name: 'Khoá mở', archived: true });

    const reopened = await call('PATCH', '/admin/projects/khoa-mo', t.tokens.admin, { archived: false });
    expect(await reopened.json()).toMatchObject({ archived: false });
  });

  it('PATCH chỉ nhận archived: đổi tên, công khai hay thân sai trả 400; dự án không có trả 404', async () => {
    for (const body of [{}, { name: 'Đổi' }, { public: true }, { archived: 'yes' }, { archived: true, name: 'Đổi' }]) {
      const res = await call('PATCH', `/admin/projects/${t.projects.yte}`, t.tokens.admin, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toBe('invalid_body');
    }
    const row = t.db.prepare(`SELECT name, archived FROM projects WHERE id = ?`).get(t.projects.yte) as {
      name: string;
      archived: number;
    };
    expect(row.name).not.toBe('Đổi');
    expect(row.archived).toBe(0);

    const missing = await call('PATCH', '/admin/projects/khong-co', t.tokens.admin, { archived: true });
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe('not_found');
  });

  it('PUT …/members/:userId không còn (thay bằng …/owners/:username)', async () => {
    insertProject('bo-route', 'Bỏ route');
    const res = await call('PUT', `/admin/projects/bo-route/members/${DEMO_USER_IDS.minh}`, t.tokens.admin);
    expect(res.status).toBe(404);
    expect(t.db.prepare(`SELECT 1 FROM memberships WHERE project_id = 'bo-route'`).get()).toBeUndefined();
  });
});

describe('PUT /api/admin/projects/:projectId/owners/:username', () => {
  it('A8: admin chỉ định Owner bằng tên đăng nhập; người đó vào được tổ chức với vai trò owner', async () => {
    insertProject('chua-owner', 'Chưa có Owner');
    expect((await call('GET', '/projects/chua-owner/records?since=0', t.tokens.minh)).status).toBe(403);

    const res = await call('PUT', '/admin/projects/chua-owner/owners/MINH', t.tokens.admin);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projectId: 'chua-owner', userId: DEMO_USER_IDS.minh, role: 'owner' });

    const pull = await call('GET', '/projects/chua-owner/records?since=0', t.tokens.minh);
    expect(pull.status).toBe(200);
    expect((await pull.json()).scope).toBe('all');
    expect((await me(t.tokens.minh)).projects).toContainEqual({
      id: 'chua-owner',
      name: 'Chưa có Owner',
      role: 'owner',
    });
    // Ghi vết ai cấp quyền; admin vẫn không là thành viên (Y8)
    expect(
      t.db
        .prepare(`SELECT added_by FROM memberships WHERE project_id = 'chua-owner' AND user_id = ?`)
        .get(DEMO_USER_IDS.minh),
    ).toEqual({ added_by: DEMO_USER_IDS.admin });
    expect(t.db.prepare(`SELECT 1 FROM memberships WHERE user_id = ?`).get(DEMO_USER_IDS.admin)).toBeUndefined();

    // Gọi lại không đổi gì (idempotent)
    expect((await call('PUT', '/admin/projects/chua-owner/owners/minh', t.tokens.admin)).status).toBe(200);
  });

  it('A8: người thường (kể cả Owner của tổ chức) gọi → 403 forbidden', async () => {
    const res = await call('PUT', `/admin/projects/${t.projects.yte}/owners/lan`, t.tokens.chu);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
    const role = t.db
      .prepare(`SELECT role FROM memberships WHERE project_id = ? AND user_id = ?`)
      .get(t.projects.yte, DEMO_USER_IDS.lan) as { role: string };
    expect(role.role).toBe('supervisor');
  });

  it('nâng thành viên đang có lên owner, giữ added_at', async () => {
    insertProject('nang-owner', 'Nâng Owner');
    t.db
      .prepare(
        `INSERT INTO memberships (project_id, user_id, role, added_at) VALUES ('nang-owner', ?, 'surveyor', 'luc-dau')`,
      )
      .run(DEMO_USER_IDS.lan);
    expect((await call('PUT', '/admin/projects/nang-owner/owners/lan', t.tokens.admin)).status).toBe(200);
    expect(
      t.db
        .prepare(`SELECT role, added_at, added_by FROM memberships WHERE project_id = 'nang-owner' AND user_id = ?`)
        .get(DEMO_USER_IDS.lan),
    ).toEqual({ role: 'owner', added_at: 'luc-dau', added_by: DEMO_USER_IDS.admin });
  });

  it('không có dự án hoặc tên đăng nhập → 404', async () => {
    const noUser = await call('PUT', `/admin/projects/${t.projects.yte}/owners/khongco`, t.tokens.admin);
    expect(noUser.status).toBe(404);
    expect((await noUser.json()).error).toBe('not_found');
    const noProject = await call('PUT', '/admin/projects/khong-co/owners/minh', t.tokens.admin);
    expect(noProject.status).toBe(404);
    expect((await noProject.json()).error).toBe('not_found');
  });

  it('tài khoản admin → 409 admin_account', async () => {
    insertProject('owner-admin', 'Owner admin');
    const res = await call('PUT', '/admin/projects/owner-admin/owners/admin', t.tokens.admin);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('admin_account');
    expect(t.db.prepare(`SELECT 1 FROM memberships WHERE project_id = 'owner-admin'`).get()).toBeUndefined();
  });

  it('vẫn chạy với dự án đã lưu trữ (chuẩn bị trước khi mở lại)', async () => {
    insertProject('tam-dong', 'Tạm đóng', { archived: true });
    const res = await call('PUT', '/admin/projects/tam-dong/owners/minh', t.tokens.admin);
    expect(res.status).toBe(200);
    // Vẫn không vào được khi dự án còn lưu trữ
    expect((await call('GET', '/projects/tam-dong/records?since=0', t.tokens.minh)).status).toBe(403);
  });
});

// A3 (TV2-17, ADR 0003 §8): quản lý tài khoản, cùng hành vi với CLI user:* (dùng chung repo/users.ts).
describe('/api/admin/users', () => {
  const PASSWORD = 'mat-khau-cu-123';
  // Băm một lần cho mọi tài khoản thử: scrypt mỗi lần vài chục ms, ca 55 tài khoản sẽ quá chậm.
  const passwordHash = hashPassword(PASSWORD);
  let seq = 0;

  /** Tài khoản thật đăng nhập được, có hai phiên (hai máy). Ghi thẳng vào CSDL vì đăng ký qua API bị giới hạn. */
  async function newAccount(prefix = 'a3') {
    seq += 1;
    const username = `${prefix}.${seq}`;
    const now = new Date().toISOString();
    const id = insertUser(t.db, { username, name: `Người ${seq}`, passwordHash: await passwordHash, now });
    const tokens: [string, string] = [newSessionToken(), newSessionToken()];
    for (const token of tokens) insertSession(t.db, id, token, now);
    return { id, username, tokens };
  }

  async function loginStatus(username: string, password: string): Promise<number> {
    const res = await fetch(`${t.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.status;
  }

  async function search(q?: string): Promise<AdminUser[]> {
    const path = q === undefined ? '/admin/users' : `/admin/users?q=${encodeURIComponent(q)}`;
    const res = await call('GET', path, t.tokens.admin);
    expect(res.status).toBe(200);
    return (await res.json()) as AdminUser[];
  }

  it('người thường (kể cả Owner) gọi mọi route → 403 forbidden, không có gì đổi; không token → 401', async () => {
    const hoa = await newAccount();
    for (const token of [t.tokens.lan, t.tokens.chu]) {
      const calls = [
        call('GET', '/admin/users', token),
        call('POST', `/admin/users/${hoa.id}/disable`, token),
        call('POST', `/admin/users/${hoa.id}/reset-password`, token),
        call('POST', `/admin/users/${hoa.id}/revoke-sessions`, token),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('forbidden');
      }
    }
    expect((await call('GET', '/admin/users')).status).toBe(401);
    expect((await me(hoa.tokens[0])).user.id).toBe(hoa.id);
    expect(t.db.prepare(`SELECT disabled FROM users WHERE id = ?`).get(hoa.id)).toEqual({ disabled: 0 });
    expect(await loginStatus(hoa.username, PASSWORD)).toBe(200);
  });

  it('GET tìm theo chuỗi con trong tên đăng nhập, không phân biệt hoa thường, đúng các trường', async () => {
    const a = await newAccount('tim.kiem');
    await newAccount('khac');
    expect(await search('TIM.KIEM')).toEqual([
      {
        id: a.id,
        username: a.username,
        name: expect.any(String),
        disabled: false,
        createdAt: expect.any(String),
        projectCount: 0,
      },
    ]);
    expect((await search('kiem')).map((u) => u.username)).toContain(a.username);
    // Không lộ hash mật khẩu hay token
    for (const u of await search()) {
      expect(Object.keys(u).sort()).toEqual(['createdAt', 'disabled', 'id', 'name', 'projectCount', 'username']);
    }
  });

  it('GET: "_" và "%" trong q là ký tự thường, không phải ký tự đại diện', async () => {
    const a = await newAccount('gach_duoi');
    await newAccount('gachxduoi');
    expect((await search('gach_')).map((u) => u.username)).toEqual([a.username]);
    expect(await search('%')).toEqual([]);
  });

  it('GET không có q thì trả mọi tài khoản sắp theo tên đăng nhập, tối đa 50', async () => {
    const list = await search();
    expect(list.length).toBeLessThanOrEqual(50);
    expect(list.map((u) => u.username)).toEqual(list.map((u) => u.username).sort());
    expect(list.map((u) => u.username)).toEqual(expect.arrayContaining(['admin', 'chu', 'lan', 'minh']));
    for (let i = 0; i < 55; i++) await newAccount('nhieu');
    expect(await search('nhieu')).toHaveLength(50);
  });

  it('GET: projectCount đếm tổ chức chưa lưu trữ đang là thành viên', async () => {
    // Tài khoản và tổ chức riêng: các ca khác trong file thêm lan, minh vào tổ chức thử
    const hoa = await newAccount('dem.to.chuc');
    insertProject('a3-mot', 'Một');
    insertProject('a3-hai', 'Hai');
    insertProject('a3-luu-tru', 'Đã lưu trữ', { archived: true });
    const add = t.db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, 'now')`);
    add.run('a3-mot', hoa.id, 'surveyor');
    add.run('a3-hai', hoa.id, 'owner');
    add.run('a3-luu-tru', hoa.id, 'surveyor');
    expect((await search(hoa.username))[0]?.projectCount).toBe(2);
  });

  it('disable: khoá, thu hồi mọi phiên; token cũ và đăng nhập đều 401; gọi lại vẫn 200', async () => {
    const hoa = await newAccount();
    const res = await call('POST', `/admin/users/${hoa.id}/disable`, t.tokens.admin);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revokedSessions: 2 });
    expect(t.db.prepare(`SELECT disabled FROM users WHERE id = ?`).get(hoa.id)).toEqual({ disabled: 1 });
    expect(t.db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`).get(hoa.id)).toEqual({ n: 0 });
    for (const token of hoa.tokens) expect((await call('GET', '/me', token)).status).toBe(401);
    expect(await loginStatus(hoa.username, PASSWORD)).toBe(401);
    expect((await search(hoa.username))[0]?.disabled).toBe(true);

    const again = await call('POST', `/admin/users/${hoa.id}/disable`, t.tokens.admin);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ revokedSessions: 0 });
  });

  it('revoke-sessions: mọi phiên hết hiệu lực, tài khoản vẫn đăng nhập lại được', async () => {
    const hoa = await newAccount();
    const res = await call('POST', `/admin/users/${hoa.id}/revoke-sessions`, t.tokens.admin);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revokedSessions: 2 });
    for (const token of hoa.tokens) expect((await call('GET', '/me', token)).status).toBe(401);
    expect(t.db.prepare(`SELECT disabled FROM users WHERE id = ?`).get(hoa.id)).toEqual({ disabled: 0 });
    expect(await loginStatus(hoa.username, PASSWORD)).toBe(200);
  });

  it('reset-password: mật khẩu tạm trả một lần, DB chỉ có hash; mật khẩu cũ hết hiệu lực, phiên đang có giữ nguyên', async () => {
    const hoa = await newAccount();
    const res = await call('POST', `/admin/users/${hoa.id}/reset-password`, t.tokens.admin);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { password } = (await res.json()) as { password: string };
    expect(password).toMatch(/^[A-Za-z2-9]{12}$/);

    const row = t.db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(hoa.id) as { password_hash: string };
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(password);
    expect(JSON.stringify(await search(hoa.username))).not.toContain(password);

    expect(await loginStatus(hoa.username, password)).toBe(200);
    expect(await loginStatus(hoa.username, PASSWORD)).toBe(401);
    // Không thu hồi phiên: máy đang giữ phiếu chưa gửi vẫn gửi được (ADR 0003 §1)
    for (const token of hoa.tokens) expect((await call('GET', '/me', token)).status).toBe(200);

    // Cấp lại lần nữa: mật khẩu tạm mới, mật khẩu tạm trước không dùng được nữa
    const second = (await (await call('POST', `/admin/users/${hoa.id}/reset-password`, t.tokens.admin)).json()) as {
      password: string;
    };
    expect(second.password).not.toBe(password);
    expect(await loginStatus(hoa.username, password)).toBe(401);
    expect(await loginStatus(hoa.username, second.password)).toBe(200);
  });

  it('id không có → 404 not_found ở cả ba thao tác', async () => {
    for (const action of ['disable', 'reset-password', 'revoke-sessions']) {
      const res = await call('POST', `/admin/users/u_khongco/${action}`, t.tokens.admin);
      expect(res.status, action).toBe(404);
      expect((await res.json()).error).toBe('not_found');
    }
  });

  it('admin không tự khoá hay tự thu hồi phiên của chính mình → 409 self_action', async () => {
    for (const action of ['disable', 'revoke-sessions']) {
      const res = await call('POST', `/admin/users/${DEMO_USER_IDS.admin}/${action}`, t.tokens.admin);
      expect(res.status, action).toBe(409);
      expect((await res.json()).error).toBe('self_action');
    }
    expect((await me(t.tokens.admin)).user.isAdmin).toBe(true);
    expect(t.db.prepare(`SELECT disabled FROM users WHERE id = ?`).get(DEMO_USER_IDS.admin)).toEqual({ disabled: 0 });
  });
});
