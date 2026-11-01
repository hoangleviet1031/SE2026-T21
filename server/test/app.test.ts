import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestServer, type TestServer } from './fixtures';

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer();
});
afterAll(() => t.close());

describe('middleware trong app', () => {
  it('JSON sai cú pháp trả 400 JSON và log không chứa header hay thân request', async () => {
    const authorization = 'Bearer tv2-19-secret-token';
    const bodySecret = 'tv2-19-secret-body';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const res = await fetch(`${t.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: `{"username":"lan","password":"${bodySecret}"`,
      });

      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'invalid_body' });

      const line = log.mock.calls.map(([value]) => String(value)).find((value) => value.includes('/api/auth/login'));
      expect(line).toBeDefined();
      if (line === undefined) throw new Error('request log was not written');
      expect(line).not.toContain(authorization);
      expect(line).not.toContain(bodySecret);
      expect(JSON.parse(line)).toMatchObject({
        method: 'POST',
        path: '/api/auth/login',
        status: 400,
        userId: null,
      });
      expect(typeof JSON.parse(line).durationMs).toBe('number');
    } finally {
      log.mockRestore();
    }
  });

  it('log request đã xác thực có userId nhưng không có token', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const res = await fetch(`${t.base}/api/me`, {
        headers: { Authorization: `Bearer ${t.tokens.minh}` },
      });
      expect(res.status).toBe(200);

      const line = log.mock.calls.map(([value]) => String(value)).find((value) => value.includes('/api/me'));
      expect(line).toBeDefined();
      if (line === undefined) throw new Error('request log was not written');
      expect(line).not.toContain(t.tokens.minh);
      expect(JSON.parse(line)).toMatchObject({ method: 'GET', path: '/api/me', status: 200, userId: 'u_minh' });
    } finally {
      log.mockRestore();
    }
  });
});
