import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { openDb, tx } from '../src/db';
import { writeRecord } from '../src/repo/records';
import { DEMO_USER_IDS } from '../src/seedDemo';
import { createApp } from '../src/app';
import { createTestServer, type TestServer } from './fixtures';

// Cách ly dự án: ca T1–T5 ở ADR 0002 (Kiểm chứng). Dữ liệu demo:
// minh chỉ thuộc demo-yte; lan supervisor ở demo-yte, surveyor ở demo-nongnghiep; admin không thuộc dự án nào.

let t: TestServer;
let recordInNongnghiep: string;

const FORM_ID = 'household-survey';

function recordBody(baseVersion: number, data: object) {
  return { formId: FORM_ID, formVersion: 1, baseVersion, deleted: false, data };
}

function call(method: string, url: string, token: string | undefined, body?: object) {
  const headers: Record<string, string> = { 'Idempotency-Key': randomUUID() };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

const recordsUrl = (project: string) => `${t.base}/api/projects/${project}/records`;
const putRecord = (project: string, token: string, id: string, body: object) =>
  call('PUT', `${recordsUrl(project)}/${id}`, token, body);

beforeAll(async () => {
  t = await createTestServer();
  // Phiếu có thật ở dự án nongnghiep, để T5 gọi route có :id bằng id thật chứ không phải id bịa.
  // Ghi thẳng qua repo chứ không qua HTTP: route bị hở thì T5 phải tự báo đỏ, không hỏng ở bước chuẩn bị.
  recordInNongnghiep = randomUUID();
  const ctx = { userId: DEMO_USER_IDS.lan, projectId: t.projects.nongnghiep, role: 'surveyor' as const };
  tx(t.db, () =>
    writeRecord(ctx, t.db, { id: recordInNongnghiep, formId: FORM_ID, formVersion: 1, data: { householdName: 'NN' }, deleted: false }),
  );
});
afterAll(() => t.close());

describe('T1: thành viên dự án A gọi API của dự án B', () => {
  it('đọc phiếu, đọc form của dự án mình không thuộc trả 403 not_member', async () => {
    for (const path of ['records?since=0', 'forms']) {
      const res = await call('GET', `${t.base}/api/projects/${t.projects.nongnghiep}/${path}`, t.tokens.minh);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'not_member' });
    }
  });

  it('ghi phiếu vào dự án mình không thuộc trả 403, không tạo phiếu', async () => {
    const id = randomUUID();
    const res = await putRecord(t.projects.nongnghiep, t.tokens.minh, id, recordBody(0, { householdName: 'Lạc' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_member' });

    const pulled = await (await call('GET', `${recordsUrl(t.projects.nongnghiep)}?since=0`, t.tokens.lan)).json();
    expect(pulled.records.map((r: { id: string }) => r.id)).not.toContain(id);
  });
});

describe('T2: PUT vào dự án B với id đã có ở dự án A', () => {
  it('trả 404 và phiếu ở dự án A không đổi', async () => {
    const id = randomUUID();
    const created = await putRecord(t.projects.yte, t.tokens.minh, id, recordBody(0, { householdName: 'Gốc' }));
    expect(created.status).toBe(201);

    // lan là thành viên nongnghiep nên qua được requireMember; id thuộc yte nên phải nhận 404.
    for (const baseVersion of [0, 1]) {
      const res = await putRecord(t.projects.nongnghiep, t.tokens.lan, id, recordBody(baseVersion, { householdName: 'Ghi đè' }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }

    const pulled = await (await call('GET', `${recordsUrl(t.projects.yte)}?since=0`, t.tokens.minh)).json();
    const record = pulled.records.find((r: { id: string }) => r.id === id);
    expect(record).toMatchObject({ version: 1, data: { householdName: 'Gốc' } });
  });
});

describe('T3: pull của surveyor và supervisor cùng dự án', () => {
  it('surveyor chỉ nhận phiếu mình tạo, supervisor nhận tất cả', async () => {
    const ofMinh = randomUUID();
    const ofLan = randomUUID();
    expect((await putRecord(t.projects.yte, t.tokens.minh, ofMinh, recordBody(0, { householdName: 'M' }))).status).toBe(201);
    expect((await putRecord(t.projects.yte, t.tokens.lan, ofLan, recordBody(0, { householdName: 'L' }))).status).toBe(201);

    const asMinh = await (await call('GET', `${recordsUrl(t.projects.yte)}?since=0`, t.tokens.minh)).json();
    const minhIds = asMinh.records.map((r: { id: string }) => r.id);
    expect(asMinh.scope).toBe('own');
    expect(minhIds).toContain(ofMinh);
    expect(minhIds).not.toContain(ofLan);

    const asLan = await (await call('GET', `${recordsUrl(t.projects.yte)}?since=0`, t.tokens.lan)).json();
    expect(asLan.scope).toBe('all');
    expect(asLan.records.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining([ofMinh, ofLan]));
  });
});

describe('T4: admin không là thành viên', () => {
  it('đọc phiếu, form của dự án trả 403 not_member', async () => {
    for (const path of ['records?since=0', 'forms']) {
      const res = await call('GET', `${t.base}/api/projects/${t.projects.yte}/${path}`, t.tokens.admin);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'not_member' });
    }
  });
});

// ---------------------------------------------------------------------------
// T5: tự liệt kê mọi route theo dự án rồi gọi từng route bằng token không thuộc dự án đó.
//
// Express 5 không giữ đường dẫn gắn router con (vd. /api/projects/:projectId/records) trong stack,
// nên ghi lại lúc createApp đăng ký: bọc tạm Router.prototype.use/route (API công khai), xong trả lại.
// Route thêm sau này tự vào danh sách, không cần sửa test.

interface RouteLike {
  methods: Record<string, boolean | undefined>;
}
interface RouterProto {
  use: (...args: unknown[]) => unknown;
  route: (path: string) => RouteLike;
}
interface ProjectRoute {
  method: string;
  path: string;
}

const ALL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function isRouter(fn: unknown): fn is object {
  return typeof fn === 'function' && Array.isArray((fn as { stack?: unknown }).stack);
}

function joinPath(prefix: string, path: string): string {
  return `${prefix}/${path}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
}

function listProjectRoutes(): ProjectRoute[] {
  const proto = express.Router.prototype as RouterProto;
  const originalUse = proto.use;
  const originalRoute = proto.route;
  const mounts = new Map<object, { path: string; child: object }[]>();
  const middlewares = new Map<object, string[]>();
  const routes = new Map<object, { path: string; route: RouteLike }[]>();
  const children = new Set<object>();
  const push = <V>(map: Map<object, V[]>, key: object, value: V) => map.set(key, [...(map.get(key) ?? []), value]);

  proto.use = function (this: object, ...args: unknown[]) {
    const [first, ...rest] = args;
    const hasPath = typeof first === 'string';
    for (const fn of (hasPath ? rest : args).flat(Infinity)) {
      if (isRouter(fn)) {
        push(mounts, this, { path: hasPath ? first : '/', child: fn });
        children.add(fn);
      } else {
        push(middlewares, this, hasPath ? first : '/');
      }
    }
    return originalUse.apply(this, args);
  };
  proto.route = function (this: object, path: string) {
    const route = originalRoute.call(this, path);
    push(routes, this, { path, route });
    return route;
  };
  try {
    createApp(openDb(':memory:'));
  } finally {
    proto.use = originalUse;
    proto.route = originalRoute;
  }

  // Router gốc của app là router duy nhất không được gắn vào router nào khác.
  const roots = [...new Set([...mounts.keys(), ...middlewares.keys(), ...routes.keys()])].filter((r) => !children.has(r));
  if (roots.length !== 1) throw new Error(`Tìm được ${roots.length} router gốc, cần đúng 1`);

  const found = new Map<string, ProjectRoute>();
  const add = (method: string, path: string) => found.set(`${method} ${path}`, { method, path });
  const walk = (router: object, prefix: string) => {
    for (const { path, route } of routes.get(router) ?? []) {
      const methods = route.methods._all
        ? ALL_METHODS
        : Object.keys(route.methods).filter((m) => m !== '_all').map((m) => m.toUpperCase());
      for (const m of methods) add(m, joinPath(prefix, path));
    }
    // Middleware gắn theo tiền tố (vd. requireMember) cũng trả lời request, nên gọi thử mọi method ở tiền tố đó.
    for (const path of middlewares.get(router) ?? []) for (const m of ALL_METHODS) add(m, joinPath(prefix, path));
    for (const { path, child } of mounts.get(router) ?? []) walk(child, joinPath(prefix, path));
  };
  walk(roots[0] as object, ''); // đã kiểm roots có đúng 1 phần tử ở trên

  return [...found.values()]
    .filter((r) => /^\/api\/projects\/:projectId(\/|$)/.test(r.path))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** Thay tham số trong đường dẫn: projectId là dự án đích, tham số khác thử với id phiếu thật, id form, số. */
function expandUrls(path: string, projectId: string): string[] {
  const otherValues = [recordInNongnghiep, FORM_ID, '1'];
  let urls = [path.replace(/[{}]/g, '')];
  for (const [token, name] of path.matchAll(/[:*](\w+)/g)) {
    const values = name === 'projectId' ? [projectId] : otherValues;
    urls = urls.flatMap((u) => values.map((v) => u.replace(token, v)));
  }
  return urls.map((u) => `${t.base}${u}`);
}

const projectRoutes = listProjectRoutes();

describe('T5: mọi route theo dự án chặn người ngoài dự án', () => {
  it('tìm được route, gồm các route đã biết', () => {
    const names = projectRoutes.map((r) => `${r.method} ${r.path}`);
    expect(names).toEqual(
      expect.arrayContaining([
        'GET /api/projects/:projectId/records',
        'PUT /api/projects/:projectId/records/:id',
        'GET /api/projects/:projectId/records/:id/history',
        'GET /api/projects/:projectId/forms',
        'POST /api/projects/:projectId/forms',
      ]),
    );
  });

  // Đòi đúng 403 not_member chứ không chỉ "không 2xx": quên requireMember thì handler gọi getCtx()
  // ném lỗi thành 500, vẫn "không 2xx" nhưng là route bị hở.
  it.each(projectRoutes)('$method $path', async ({ method, path }) => {
    const body = method === 'GET' ? undefined : recordBody(0, { householdName: 'T5' });
    const callers = [
      { token: t.tokens.minh, project: t.projects.nongnghiep },
      { token: t.tokens.admin, project: t.projects.yte },
      { token: t.tokens.admin, project: t.projects.nongnghiep },
    ];
    for (const { token, project } of callers) {
      for (const url of expandUrls(path, project)) {
        const res = await call(method, url, token, body);
        expect({ url, status: res.status, body: await res.json() }).toEqual({
          url,
          status: 403,
          body: { error: 'not_member' },
        });
      }
    }
    for (const url of expandUrls(path, t.projects.yte)) {
      const res = await call(method, url, undefined, body);
      expect({ url, status: res.status }).toEqual({ url, status: 401 });
    }
  });
});
