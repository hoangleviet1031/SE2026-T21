import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { MAX_CHUNK_BYTES } from '../src/uploads';
import { createTestServer, type TestServer } from './fixtures';

// Sao lưu hằng ngày CSDL và ảnh: scripts/backup-daily.mjs, design §12, ticket TV3-13.
// Chạy script thật trong tiến trình riêng như systemd timer trên staging, khi server vẫn đang
// mở CSDL ở chế độ WAL.

const SCRIPT = fileURLToPath(new URL('../../scripts/backup-daily.mjs', import.meta.url));
const BACKUP_NAME = /^\d{8}-\d{6}$/;

let t: TestServer;
let workDir: string;
let dbFile: string;
let recordId: string;
const images: { id: string; sha256: string }[] = [];
let partialId: string;

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const jpeg = (size: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(size - 4)]);
const api = (path: string) => `${t.base}/api/projects/${t.projects.yte}${path}`;
const auth = () => ({ Authorization: `Bearer ${t.tokens.minh}` });

function putChunk(id: string, index: number, body: Buffer) {
  return fetch(api(`/attachments/${id}/chunks/${index}`), {
    method: 'PUT',
    headers: { ...auth(), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(body),
  });
}

async function uploadImage(file: Buffer): Promise<string> {
  const id = randomUUID();
  let total = 0;
  for (let i = 0; i < file.length; i += MAX_CHUNK_BYTES, total++) {
    expect((await putChunk(id, total, file.subarray(i, i + MAX_CHUNK_BYTES))).status).toBe(201);
  }
  const res = await fetch(api(`/attachments/${id}/complete`), {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, totalChunks: total, mimeType: 'image/jpeg', sha256: sha256(file) }),
  });
  expect(res.status).toBe(201);
  return id;
}

function runBackup(uploadDir: string, outDir: string) {
  return spawnSync(process.execPath, ['--no-warnings', SCRIPT, dbFile, uploadDir, outDir], { encoding: 'utf8' });
}

const backupsIn = (outDir: string) => readdirSync(outDir).filter((n) => BACKUP_NAME.test(n)).sort();
const newOutDir = () => mkdtempSync(join(workDir, 'out-'));

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'field-survey-backup-'));
  dbFile = join(workDir, 'survey.db');
  t = await createTestServer({ dbPath: dbFile });

  recordId = randomUUID();
  const res = await fetch(api(`/records/${recordId}`), {
    method: 'PUT',
    headers: { ...auth(), 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ formId: 'household-survey', formVersion: 1, baseVersion: 0, deleted: false, data: {} }),
  });
  expect(res.status).toBe(201);

  for (const file of [jpeg(2 * MAX_CHUNK_BYTES + 500), jpeg(1000)]) {
    images.push({ id: await uploadImage(file), sha256: sha256(file) });
  }
  // Ảnh tải dở: mới có chunk 0, chưa complete.
  partialId = randomUUID();
  expect((await putChunk(partialId, 0, jpeg(MAX_CHUNK_BYTES))).status).toBe(201);
});

afterAll(() => {
  t.close();
  t.db.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('sao lưu khi server đang chạy', () => {
  it('bản sao lưu mở được: có phiếu, có dòng ảnh, file ảnh đúng SHA-256', () => {
    const out = newOutDir();
    const run = runBackup(t.uploadDir, out);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);

    const [name] = backupsIn(out);
    expect(name).toBeDefined();
    const dir = join(out, name as string);
    const copy = new DatabaseSync(join(dir, 'survey.db'), { readOnly: true });
    try {
      // Phiếu vừa ghi có thể mới nằm trong file WAL: bản sao vẫn phải có.
      expect(copy.prepare('SELECT id FROM records WHERE id = ?').get(recordId)).toEqual({ id: recordId });
      const rows = copy.prepare('SELECT id, sha256 FROM attachments ORDER BY id').all();
      expect(rows).toEqual([...images].sort((a, b) => a.id.localeCompare(b.id)));
    } finally {
      copy.close();
    }
    for (const img of images) {
      expect(sha256(readFileSync(join(dir, 'uploads', t.projects.yte, img.id, 'file')))).toBe(img.sha256);
    }
  });

  it('không chép chunk của ảnh tải dở', () => {
    const out = newOutDir();
    expect(runBackup(t.uploadDir, out).status).toBe(0);
    const dir = join(out, backupsIn(out)[0] as string);
    expect(existsSync(join(t.uploadDir, t.projects.yte, partialId, '0.part'))).toBe(true);
    expect(existsSync(join(dir, 'uploads', t.projects.yte, partialId))).toBe(false);
  });
});

describe('bản sao lưu hỏng không được tính', () => {
  it('CSDL có ảnh mà thư mục ảnh thiếu: báo lỗi, không tạo bản mới, bản cũ còn nguyên', () => {
    const out = newOutDir();
    mkdirSync(join(out, '20200101-000000'));
    writeFileSync(join(out, '20200101-000000', 'cu.txt'), 'bản cũ');
    const emptyUploads = mkdtempSync(join(workDir, 'uploads-'));

    const run = runBackup(emptyUploads, out);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`${t.projects.yte}/${images[0]?.id}: thiếu file`);
    expect(readdirSync(out)).toEqual(['20200101-000000']);
    expect(readFileSync(join(out, '20200101-000000', 'cu.txt'), 'utf8')).toBe('bản cũ');
  });

  it('thiếu tham số: báo cách dùng', () => {
    const run = spawnSync(process.execPath, ['--no-warnings', SCRIPT], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Cách dùng');
  });
});

describe('xoay vòng', () => {
  it('giữ 7 bản mới nhất, dọn thư mục tạm còn sót, không đụng file khác', () => {
    const out = newOutDir();
    const old = ['20200101', '20200102', '20200103', '20200104', '20200105', '20200106', '20200107'].map(
      (d) => `${d}-000000`,
    );
    for (const name of old) mkdirSync(join(out, name));
    mkdirSync(join(out, '.20200108-000000.tmp'));
    writeFileSync(join(out, 'ghi-chu.txt'), 'của người vận hành');

    expect(runBackup(t.uploadDir, out).status).toBe(0);

    const kept = backupsIn(out);
    expect(kept).toHaveLength(7);
    expect(kept).not.toContain('20200101-000000');
    expect(kept.slice(0, 6)).toEqual(old.slice(1));
    expect(readdirSync(out).sort()).toEqual([...kept, 'ghi-chu.txt'].sort());
  });
});
