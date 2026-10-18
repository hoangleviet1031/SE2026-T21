import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, type Db } from '../src/db';
import { createApp } from '../src/app';
import { DEMO_PROJECTS, DEMO_USER_IDS, seedDemo } from '../src/seedDemo';

// Route kiểm thử đổi thành viên cho E2E T7–T9 (TV2-07) và tạo dự án (TV2-15), chỉ có khi ENABLE_TEST_ROUTES=1.
// Xem docs/design.md §10.1 (API kiểm thử).

let db: Db;
let server: Server;
let base: string;

beforeAll(async () => {
  db = openDb(':memory:');
  seedDemo(db);
  server = createApp(db, { enableTestRoutes: true }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const url = (projectId: string, userId: string) => `${base}/api/__test/memberships/${projectId}/${userId}`;

function put(projectId: string, userId: string, body: unknown) {
  return fetch(url(projectId, userId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function roleOf(projectId: string, userId: string): string | undefined {
  const row = db.prepare(`SELECT role FROM memberships WHERE project_id = ? AND user_id = ?`).get(projectId, userId) as
    | { role: string }
    | undefined;
  return row?.role;
}

describe('/api/__test/memberships', () => {
  it('PUT thêm thành viên rồi đổi vai trò', async () => {
    expect(roleOf(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.minh)).toBeUndefined();
    expect((await put(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.minh, { role: 'surveyor' })).status).toBe(200);
    expect(roleOf(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.minh)).toBe('surveyor');

    expect((await put(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.minh, { role: 'supervisor' })).status).toBe(200);
    expect(roleOf(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.minh)).toBe('supervisor');
  });

  it('DELETE rút khỏi dự án', async () => {
    await put(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.admin, { role: 'surveyor' });
    const res = await fetch(url(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.admin), { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(roleOf(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.admin)).toBeUndefined();
  });

  it('vai trò sai trả 400, dự án hoặc người dùng không có trả 404', async () => {
    expect((await put(DEMO_PROJECTS.yte, DEMO_USER_IDS.minh, { role: 'admin' })).status).toBe(400);
    expect((await put('khong-co', DEMO_USER_IDS.minh, { role: 'surveyor' })).status).toBe(404);
    expect((await put(DEMO_PROJECTS.yte, 'u_khongco', { role: 'surveyor' })).status).toBe(404);
  });

  it('không bật ENABLE_TEST_ROUTES thì không có route', async () => {
    const plain = createApp(db).listen(0);
    await new Promise((r) => plain.once('listening', r));
    const res = await fetch(
      `http://localhost:${(plain.address() as AddressInfo).port}/api/__test/memberships/${DEMO_PROJECTS.yte}/${DEMO_USER_IDS.minh}`,
      { method: 'DELETE' },
    );
    plain.close();
    expect(res.status).toBe(404);
    expect(roleOf(DEMO_PROJECTS.yte, DEMO_USER_IDS.minh)).toBe('surveyor');
  });
});

describe('PUT /api/__test/projects/:projectId', () => {
  const putProject = (projectId: string, body: unknown, at = base) =>
    fetch(`${at}/api/__test/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('tạo dự án chưa có, không công khai, không thành viên; gọi lại thì đặt lại tên', async () => {
    const res = await putProject('b-thu', { name: '  Thử  ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'b-thu', name: 'Thử' });
    expect(db.prepare(`SELECT name, public, archived FROM projects WHERE id = 'b-thu'`).get()).toEqual({
      name: 'Thử',
      public: 0,
      archived: 0,
    });
    expect(db.prepare(`SELECT 1 FROM memberships WHERE project_id = 'b-thu'`).get()).toBeUndefined();

    expect((await putProject('b-thu', { name: 'Tên mới' })).status).toBe(200);
    expect(db.prepare(`SELECT name FROM projects WHERE id = 'b-thu'`).get()).toEqual({ name: 'Tên mới' });
  });

  it('id hoặc tên sai trả 400', async () => {
    for (const [id, body] of [
      ['Chu-Hoa', { name: 'x' }],
      ['-dau-gach', { name: 'x' }],
      ['b-ok', {}],
      ['b-ok', { name: '   ' }],
      ['b-ok', { name: 'x'.repeat(101) }],
    ] as const) {
      expect((await putProject(id, body)).status, `${id} ${JSON.stringify(body)}`).toBe(400);
    }
    expect(db.prepare(`SELECT 1 FROM projects WHERE id = 'b-ok'`).get()).toBeUndefined();
  });

  it('không bật ENABLE_TEST_ROUTES thì không có route', async () => {
    const plain = createApp(db).listen(0);
    await new Promise((r) => plain.once('listening', r));
    const res = await putProject('b-tat', { name: 'x' }, `http://localhost:${(plain.address() as AddressInfo).port}`);
    plain.close();
    expect(res.status).toBe(404);
    expect(db.prepare(`SELECT 1 FROM projects WHERE id = 'b-tat'`).get()).toBeUndefined();
  });
});
