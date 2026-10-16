import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuthResponse } from '@field-survey/shared';
import { openDb, type Db } from '../src/db';
import { createApp } from '../src/app';
import { DEMO_PASSWORD, DEMO_PROJECTS, DEMO_USERNAMES, seedDemo } from '../src/seedDemo';

export type DemoUser = keyof typeof DEMO_USERNAMES;

export interface TestServer {
  base: string;
  db: Db;
  /** Token phiên của từng tài khoản demo, lấy bằng đăng nhập thật qua /api/auth/login (ADR 0003 §1). */
  tokens: Record<DemoUser, string>;
  projects: typeof DEMO_PROJECTS;
  /** Đăng nhập thêm một phiên (vd. máy thứ hai của cùng người). Sai thì ném lỗi kèm mã HTTP. */
  login: (username: string, password?: string) => Promise<string>;
  /** Thư mục ảnh riêng của server này, xoá khi `close()`. */
  uploadDir: string;
  close: () => void;
}

/** Server thật cổng ngẫu nhiên với bộ dữ liệu demo (hai dự án; lan, minh, chu là Owner, admin). */
export async function createTestServer(): Promise<TestServer> {
  const db = openDb(':memory:');
  seedDemo(db);
  const uploadDir = mkdtempSync(join(tmpdir(), 'field-survey-uploads-'));
  const server: Server = createApp(db, { uploadDir }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;

  const login = async (username: string, password = DEMO_PASSWORD): Promise<string> => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.status !== 200) throw new Error(`đăng nhập ${username} trả ${res.status}`);
    return ((await res.json()) as AuthResponse).token;
  };

  const tokens = {} as Record<DemoUser, string>;
  for (const user of Object.keys(DEMO_USERNAMES) as DemoUser[]) tokens[user] = await login(DEMO_USERNAMES[user]);

  return {
    base,
    db,
    tokens,
    projects: DEMO_PROJECTS,
    login,
    uploadDir,
    close: () => {
      server.close();
      rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}
