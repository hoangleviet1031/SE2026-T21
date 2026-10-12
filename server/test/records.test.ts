import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth';
import { createTestServer, type TestServer } from './fixtures';

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer();
});
afterAll(() => t.close());

const recordsUrl = (project: string) => `${t.base}/api/projects/${project}/records`;

function push(project: string, token: string, id: string, body: object, key: string) {
  return fetch(`${recordsUrl(project)}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify({ formId: 'household-survey', formVersion: 1, deleted: false, ...body }),
  });
}

function get(url: string, token: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

describe('PUT /api/projects/:projectId/records/:id', () => {
  it('tạo mới với baseVersion 0 trả 201 và version 1', async () => {
    const res = await push(t.projects.yte, t.tokens.minh, 'r1', { baseVersion: 0, data: { householdName: 'An' } }, 'k1');
    expect(res.status).toBe(201);
    expect((await res.json()).version).toBe(1);
  });

  it('gửi lại cùng Idempotency-Key không tạo bản ghi mới', async () => {
    const res = await push(t.projects.yte, t.tokens.minh, 'r1', { baseVersion: 0, data: { householdName: 'An' } }, 'k1');
    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotent-Replayed')).toBe('true');
    expect((await res.json()).version).toBe(1);
  });

  it('baseVersion cũ trả 409 kèm bản server và lịch sử', async () => {
    // lan (giám sát viên) sửa phiếu của minh
    await push(t.projects.yte, t.tokens.lan, 'r1', { baseVersion: 1, data: { householdName: 'Bình' } }, 'k2');
    const res = await push(t.projects.yte, t.tokens.minh, 'r1', { baseVersion: 1, data: { householdName: 'Chi' } }, 'k3');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.current.version).toBe(2);
    expect(body.current.data.householdName).toBe('Bình');
    expect(body.history.map((h: { version: number }) => h.version)).toEqual([2]);
  });

  it('thiếu Idempotency-Key trả 400', async () => {
    const res = await fetch(`${recordsUrl(t.projects.yte)}/r9`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${t.tokens.minh}` },
    });
    expect(res.status).toBe(400);
  });

  it('updatedBy lấy từ token, bỏ qua giá trị client gửi (bất biến 6)', async () => {
    const res = await push(
      t.projects.yte,
      t.tokens.minh,
      'r-by',
      { baseVersion: 0, data: { householdName: 'Giả' }, updatedBy: 'u_admin' },
      'k-by',
    );
    expect(res.status).toBe(201);
    expect((await res.json()).updatedBy).toBe('u_minh');
  });

  it('surveyor sửa phiếu không phải của mình trả 404, phiếu không đổi', async () => {
    // r1 do minh tạo ở demo-yte; thêm một surveyor khác vào đúng dự án đó
    t.db
      .prepare(`INSERT INTO users (id, name, token_hash, is_admin, created_at) VALUES ('u_khac', 'khac', ?, 0, 'now')`)
      .run(hashToken('tok-khac'));
    t.db
      .prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, 'u_khac', 'surveyor', 'now')`)
      .run(t.projects.yte);
    const khac = 'tok-khac';
    const res = await push(t.projects.yte, khac, 'r1', { baseVersion: 2, data: { householdName: 'Cướp' } }, 'k-khac');
    expect(res.status).toBe(404);
    const row = t.db.prepare(`SELECT version FROM records WHERE id = 'r1'`).get() as { version: number };
    expect(row.version).toBe(2);
  });

  it('PUT id thuộc dự án khác trả 404 và không ghi đè', async () => {
    // r1 thuộc demo-yte; lan là thành viên nongnghiep nên qua middleware, nhưng id nằm ở dự án khác
    const res = await push(t.projects.nongnghiep, t.tokens.lan, 'r1', { baseVersion: 0, data: { householdName: 'Ghi đè' } }, 'k-x1');
    expect(res.status).toBe(404);
    const row = t.db.prepare(`SELECT project_id, version FROM records WHERE id = 'r1'`).get() as {
      project_id: string;
      version: number;
    };
    expect(row).toEqual({ project_id: t.projects.yte, version: 2 });
  });

  it('baseVersion > 0 vào id chưa tồn tại trả 404', async () => {
    const res = await push(t.projects.yte, t.tokens.lan, 'khong-co', { baseVersion: 3, data: { householdName: 'x' } }, 'k-nf');
    expect(res.status).toBe(404);
  });

  it('thân sai trả 400 invalid_body', async () => {
    const res = await push(t.projects.yte, t.tokens.lan, 'r-bad', { data: { householdName: 'x' } }, 'k-bad');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
  });
});

describe('xác thực và thành viên', () => {
  it('không có token trả 401', async () => {
    const res = await fetch(`${recordsUrl(t.projects.yte)}?since=0`);
    expect(res.status).toBe(401);
  });

  it('không là thành viên dự án trả 403 not_member', async () => {
    const res = await get(`${recordsUrl(t.projects.yte)}?since=0`, t.tokens.admin);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_member');
  });
});

describe('GET /api/projects/:projectId/records?since= (pull)', () => {
  it('chỉ trả các thay đổi sau cursor', async () => {
    const all = await (await get(`${recordsUrl(t.projects.yte)}?since=0`, t.tokens.lan)).json();
    expect(all.records.length).toBeGreaterThan(0);
    const next = await (await get(`${recordsUrl(t.projects.yte)}?since=${all.cursor}`, t.tokens.lan)).json();
    expect(next.records).toEqual([]);
    expect(next.cursor).toBe(all.cursor);
  });

  // A2: surveyor chỉ pull phiếu mình tạo; giám sát viên thấy tất cả.
  it('A2: surveyor chỉ nhận phiếu của mình, supervisor nhận mọi phiếu của dự án', async () => {
    await push(t.projects.yte, t.tokens.lan, 'r-lan', { baseVersion: 0, data: { householdName: 'Của Lan' } }, 'k-lan');

    const asMinh = await (await get(`${recordsUrl(t.projects.yte)}?since=0`, t.tokens.minh)).json();
    expect(asMinh.scope).toBe('own');
    const minhIds = asMinh.records.map((r: { id: string }) => r.id);
    expect(minhIds).toContain('r1');
    expect(minhIds).not.toContain('r-lan');

    const asLan = await (await get(`${recordsUrl(t.projects.yte)}?since=0`, t.tokens.lan)).json();
    expect(asLan.scope).toBe('all');
    expect(asLan.records.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining(['r1', 'r-lan']));
  });

  it('không lẫn phiếu của dự án khác', async () => {
    await push(t.projects.nongnghiep, t.tokens.lan, 'r-na', { baseVersion: 0, data: { householdName: 'NN' } }, 'k-na');
    const res = await (await get(`${recordsUrl(t.projects.nongnghiep)}?since=0`, t.tokens.lan)).json();
    expect(res.records.map((r: { id: string }) => r.id)).toEqual(['r-na']);
  });
});

describe('GET /api/projects/:projectId/records/:id/history', () => {
  it('trả lịch sử phiếu trong phạm vi', async () => {
    const res = await get(`${recordsUrl(t.projects.yte)}/r1/history`, t.tokens.minh);
    expect(res.status).toBe(200);
    expect((await res.json()).map((h: { version: number }) => h.version)).toEqual([1, 2]);
  });

  it('phiếu ngoài phạm vi surveyor trả 404', async () => {
    const res = await get(`${recordsUrl(t.projects.yte)}/r-lan/history`, t.tokens.minh);
    expect(res.status).toBe(404);
  });

  it('phiếu của dự án khác trả 404', async () => {
    const res = await get(`${recordsUrl(t.projects.nongnghiep)}/r1/history`, t.tokens.lan);
    expect(res.status).toBe(404);
  });
});

describe('Idempotency-Key gắn với nội dung request (R6, ADR 0001 quy tắc 3)', () => {
  it('cùng key, cùng phiếu nhưng khác nội dung trả 422, phiếu không đổi', async () => {
    const body = { baseVersion: 0, data: { householdName: 'Gốc' } };
    expect((await push(t.projects.yte, t.tokens.minh, 'r-r6', body, 'k-r6')).status).toBe(201);

    const reused = await push(t.projects.yte, t.tokens.minh, 'r-r6', { ...body, data: { householdName: 'Khác' } }, 'k-r6');
    expect(reused.status).toBe(422);
    expect((await reused.json()).error).toBe('idempotency_key_reused');
    expect(reused.headers.get('Idempotent-Replayed')).toBeNull();
    const row = t.db.prepare(`SELECT version, data FROM records WHERE id = 'r-r6'`).get() as {
      version: number;
      data: string;
    };
    expect(row.version).toBe(1);
    expect(JSON.parse(row.data)).toEqual({ householdName: 'Gốc' });
  });

  it('cùng nội dung nhưng thứ tự khoá JSON khác vẫn được replay', async () => {
    const send = (json: string) =>
      fetch(`${recordsUrl(t.projects.yte)}/r-order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t.tokens.minh}`,
          'Idempotency-Key': 'k-order',
        },
        body: json,
      });
    const first = '{"formId":"household-survey","formVersion":1,"baseVersion":0,"data":{"householdName":"An","members":3},"deleted":false}';
    const reordered = '{"deleted":false,"data":{"members":3,"householdName":"An"},"baseVersion":0,"formVersion":1,"formId":"household-survey"}';
    expect((await send(first)).status).toBe(201);
    const replay = await send(reordered);
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
  });

  it('trường lạ ngoài PushRecordRequest không làm đổi hash (server vốn bỏ qua chúng)', async () => {
    const body = { baseVersion: 0, data: { householdName: 'Lạ' } };
    expect((await push(t.projects.yte, t.tokens.minh, 'r-extra', body, 'k-extra')).status).toBe(201);
    const replay = await push(t.projects.yte, t.tokens.minh, 'r-extra', { ...body, updatedBy: 'ai-do' }, 'k-extra');
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
  });
});

describe('GET /api/projects/:projectId/forms', () => {
  it('thành viên lấy được form của dự án', async () => {
    const res = await get(`${t.base}/api/projects/${t.projects.yte}/forms`, t.tokens.minh);
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe('household-survey');
  });

  it('không là thành viên trả 403', async () => {
    const res = await get(`${t.base}/api/projects/${t.projects.nongnghiep}/forms`, t.tokens.minh);
    expect(res.status).toBe(403);
  });
});
