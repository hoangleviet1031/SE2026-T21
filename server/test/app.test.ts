import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuthResponse } from '@field-survey/shared';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { DEMO_PASSWORD, DEMO_PROJECTS, seedDemo } from '../src/seedDemo';
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

  it('N28: thân JSON quá 2 MB trả 413 payload_too_large dạng JSON', async () => {
    const res = await fetch(`${t.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'lan', password: 'x'.repeat(2 * 1024 * 1024 + 1) }),
    });
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'payload_too_large' });
  });

  it('N28: body-parser báo lỗi 4xx khác (charset lạ) trả 400 invalid_body, không phải 5xx', async () => {
    const res = await fetch(`${t.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=koi8-r' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
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

describe('N28: lỗi không lường trước ở route', () => {
  it('trả 500 internal_error dạng JSON, ghi một dòng log lỗi không có token', async () => {
    // Thư mục upload thực ra là một file: ghi chunk hỏng với ENOTDIR như lần tái hiện trong tech-debt N28.
    const tmp = mkdtempSync(join(tmpdir(), 'field-survey-n28-'));
    const notADir = join(tmp, 'uploads');
    writeFileSync(notADir, '');
    const db = openDb(':memory:');
    seedDemo(db);
    const server = createApp(db, { uploadDir: notADir }).listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'minh', password: DEMO_PASSWORD }),
      });
      const { token } = (await login.json()) as AuthResponse;
      const path = `/api/projects/${DEMO_PROJECTS.yte}/attachments/${randomUUID()}/chunks/0`;

      const res = await fetch(`${base}${path}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      });

      expect(res.status).toBe(500);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'internal_error' });

      const lines = errorLog.mock.calls.map(([value]) => String(value));
      expect(lines).toHaveLength(1);
      const line = lines[0] ?? '';
      expect(line).not.toContain(token);
      expect(JSON.parse(line)).toMatchObject({ level: 'error', method: 'PUT', path });
      expect(JSON.parse(line).message).toContain('ENOTDIR');

      // Log request vẫn ghi mã 500 (design §12 "Xem log").
      const requestLine = log.mock.calls.map(([value]) => String(value)).find((value) => value.includes(path));
      expect(requestLine).toBeDefined();
      expect(JSON.parse(requestLine ?? '{}')).toMatchObject({ status: 500, userId: 'u_minh' });
    } finally {
      errorLog.mockRestore();
      log.mockRestore();
      server.close();
      db.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
