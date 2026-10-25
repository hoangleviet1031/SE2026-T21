import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PullResponse } from '@field-survey/shared';
import { MAX_PERF_RECORDS, SeedPerfError, runSeedPerfCli, seedPerf } from '../src/cli/seedPerf';
import { DEMO_USER_IDS } from '../src/seedDemo';
import { createTestServer, type TestServer } from './fixtures';

// Dữ liệu đo hiệu năng (TV2-11, docs/perf.md): ghi đúng như PUT thật để pull đo được đường đi thật.

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer({ enableTestRoutes: true });
});
afterAll(() => t.close());

let seq = 0;
function newProject(): string {
  seq += 1;
  const id = `perf-${seq}`;
  t.db.prepare(`INSERT INTO projects (id, name, created_at) VALUES (?, ?, 'now')`).run(id, `Đo ${seq}`);
  t.db
    .prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, 'supervisor', 'now')`)
    .run(id, DEMO_USER_IDS.lan);
  return id;
}

async function pullAll(projectId: string, token: string): Promise<PullResponse['records']> {
  const all: PullResponse['records'] = [];
  let since = 0;
  for (;;) {
    const res = await fetch(`${t.base}/api/projects/${projectId}/records?since=${since}&limit=1000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const page = (await res.json()) as PullResponse;
    if (page.records.length === 0) return all;
    all.push(...page.records);
    since = page.cursor;
  }
}

describe('seedPerf', () => {
  it('thêm đúng số phiếu, mỗi phiếu có lịch sử version 1, seq tăng liên tục; pull qua API trả đủ', async () => {
    const projectId = newProject();
    const before = (t.db.prepare(`SELECT v FROM meta WHERE k = 'seq'`).get() as { v: number }).v;
    expect(seedPerf(t.db, { projectId, createdBy: DEMO_USER_IDS.minh, count: 2500 })).toBe(2500);

    const seqs = (
      t.db.prepare(`SELECT seq FROM records WHERE project_id = ? ORDER BY seq`).all(projectId) as { seq: number }[]
    ).map((r) => r.seq);
    expect(seqs).toEqual(Array.from({ length: 2500 }, (_, i) => before + i + 1));
    expect(t.db.prepare(`SELECT COUNT(*) AS n FROM record_history WHERE project_id = ? AND version = 1`).get(projectId)).toEqual({
      n: 2500,
    });
    expect(t.db.prepare(`SELECT 1 FROM forms WHERE project_id = ? AND id = 'household-survey'`).get(projectId)).toBeDefined();

    const pulled = await pullAll(projectId, t.tokens.lan);
    expect(pulled).toHaveLength(2500);
    expect(pulled[0]).toMatchObject({ formId: 'household-survey', version: 1, deleted: false, createdBy: DEMO_USER_IDS.minh });
    expect(new Set(pulled.map((r) => r.id)).size).toBe(2500);
  });

  it('dự án hoặc người dùng không có, số lượng sai: SeedPerfError, không ghi gì', () => {
    const projectId = newProject();
    expect(() => seedPerf(t.db, { projectId: 'khong-co', createdBy: DEMO_USER_IDS.minh, count: 10 })).toThrow(SeedPerfError);
    expect(() => seedPerf(t.db, { projectId, createdBy: 'u_khongco', count: 10 })).toThrow(SeedPerfError);
    for (const count of [0, -1, 1.5, MAX_PERF_RECORDS + 1]) {
      expect(() => seedPerf(t.db, { projectId, createdBy: DEMO_USER_IDS.minh, count }), String(count)).toThrow(SeedPerfError);
    }
    expect(t.db.prepare(`SELECT COUNT(*) AS n FROM records WHERE project_id = ?`).get(projectId)).toEqual({ n: 0 });
  });
});

describe('npm run seed:perf', () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
  };

  it('thêm phiếu theo tên đăng nhập', () => {
    const projectId = newProject();
    const o = io();
    expect(runSeedPerfCli(['--project', projectId, '--user', 'MINH', '--count', '20'], t.db, {}, o.io)).toBe(0);
    expect(o.out[0]).toContain(`Đã thêm 20 phiếu vào ${projectId}`);
    expect(t.db.prepare(`SELECT COUNT(*) AS n FROM records WHERE project_id = ?`).get(projectId)).toEqual({ n: 20 });
  });

  it('từ chối khi NODE_ENV=production; thiếu cờ hoặc sai tên trả 1', () => {
    const projectId = newProject();
    for (const [argv, env] of [
      [['--project', projectId, '--user', 'minh'], { NODE_ENV: 'production' }],
      [['--project', projectId], {}],
      [['--project', projectId, '--user', 'khong.co'], {}],
      [['--project', projectId, '--user', 'minh', '--count', 'nhieu'], {}],
      [['--la'], {}],
    ] as const) {
      const o = io();
      expect(runSeedPerfCli([...argv], t.db, env, o.io), argv.join(' ')).toBe(1);
      expect(o.err).toHaveLength(1);
    }
    expect(t.db.prepare(`SELECT COUNT(*) AS n FROM records WHERE project_id = ?`).get(projectId)).toEqual({ n: 0 });
  });
});

describe('POST /api/__test/seed-perf', () => {
  const post = (body: unknown) =>
    fetch(`${t.base}/api/__test/seed-perf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('gọi cùng seedPerf: 201 { count }, pull thấy đủ', async () => {
    const projectId = newProject();
    const res = await post({ projectId, userId: DEMO_USER_IDS.minh, count: 30 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ count: 30 });
    expect(await pullAll(projectId, t.tokens.lan)).toHaveLength(30);
  });

  it('thân sai trả 400; dự án hoặc người dùng không có trả 404', async () => {
    const projectId = newProject();
    for (const body of [{}, { projectId, userId: DEMO_USER_IDS.minh }, { projectId, userId: DEMO_USER_IDS.minh, count: 0 }]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await post({ projectId: 'khong-co', userId: DEMO_USER_IDS.minh, count: 5 })).status).toBe(404);
    expect((await post({ projectId, userId: 'u_khongco', count: 5 })).status).toBe(404);
  });

  it('không bật ENABLE_TEST_ROUTES thì không có route', async () => {
    const plain = await createTestServer();
    try {
      const res = await fetch(`${plain.base}/api/__test/seed-perf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'demo-yte', userId: DEMO_USER_IDS.minh, count: 5 }),
      });
      expect(res.status).toBe(404);
      expect(plain.db.prepare(`SELECT COUNT(*) AS n FROM records`).get()).toEqual({ n: 0 });
    } finally {
      plain.close();
    }
  });
});
