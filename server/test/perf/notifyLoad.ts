import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { Agent, request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Harness tải VT-082: mỗi vòng 120 PUT tạo phiếu đồng thời từ 120 tài khoản, so p95 với 3,5 s.
// Không phải *.test.ts nên không vào `npm test` và CI (review plan R1). Cách chạy: docs/bt3-vt082/README.md.

const P95_TARGET_MS = 3500;
const CONCURRENT = 120;
const here = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    modes: { type: 'string', default: 'baseline,good,failing,hanging' },
    sizes: { type: 'string', default: 'small,large' },
    rounds: { type: 'string', default: '5' },
    root: { type: 'string', default: resolve(here, '../../..') },
    'baseline-root': { type: 'string' },
    'db-dir': { type: 'string', default: tmpdir() },
    out: { type: 'string' },
    // Chỉ để tái hiện lỗi của lượt đo đầu: socket tái dùng bị server đóng sau keepAliveTimeout 5 s.
    keepalive: { type: 'boolean', default: false },
  },
});

// Dữ liệu cố định, không ngẫu nhiên, để các lượt so được với nhau.
function payload(fields: number, fieldChars: number): Buffer {
  const data: Record<string, string> = { householdName: 'Hộ tải thử' };
  for (let i = 0; i < fields; i += 1) data[`f${i}`] = 'x'.repeat(fieldChars);
  const body = { formId: 'household-survey', formVersion: 1, baseVersion: 0, data, deleted: false };
  return Buffer.from(JSON.stringify(body));
}

const LIMIT = 2 * 1024 * 1024;
const SIZES: Record<string, Buffer> = {
  small: payload(5, 40), // cỡ phiếu thường
  medium: payload(100, 2_500), // khoảng 250 KB
  s500k: payload(100, 5_000),
  s750k: payload(100, 7_500),
  s1m: payload(100, 10_000),
  large: payload(200, 10_000), // khoảng 2 MB, sát giới hạn express.json
};
for (const [name, body] of Object.entries(SIZES)) if (body.length > LIMIT) throw new Error(`${name} vượt giới hạn 2mb`);

interface Ready {
  port: number;
  tokens: string[];
  project: string;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
}

function startServer(mode: string, dbPath: string): Promise<{ child: ChildProcess; ready: Ready }> {
  const root = mode === 'baseline' ? (args['baseline-root'] ?? args.root) : args.root;
  const child = spawn(process.execPath, ['--import', 'tsx', join(here, 'notifyLoadServer.ts')], {
    cwd: resolve(args.root, 'server'),
    env: { ...process.env, LOAD_ROOT: root, LOAD_MODE: mode, LOAD_DB: dbPath },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  return new Promise((done, fail) => {
    child.once('exit', (code) => fail(new Error(`server thoát sớm: ${code}`)));
    child.on('message', (message: { type: string } & Ready) => {
      if (message.type === 'ready') done({ child, ready: message });
    });
  });
}

function stats(child: ChildProcess): Promise<unknown> {
  return new Promise((done) => {
    const onMessage = (message: { type: string }) => {
      if (message.type !== 'stats') return;
      child.off('message', onMessage);
      done(message);
    };
    child.on('message', onMessage);
    child.send('stats');
  });
}

interface Sample {
  ms: number;
  status: number;
  error?: string;
}

function put(agent: Agent, ready: Ready, token: string, id: string, body: Buffer): Promise<Sample> {
  return new Promise((done) => {
    const startedAt = performance.now();
    const finish = (status: number, error?: string) => done({ ms: performance.now() - startedAt, status, error });
    const req = request(
      {
        agent,
        host: '127.0.0.1',
        port: ready.port,
        method: 'PUT',
        path: `/api/projects/${ready.project}/records/${id}`,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': id,
        },
        timeout: 120_000,
      },
      (res) => {
        res.resume();
        res.on('end', () => finish(res.statusCode ?? 0));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', (err: NodeJS.ErrnoException) => finish(0, err.code ?? err.name));
    req.end(body);
  });
}

const results: unknown[] = [];
const dbRoot = args['db-dir'];
mkdirSync(dbRoot, { recursive: true });
for (const size of args.sizes.split(',')) {
  const body = SIZES[size];
  if (!body) throw new Error(`size không hợp lệ: ${size}`);
  for (const mode of args.modes.split(',')) {
    const dir = mkdtempSync(join(dbRoot, 'vt082-load-'));
    const { child, ready } = await startServer(mode, join(dir, 'load.db'));
    // Mỗi request một kết nối, như 120 thiết bị riêng.
    const agent = new Agent({ keepAlive: args.keepalive, maxSockets: CONCURRENT });
    const latencies: number[] = [];
    const roundP95: number[] = [];
    const statusCounts: Record<string, number> = {};
    const errors: Record<string, number> = {};
    for (let round = 0; round < Number(args.rounds); round += 1) {
      const batch = await Promise.all(
        ready.tokens.map((token, i) => put(agent, ready, token, `load-${round}-${i}`, body)),
      );
      for (const { status, error } of batch) {
        statusCounts[status] = (statusCounts[status] ?? 0) + 1;
        if (error) errors[error] = (errors[error] ?? 0) + 1;
      }
      // Request lỗi kết nối không có latency thật: đếm riêng, không trộn vào phân vị.
      const ok = batch.filter((r) => r.status !== 0).map((r) => r.ms);
      latencies.push(...ok);
      roundP95.push(percentile(ok.sort((a, b) => a - b), 95));
    }
    latencies.sort((a, b) => a - b);
    const server = await stats(child);
    const p95 = percentile(latencies, 95);
    const result = {
      mode,
      size,
      bodyBytes: body.length,
      rounds: Number(args.rounds),
      okSamples: latencies.length,
      statusCounts,
      errors,
      p50Ms: Math.round(percentile(latencies, 50)),
      p95Ms: Math.round(p95),
      p99Ms: Math.round(percentile(latencies, 99)),
      maxMs: Math.round(latencies[latencies.length - 1] ?? NaN),
      roundP95Ms: roundP95.map(Math.round),
      meetsTarget: p95 <= P95_TARGET_MS && Object.keys(errors).length === 0,
      server,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    agent.destroy();
    child.removeAllListeners('exit');
    await new Promise<void>((done) => {
      child.once('exit', () => done());
      child.kill();
    });
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (args.out) {
  writeFileSync(args.out, `${JSON.stringify({ concurrent: CONCURRENT, targetP95Ms: P95_TARGET_MS, node: process.version, results }, null, 2)}\n`);
}
