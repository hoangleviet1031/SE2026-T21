import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { nextSeq, SAMPLE_FORM, tx, type Db } from '../db';
import { findUserByUsername } from '../repo/users';
import { openDbFromEnv } from './openDbFromEnv';

// Dữ liệu để đo hiệu năng (TV2-11, design §11.2, docs/perf.md): N phiếu của form mẫu trong một dự án
// có sẵn. Ghi như một lần PUT thật (records + record_history version 1, seq cấp bằng nextSeq trong
// cùng transaction), để pull đo được đúng đường đi thật.
//   npm run seed:perf -w server -- --project <projectId> --user <username> [--count 5000]
// Server E2E chạy CSDL :memory: nên E2E gọi POST /api/__test/seed-perf (cùng hàm này).

export const MAX_PERF_RECORDS = 20_000;

/** Lỗi do người gọi nhập sai (dự án, người dùng, số lượng); CLI in ra, route kiểm thử trả 400/404. */
export class SeedPerfError extends Error {}

const WATER = ['Máy', 'Giếng', 'Mưa', 'Khác'];
const ASSETS = ['Xe máy', 'Tivi', 'Tủ lạnh', 'Máy giặt'];

/** Dữ liệu một hộ, đủ các trường không phải ảnh của form mẫu, cỡ gần với phiếu thật. */
function householdData(i: number): Record<string, unknown> {
  return {
    householdName: `Hộ thử hiệu năng số ${i + 1}`,
    members: (i % 9) + 1,
    waterSource: WATER[i % WATER.length],
    assets: ASSETS.filter((_, k) => (i >> k) & 1),
    visitDate: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    location: { lat: 21 + (i % 1000) / 10_000, lng: 105.8 + (i % 997) / 10_000, accuracy: 15 },
  };
}

/**
 * Thêm `count` phiếu do `createdBy` tạo vào dự án `projectId` trong MỘT transaction. Form mẫu được
 * thêm vào dự án nếu chưa có. `updated_at` lùi dần mỗi phiếu 1 giây để danh sách có thứ tự rõ.
 */
export function seedPerf(db: Db, opts: { projectId: string; createdBy: string; count: number }): number {
  const { projectId, createdBy, count } = opts;
  if (!Number.isInteger(count) || count < 1 || count > MAX_PERF_RECORDS) {
    throw new SeedPerfError(`Số phiếu phải là số nguyên 1–${MAX_PERF_RECORDS}.`);
  }
  const base = Date.now();
  return tx(db, () => {
    if (db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(projectId) === undefined) {
      throw new SeedPerfError(`Không có dự án ${projectId}.`);
    }
    if (db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(createdBy) === undefined) {
      throw new SeedPerfError(`Không có người dùng ${createdBy}.`);
    }
    db.prepare(
      `INSERT OR IGNORE INTO forms (project_id, id, version, schema, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(projectId, SAMPLE_FORM.id, SAMPLE_FORM.version, JSON.stringify(SAMPLE_FORM), new Date(base).toISOString(), 'system');
    const insertRecord = db.prepare(
      `INSERT INTO records (id, project_id, form_id, form_version, data, version, deleted, created_by, updated_at, updated_by, seq)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)`,
    );
    const insertHistory = db.prepare(
      `INSERT INTO record_history (record_id, project_id, version, data, deleted, updated_at, updated_by)
       VALUES (?, ?, 1, ?, 0, ?, ?)`,
    );
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      const data = JSON.stringify(householdData(i));
      const updatedAt = new Date(base - i * 1000).toISOString();
      insertRecord.run(id, projectId, SAMPLE_FORM.id, SAMPLE_FORM.version, data, createdBy, updatedAt, createdBy, nextSeq(db));
      insertHistory.run(id, projectId, data, updatedAt, createdBy);
    }
    return count;
  });
}

/** Chạy lệnh, trả mã thoát. Tách khỏi process để test được. */
export function runSeedPerfCli(
  argv: string[],
  db: Db,
  env: NodeJS.ProcessEnv,
  io: { out: (line: string) => void; err: (line: string) => void },
): number {
  // Dữ liệu giả lẫn vào dữ liệu thật thì không gỡ ra được: chỉ cho chạy ngoài production, như seed:demo.
  if (env.NODE_ENV === 'production') {
    io.err('Không chạy seed:perf khi NODE_ENV=production: phiếu giả sẽ lẫn vào dữ liệu thật.');
    return 1;
  }
  try {
    const { values } = parseArgs({
      args: argv,
      options: { project: { type: 'string' }, user: { type: 'string' }, count: { type: 'string', default: '5000' } },
    });
    if (!values.project || !values.user) throw new SeedPerfError('Cần --project <projectId> và --user <username>.');
    const user = findUserByUsername(db, values.user.toLowerCase());
    if (!user) throw new SeedPerfError(`Không có tài khoản ${values.user}.`);
    const started = performance.now();
    const n = seedPerf(db, { projectId: values.project, createdBy: user.id, count: Number(values.count) });
    io.out(`Đã thêm ${n} phiếu vào ${values.project} (người tạo ${user.username ?? user.id}) trong ${Math.round(performance.now() - started)} ms.`);
    return 0;
  } catch (e) {
    // parseArgs ném TypeError có `code` khi gặp cờ lạ; cả hai đều là lỗi nhập lệnh, lỗi khác ném tiếp.
    if (e instanceof SeedPerfError || (e instanceof TypeError && 'code' in e)) {
      io.err(e.message);
      return 1;
    }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDbFromEnv();
  try {
    process.exitCode = runSeedPerfCli(process.argv.slice(2), db, process.env, { out: console.log, err: console.error });
  } finally {
    db.close();
  }
}
