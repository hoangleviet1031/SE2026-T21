import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, type Db } from '../src/db';
import { createApp } from '../src/app';
import { deleteExpiredKeys } from '../src/repo/idempotency';
import { DEMO_PROJECTS, DEMO_TOKENS, seedDemo } from '../src/seedDemo';

// Dọn key idempotency sau 30 ngày (ADR 0001 quy tắc 3) và fault `drop` cắt kết nối SAU khi ghi
// (design §10.1, R3). Server bật route kiểm thử để tiêm lỗi.

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

function push(id: string, key: string) {
  return fetch(`${base}/api/projects/${DEMO_PROJECTS.yte}/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEMO_TOKENS.minh}`, 'Idempotency-Key': key },
    body: JSON.stringify({
      formId: 'household-survey',
      formVersion: 1,
      baseVersion: 0,
      data: { householdName: 'An' },
      deleted: false,
    }),
  });
}

function fault(mode: string) {
  return fetch(`${base}/api/__test/faults`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, count: 1 }),
  });
}

const keyExists = (key: string) => db.prepare(`SELECT 1 FROM idempotency WHERE key = ?`).get(key) !== undefined;
const recordVersion = (id: string) =>
  (db.prepare(`SELECT version FROM records WHERE id = ?`).get(id) as { version: number } | undefined)?.version;

describe('deleteExpiredKeys', () => {
  it('xoá key quá 30 ngày, giữ key mới hơn', async () => {
    expect((await push('r-old', 'k-old')).status).toBe(201);
    expect((await push('r-new', 'k-new')).status).toBe(201);
    const now = new Date('2026-12-01T00:00:00Z');
    db.prepare(`UPDATE idempotency SET created_at = ? WHERE key = 'k-old'`).run('2026-10-31T23:59:59Z');
    db.prepare(`UPDATE idempotency SET created_at = ? WHERE key = 'k-new'`).run('2026-11-01T00:00:01Z');

    expect(deleteExpiredKeys(db, now)).toBe(1);
    expect(keyExists('k-old')).toBe(false);
    expect(keyExists('k-new')).toBe(true);
  });

  it('gửi lại op có key đã bị dọn: nhận 409, không ghi trùng (ADR 0001 quy tắc 3)', async () => {
    const res = await push('r-old', 'k-old');
    expect(res.status).toBe(409);
    expect(recordVersion('r-old')).toBe(1);
  });
});

describe('fault drop', () => {
  it('"drop": server ghi xong rồi mới cắt kết nối; gửi lại cùng key nhận replay', async () => {
    expect((await fault('drop')).status).toBe(200);
    await expect(push('r-drop', 'k-drop')).rejects.toThrow();
    expect(recordVersion('r-drop')).toBe(1);

    const retry = await push('r-drop', 'k-drop');
    expect(retry.status).toBe(201);
    expect(retry.headers.get('Idempotent-Replayed')).toBe('true');
    expect(recordVersion('r-drop')).toBe(1);
  });

  it('"drop-before": cắt kết nối trước khi vào handler, không ghi gì', async () => {
    expect((await fault('drop-before')).status).toBe(200);
    await expect(push('r-drop-before', 'k-drop-before')).rejects.toThrow();
    expect(recordVersion('r-drop-before')).toBeUndefined();
    expect(keyExists('k-drop-before')).toBe(false);
  });
});
