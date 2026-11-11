import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, tx } from '../../src/db';
import { requestHash, saveResponse } from '../../src/repo/idempotency';
import { writeRecord } from '../../src/repo/records';
import { DEMO_PROJECTS, DEMO_USER_IDS, seedDemo } from '../../src/seedDemo';
import type { Ctx } from '../../src/auth';

// Chi phí từng bước của một PUT tạo phiếu trên event loop, đo bằng đúng các hàm server dùng, CSDL file WAL.
// Trả lời: phiếu lớn chậm ở đâu? Cách chạy: docs/bt3-vt082/README.md.

const SIZES: Array<[string, number, number]> = [
  ['small', 5, 40],
  ['250KB', 100, 2_500],
  ['2MB', 200, 10_000],
];
const ITERATIONS = 20;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const ctx: Ctx = { userId: DEMO_USER_IDS.minh, projectId: DEMO_PROJECTS.yte, role: 'surveyor' };

for (const [name, fields, chars] of SIZES) {
  const dir = mkdtempSync(join(process.env.LOAD_DB_DIR ?? tmpdir(), 'vt082-cost-'));
  const db = openDb(join(dir, 'cost.db'));
  seedDemo(db);
  const data: Record<string, string> = { householdName: 'Hộ tải thử' };
  for (let i = 0; i < fields; i += 1) data[`f${i}`] = 'x'.repeat(chars);
  const text = JSON.stringify({ formId: 'household-survey', formVersion: 1, baseVersion: 0, data, deleted: false });

  const steps: Record<string, number[]> = { parseBody: [], requestHash: [], txWriteAndCommit: [], stringifyResponse: [] };
  const timed = <T>(step: string, fn: () => T): T => {
    const startedAt = performance.now();
    const out = fn();
    steps[step]!.push(performance.now() - startedAt);
    return out;
  };
  for (let i = 0; i < ITERATIONS; i += 1) {
    const id = `cost-${i}`;
    const body = timed('parseBody', () => JSON.parse(text) as { data: Record<string, string> });
    const hash = timed('requestHash', () => requestHash(ctx, id, body));
    const saved = timed('txWriteAndCommit', () =>
      tx(db, () => {
        const record = writeRecord(ctx, db, { id, formId: 'household-survey', formVersion: 1, data: body.data, deleted: false });
        saveResponse(ctx, db, id, id, hash, 201, record);
        return record;
      }),
    );
    timed('stringifyResponse', () => JSON.stringify(saved));
  }
  const medians = Object.fromEntries(Object.entries(steps).map(([step, xs]) => [step, Number(median(xs).toFixed(2))]));
  const totalMs = Number(Object.values(medians).reduce((a, b) => a + b, 0).toFixed(2));
  console.log(JSON.stringify({ size: name, bodyBytes: text.length, iterations: ITERATIONS, medianMs: medians, totalMs }));
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
