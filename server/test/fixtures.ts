import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, type Db } from '../src/db';
import { createApp } from '../src/app';
import { DEMO_PROJECTS, DEMO_TOKENS, seedDemo } from '../src/seedDemo';

export interface TestServer {
  base: string;
  db: Db;
  tokens: typeof DEMO_TOKENS;
  projects: typeof DEMO_PROJECTS;
  close: () => void;
}

/** Server thật cổng ngẫu nhiên với bộ dữ liệu demo (hai dự án; lan, minh, admin). */
export async function createTestServer(): Promise<TestServer> {
  const db = openDb(':memory:');
  seedDemo(db);
  const server: Server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  return { base, db, tokens: DEMO_TOKENS, projects: DEMO_PROJECTS, close: () => server.close() };
}
