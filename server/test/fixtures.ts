import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/db';
import { createApp } from '../src/app';
import { DEMO_PROJECTS, DEMO_TOKENS, seedDemo } from '../src/seedDemo';

export interface TestServer {
  base: string;
  db: Db;
  tokens: typeof DEMO_TOKENS;
  projects: typeof DEMO_PROJECTS;
  /** Thư mục ảnh riêng của server này, xoá khi `close()`. */
  uploadDir: string;
  close: () => void;
}

/** Server thật cổng ngẫu nhiên với bộ dữ liệu demo (hai dự án; lan, minh, admin). */
export async function createTestServer(): Promise<TestServer> {
  const db = openDb(':memory:');
  seedDemo(db);
  const uploadDir = mkdtempSync(join(tmpdir(), 'field-survey-uploads-'));
  const server: Server = createApp(db, { uploadDir }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  return {
    base,
    db,
    tokens: DEMO_TOKENS,
    projects: DEMO_PROJECTS,
    uploadDir,
    close: () => {
      server.close();
      rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}
