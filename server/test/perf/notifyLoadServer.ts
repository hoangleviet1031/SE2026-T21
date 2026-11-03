import { monitorEventLoopDelay } from 'node:perf_hooks';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Tiến trình server cho harness tải (notifyLoad.ts), tách khỏi tiến trình client để số đo không trộn hai
// event loop (review plan R1). LOAD_ROOT trỏ tới bản code cần đo, nên chạy được cả trên baseline ef92b35,
// nơi chưa có notifications.ts. Dùng CSDL file, WAL như production.

const root = process.env.LOAD_ROOT ?? process.cwd();
const mode = process.env.LOAD_MODE ?? 'baseline';
const dbPath = process.env.LOAD_DB ?? ':memory:';
const USERS = 120;

const load = (file: string) => import(pathToFileURL(join(root, 'server', 'src', file)).href);
const { openDb } = await load('db.ts');
const { createApp } = await load('app.ts');
const { seedDemo, DEMO_PROJECTS } = await load('seedDemo.ts');
const { hashToken } = await load('auth.ts');

const db = openDb(dbPath);
seedDemo(db);

// 120 điều tra viên có phiên thật: request đi đủ requireAuth, requireMember như production, không qua scrypt.
const now = new Date().toISOString();
const tokens: string[] = [];
for (let i = 0; i < USERS; i += 1) {
  const id = `u_load_${i}`;
  const token = `load-token-${i}`;
  db.prepare(`INSERT INTO users (id, username, name, token_hash, is_admin, created_at) VALUES (?, ?, ?, ?, 0, ?)`).run(id, id, id, `unused:${id}`, now);
  db.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)`).run(hashToken(token), id, now, now);
  db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, 'surveyor', ?)`).run(DEMO_PROJECTS.yte, id, now);
  tokens.push(token);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Kênh giả lập nhà cung cấp: tốt 200 ms, lỗi sau 50 ms, treo bỏ qua `signal` để chỉ timeout mới giải phóng được.
const channels: Record<string, () => Promise<void>> = {
  good: () => sleep(200),
  failing: async () => {
    await sleep(50);
    throw new Error('nhà cung cấp lỗi');
  },
  hanging: () => new Promise<void>(() => {}),
};

let notifier: { stats(): unknown } | undefined;
const opts: Record<string, unknown> = {};
if (mode !== 'baseline') {
  const { createNotifier } = await load('notifications.ts');
  const send = channels[mode];
  if (!send) throw new Error(`LOAD_MODE không hợp lệ: ${mode}`);
  notifier = createNotifier(db, { send });
  opts.notifier = notifier;
}

const eventLoop = monitorEventLoopDelay({ resolution: 10 });
eventLoop.enable();

// Tắt log lỗi của notifier và log request để I/O ra console không chi phối số đo.
console.log = () => {};
console.error = () => {};

const server: Server = createApp(db, opts).listen(0, () => {
  process.send?.({ type: 'ready', port: (server.address() as AddressInfo).port, tokens, project: DEMO_PROJECTS.yte });
});

process.on('message', (message) => {
  if (message !== 'stats') return;
  process.send?.({
    type: 'stats',
    notifier: notifier?.stats() ?? null,
    rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    eventLoopP99Ms: Math.round(eventLoop.percentile(99) / 1e6),
  });
});
process.on('disconnect', () => process.exit(0));
