import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { openDb, SAMPLE_FORM, tx } from '../../src/db';
import { seedPerf } from '../../src/cli/seedPerf';
import { DEMO_PROJECTS, DEMO_USER_IDS, seedDemo } from '../../src/seedDemo';
import { insertSession, insertUser, newSessionToken } from '../../src/repo/users';

// Kiểm chứng tải cho xuất dữ liệu (BT3 VT-083): `users` tác vụ cùng lúc, mục tiêu p95 ≤ 2,0 s.
// Server chạy ở TIẾN TRÌNH RIÊNG (tsx src/index.ts) với CSDL file tạm, để bên bắn tải không chiếm event
// loop của server. Mỗi tác vụ là một supervisor riêng, phiên thật trong bảng sessions.
//   npx tsx test/load/exportLoad.ts --records 2000 --mode project
// mode: project = GET P/export (JSON cả dự án); form = GET P/export/:formId (CSV có sẵn);
//       mixed = nửa xuất cả dự án, nửa ghi phiếu (PUT) cùng lúc.

const { values } = parseArgs({
  options: {
    records: { type: 'string', default: '2000' },
    users: { type: 'string', default: '60' },
    rounds: { type: 'string', default: '5' },
    mode: { type: 'string', default: 'project' },
    out: { type: 'string' },
  },
});
const RECORDS = Number(values.records);
const USERS = Number(values.users);
const ROUNDS = Number(values.rounds);
const MODE = values.mode;
if (MODE !== 'project' && MODE !== 'form' && MODE !== 'mixed') throw new Error(`mode lạ: ${MODE}`);
const TARGET_P95_MS = 2000;
const PROJECT = DEMO_PROJECTS.yte;

const dir = mkdtempSync(join(tmpdir(), 'field-survey-load-'));
const dbFile = join(dir, 'survey.db');

// Chuẩn bị dữ liệu rồi đóng CSDL trước khi server mở.
const db = openDb(dbFile);
seedDemo(db);
seedPerf(db, { projectId: PROJECT, createdBy: DEMO_USER_IDS.minh, count: RECORDS });
const now = new Date().toISOString();
const supervisors: string[] = [];
const surveyorToken = newSessionToken();
tx(db, () => {
  for (let i = 0; i < USERS; i++) {
    const id = insertUser(db, { username: `load_sup_${i}`, name: `Giám sát tải ${i}`, passwordHash: 'unused', now });
    db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, 'supervisor', ?)`).run(PROJECT, id, now);
    const token = newSessionToken();
    insertSession(db, id, token, now);
    supervisors.push(token);
  }
  insertSession(db, DEMO_USER_IDS.minh, surveyorToken, now);
});
db.close();

const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://localhost:${port}/api/projects/${PROJECT}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  env: { ...process.env, PORT: String(port), DB_PATH: dbFile, UPLOAD_DIR: join(dir, 'uploads') },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise<void>((resolve, reject) => {
  server.once('exit', (code) => reject(new Error(`server thoát sớm (${code})`)));
  server.stdout.on('data', (chunk: Buffer) => {
    if (chunk.toString().includes('API chạy tại')) resolve();
  });
});

interface Sample {
  kind: 'export' | 'write';
  ms: number;
  status: number;
  bytes: number;
  records: number;
}

async function exportTask(token: string): Promise<Sample> {
  const url = MODE === 'form' ? `${base}/export/${SAMPLE_FORM.id}?format=csv` : `${base}/export`;
  const start = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text(); // đo tới khi nhận hết thân, không chỉ header
  const ms = performance.now() - start;
  // Kiểm luôn đúng dữ liệu dưới tải: tải nhanh mà sai phạm vi thì vô nghĩa.
  const records = MODE === 'form' ? body.split('\r\n').filter((l) => l !== '').length - 1 : (JSON.parse(body) as { records: unknown[] }).records.length;
  return { kind: 'export', ms, status: res.status, bytes: body.length, records };
}

async function writeTask(i: number): Promise<Sample> {
  const id = randomUUID();
  const start = performance.now();
  const res = await fetch(`${base}/records/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${surveyorToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ formId: SAMPLE_FORM.id, formVersion: 1, baseVersion: 0, deleted: false, data: { householdName: `Tải ${i}` } }),
  });
  await res.arrayBuffer();
  return { kind: 'write', ms: performance.now() - start, status: res.status, bytes: 0, records: 0 };
}

const round = () =>
  Promise.all(supervisors.map((token, i) => (MODE === 'mixed' && i % 2 === 1 ? writeTask(i) : exportTask(token))));

const pct = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;

try {
  await round(); // khởi động (JIT, cache trang SQLite), không tính
  const samples: Sample[] = [];
  const roundWall: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now();
    samples.push(...(await round()));
    roundWall.push(performance.now() - t0);
  }
  const bad = samples.filter((s) => (s.kind === 'export' ? s.status !== 200 : s.status !== 201));
  const exports = samples.filter((s) => s.kind === 'export');
  const ms = exports.map((s) => s.ms).sort((a, b) => a - b);
  const expectedMin = RECORDS; // mixed: phiếu ghi thêm làm số dòng tăng dần, không được ít hơn
  const wrongCount = exports.filter((s) => (MODE === 'mixed' ? s.records < expectedMin : s.records !== RECORDS)).length;
  const summary = {
    mode: MODE,
    records: RECORDS,
    concurrent: USERS,
    rounds: ROUNDS,
    exportSamples: exports.length,
    p50_ms: Math.round(pct(ms, 50)),
    p95_ms: Math.round(pct(ms, 95)),
    max_ms: Math.round(ms[ms.length - 1] ?? NaN),
    round_wall_ms: roundWall.map(Math.round),
    response_kb: Math.round((exports[0]?.bytes ?? 0) / 1024),
    non_2xx: bad.length,
    wrong_record_count: wrongCount,
    write_p95_ms: MODE === 'mixed' ? Math.round(pct(samples.filter((s) => s.kind === 'write').map((s) => s.ms).sort((a, b) => a - b), 95)) : undefined,
    target_p95_ms: TARGET_P95_MS,
    pass: pct(ms, 95) <= TARGET_P95_MS && bad.length === 0 && wrongCount === 0,
  };
  console.log(JSON.stringify(summary));
  if (values.out) writeFileSync(values.out, JSON.stringify(summary, null, 2));
} finally {
  server.kill();
  await new Promise((r) => server.once('exit', r));
  rmSync(dir, { recursive: true, force: true });
}
