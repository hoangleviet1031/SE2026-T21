import { afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, seed } from '../src/db';
import { createApp, testRoutesEnabled } from '../src/app';

// Route tiêm lỗi phải bật chủ động, quên cấu hình thì tắt. Xem docs/design.md §9.
describe('testRoutesEnabled', () => {
  it('chỉ bật khi ENABLE_TEST_ROUTES đúng bằng "1"', () => {
    expect(testRoutesEnabled({ ENABLE_TEST_ROUTES: '1' })).toBe(true);
  });

  it('không có biến thì tắt, kể cả khi không phải production', () => {
    expect(testRoutesEnabled({})).toBe(false);
    expect(testRoutesEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('giá trị khác "1" thì tắt', () => {
    expect(testRoutesEnabled({ ENABLE_TEST_ROUTES: '0' })).toBe(false);
    expect(testRoutesEnabled({ ENABLE_TEST_ROUTES: 'true' })).toBe(false);
    expect(testRoutesEnabled({ ENABLE_TEST_ROUTES: '' })).toBe(false);
  });
});

async function listen(enableTestRoutes?: boolean): Promise<{ server: Server; base: string }> {
  const db = openDb(':memory:');
  seed(db);
  const server = createApp(db, enableTestRoutes === undefined ? {} : { enableTestRoutes }).listen(0);
  await new Promise((r) => server.once('listening', r));
  return { server, base: `http://localhost:${(server.address() as AddressInfo).port}` };
}

function postFault(base: string) {
  return fetch(`${base}/api/__test/faults`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: '500', count: 1 }),
  });
}

describe('POST /api/__test/faults', () => {
  const servers: Server[] = [];
  afterAll(() => servers.forEach((s) => s.close()));

  it('mặc định không đăng ký route, trả 404', async () => {
    const { server, base } = await listen();
    servers.push(server);
    expect((await postFault(base)).status).toBe(404);
  });

  it('bật enableTestRoutes thì nhận lệnh tiêm lỗi', async () => {
    const { server, base } = await listen(true);
    servers.push(server);
    const res = await postFault(base);
    expect(res.status).toBe(200);
    expect((await res.json()).pending).toEqual({ mode: '500', count: 1 });
    // Trạng thái tiêm lỗi là biến toàn cục của module, dọn để không ảnh hưởng ca khác
    await fetch(`${base}/api/__test/faults`, { method: 'DELETE' });
  });
});
