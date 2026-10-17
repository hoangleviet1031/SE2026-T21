import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestServer, type TestServer } from './fixtures';

// API kiểm thử ở design §10.1 (quyết định P8): match, chunkIndex, nhật ký stats. Chỉ có khi
// ENABLE_TEST_ROUTES=1. Dùng cho E2E R4 (cắt kết nối ở một chunk ảnh, ticket TV3-10).

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer({ enableTestRoutes: true });
});
afterAll(() => t.close());
afterEach(async () => {
  // Trạng thái tiêm lỗi và nhật ký là biến toàn cục của module: dọn để ca sau không bị ảnh hưởng.
  await fetch(`${t.base}/api/__test/faults`, { method: 'DELETE' });
  await fetch(`${t.base}/api/__test/stats`, { method: 'DELETE' });
});

const auth = () => ({ Authorization: `Bearer ${t.tokens.minh}` });
const P = () => `${t.base}/api/projects/${t.projects.yte}`;

function setFault(body: object) {
  return fetch(`${t.base}/api/__test/faults`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function putChunk(id: string, index: number) {
  return fetch(`${P()}/attachments/${id}/chunks/${index}`, {
    method: 'PUT',
    headers: { ...auth(), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array([0xff, 0xd8, 0xff, index]),
  });
}

async function stats(): Promise<{ method: string; path: string; idempotencyKey?: string; status: number }[]> {
  return ((await (await fetch(`${t.base}/api/__test/stats`)).json()) as { requests: never[] }).requests;
}

describe('match', () => {
  it('mặc định chỉ tiêm lỗi vào /records, như trước khi có match', async () => {
    expect((await setFault({ mode: '500', count: 1 })).status).toBe(200);
    expect((await fetch(`${P()}/forms`, { headers: auth() })).status).toBe(200);
    expect((await fetch(`${P()}/records?since=0`, { headers: auth() })).status).toBe(500);
    expect((await fetch(`${P()}/records?since=0`, { headers: auth() })).status).toBe(200);
  });

  it('match "/attachments" tiêm lỗi vào upload ảnh, không đụng /records', async () => {
    await setFault({ mode: '500', count: 1, match: '/attachments' });
    expect((await fetch(`${P()}/records?since=0`, { headers: auth() })).status).toBe(200);
    expect((await fetch(`${P()}/attachments/${randomUUID()}/status`, { headers: auth() })).status).toBe(500);
  });
});

describe('chunkIndex', () => {
  it('chỉ áp lỗi cho đúng chunk đó; chunk khác và status không bị ảnh hưởng', async () => {
    const id = randomUUID();
    await setFault({ mode: '500', count: 1, match: '/attachments', chunkIndex: 1 });
    expect((await fetch(`${P()}/attachments/${id}/status`, { headers: auth() })).status).toBe(200);
    expect((await putChunk(id, 0)).status).toBe(201);
    expect((await putChunk(id, 1)).status).toBe(500);
    // count: 1 nên lần sau chunk 1 vào bình thường
    expect((await putChunk(id, 1)).status).toBe(201);
  });

  it('drop-before ở chunk 1: kết nối bị cắt, server không ghi chunk đó', async () => {
    const id = randomUUID();
    await setFault({ mode: 'drop-before', count: 1, match: '/attachments', chunkIndex: 1 });
    expect((await putChunk(id, 0)).status).toBe(201);
    await expect(putChunk(id, 1)).rejects.toThrow();
    const res = await fetch(`${P()}/attachments/${id}/status`, { headers: auth() });
    expect(await res.json()).toEqual({ received: [0] });
  });

  it('drop ở chunk 1: server ghi xong rồi mới cắt kết nối', async () => {
    const id = randomUUID();
    await setFault({ mode: 'drop', count: 1, match: '/attachments', chunkIndex: 1 });
    expect((await putChunk(id, 0)).status).toBe(201);
    await expect(putChunk(id, 1)).rejects.toThrow();
    const res = await fetch(`${P()}/attachments/${id}/status`, { headers: auth() });
    expect(await res.json()).toEqual({ received: [0, 1] });
  });
});

describe('stats', () => {
  it('ghi method, đường dẫn (không có query), Idempotency-Key, status; request bị cắt có status 0', async () => {
    const id = randomUUID();
    const key = randomUUID();
    await fetch(`${P()}/records/${id}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ formId: 'household-survey', formVersion: 1, baseVersion: 0, deleted: false, data: {} }),
    });
    await fetch(`${P()}/records?since=0`, { headers: auth() });
    await setFault({ mode: 'drop-before', count: 1, match: '/attachments' });
    await expect(fetch(`${P()}/attachments/${randomUUID()}/status`, { headers: auth() })).rejects.toThrow();
    // Không thuộc /api/projects/ thì không ghi
    await fetch(`${t.base}/api/me`, { headers: auth() });

    const log = await stats();
    expect(log).toEqual([
      { method: 'PUT', path: `/api/projects/${t.projects.yte}/records/${id}`, idempotencyKey: key, status: 201 },
      { method: 'GET', path: `/api/projects/${t.projects.yte}/records`, status: 200 },
      { method: 'GET', path: expect.stringMatching(/\/attachments\/[0-9a-f-]+\/status$/), status: 0 },
    ]);
  });

  it('DELETE xoá nhật ký', async () => {
    await fetch(`${P()}/forms`, { headers: auth() });
    expect((await stats()).length).toBe(1);
    expect((await fetch(`${t.base}/api/__test/stats`, { method: 'DELETE' })).status).toBe(200);
    expect(await stats()).toEqual([]);
  });
});

describe('POST /faults kiểm thân', () => {
  it('mode lạ, count âm, match không bắt đầu bằng "/", chunkIndex không phải số nguyên ≥ 0 thì 400', async () => {
    for (const body of [
      { mode: 'boom', count: 1 },
      { mode: '500', count: -1 },
      { mode: '500', count: 1.5 },
      { mode: '500', count: 1, match: 'attachments' },
      { mode: '500', count: 1, chunkIndex: -1 },
      { mode: '500', count: 1, chunkIndex: 'mot' },
    ]) {
      const res = await setFault(body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
  });

  it('trả lại lỗi đang chờ; count 0 thì tắt', async () => {
    const res = await setFault({ mode: '500', count: 2, match: '/attachments', chunkIndex: 1 });
    expect((await res.json()).pending).toEqual({ mode: '500', count: 2, match: '/attachments', chunkIndex: 1 });
    expect((await (await setFault({ mode: '500', count: 0 })).json()).pending).toBeNull();
  });
});
