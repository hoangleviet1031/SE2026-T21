import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, seed } from '../src/db';
import { createApp } from '../src/app';

let server: Server;
let base: string;

beforeAll(async () => {
  const db = openDb(':memory:');
  seed(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

function push(id: string, body: object, key: string) {
  return fetch(`${base}/api/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ formId: 'household-survey', formVersion: 1, deleted: false, updatedBy: 'tester', ...body }),
  });
}

describe('PUT /api/records/:id', () => {
  it('tạo mới với baseVersion 0 trả 201 và version 1', async () => {
    const res = await push('r1', { baseVersion: 0, data: { householdName: 'An' } }, 'k1');
    expect(res.status).toBe(201);
    expect((await res.json()).version).toBe(1);
  });

  it('gửi lại cùng Idempotency-Key không tạo bản ghi mới', async () => {
    const res = await push('r1', { baseVersion: 0, data: { householdName: 'An' } }, 'k1');
    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotent-Replayed')).toBe('true');
    expect((await res.json()).version).toBe(1);
  });

  it('baseVersion cũ trả 409 kèm bản server và lịch sử', async () => {
    await push('r1', { baseVersion: 1, data: { householdName: 'Bình' } }, 'k2');
    const res = await push('r1', { baseVersion: 1, data: { householdName: 'Chi' } }, 'k3');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.current.version).toBe(2);
    expect(body.current.data.householdName).toBe('Bình');
    expect(body.history.map((h: { version: number }) => h.version)).toEqual([2]);
  });

  it('thiếu Idempotency-Key trả 400', async () => {
    const res = await fetch(`${base}/api/records/r9`, { method: 'PUT' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/records?since=', () => {
  it('chỉ trả các thay đổi sau cursor', async () => {
    const all = await (await fetch(`${base}/api/records?since=0`)).json();
    expect(all.records.length).toBe(1);
    const next = await (await fetch(`${base}/api/records?since=${all.cursor}`)).json();
    expect(next.records).toEqual([]);
    expect(next.cursor).toBe(all.cursor);
  });
});
