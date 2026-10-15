import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupStaleChunks, detectImageType, MAX_CHUNK_BYTES } from '../src/uploads';
import { createTestServer, type TestServer } from './fixtures';

// Upload ảnh theo chunk: design §4.4, §5.6, §7, §7.1, §9 (Upload). Ticket TV3-05.
// minh: surveyor ở demo-yte; lan: supervisor ở demo-yte, surveyor ở demo-nongnghiep.

let t: TestServer;
let recordOfMinh: string; // phiếu của minh ở yte
let recordOfLan: string; // phiếu của lan ở yte
let recordInNongnghiep: string; // phiếu của lan ở nongnghiep

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const jpeg = (size: number) => Buffer.concat([JPEG_MAGIC, randomBytes(size - JPEG_MAGIC.length)]);
const png = (size: number) => Buffer.concat([PNG_MAGIC, randomBytes(size - PNG_MAGIC.length)]);
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function chunksOf(file: Buffer): Buffer[] {
  const out: Buffer[] = [];
  for (let i = 0; i < file.length; i += MAX_CHUNK_BYTES) out.push(file.subarray(i, i + MAX_CHUNK_BYTES));
  return out;
}

const attUrl = (project: string, id: string) => `${t.base}/api/projects/${project}/attachments/${id}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function putChunk(project: string, token: string, id: string, index: number | string, body: Buffer) {
  return fetch(`${attUrl(project, id)}/chunks/${index}`, {
    method: 'PUT',
    headers: { ...auth(token), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(body),
  });
}

async function received(project: string, token: string, id: string) {
  const res = await fetch(`${attUrl(project, id)}/status`, { headers: auth(token) });
  return { status: res.status, body: await res.json() };
}

function complete(project: string, token: string, id: string, body: object) {
  return fetch(`${attUrl(project, id)}/complete`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Gửi mọi chunk rồi complete; trả response của complete. */
async function upload(
  project: string,
  token: string,
  id: string,
  file: Buffer,
  meta: { recordId: string; mimeType?: string; sha256?: string },
) {
  const parts = chunksOf(file);
  for (const [i, part] of parts.entries()) expect((await putChunk(project, token, id, i, part)).status).toBe(201);
  return complete(project, token, id, {
    recordId: meta.recordId,
    totalChunks: parts.length,
    mimeType: meta.mimeType ?? 'image/jpeg',
    sha256: meta.sha256 ?? sha256(file),
  });
}

async function createRecord(project: string, token: string): Promise<string> {
  const id = randomUUID();
  const res = await fetch(`${t.base}/api/projects/${project}/records/${id}`, {
    method: 'PUT',
    headers: { ...auth(token), 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ formId: 'household-survey', formVersion: 1, baseVersion: 0, deleted: false, data: {} }),
  });
  expect(res.status).toBe(201);
  return id;
}

beforeAll(async () => {
  t = await createTestServer();
  recordOfMinh = await createRecord(t.projects.yte, t.tokens.minh);
  recordOfLan = await createRecord(t.projects.yte, t.tokens.lan);
  recordInNongnghiep = await createRecord(t.projects.nongnghiep, t.tokens.lan);
});
afterAll(() => t.close());

describe('upload đủ chunk', () => {
  it('status, gửi từng chunk, complete rồi tải về đúng từng byte', async () => {
    const id = randomUUID();
    const file = jpeg(2 * MAX_CHUNK_BYTES + 1000); // 3 chunk
    const parts = chunksOf(file);

    expect(await received(t.projects.yte, t.tokens.minh, id)).toEqual({ status: 200, body: { received: [] } });
    expect((await putChunk(t.projects.yte, t.tokens.minh, id, 0, parts[0] as Buffer)).status).toBe(201);
    expect((await putChunk(t.projects.yte, t.tokens.minh, id, 2, parts[2] as Buffer)).status).toBe(201);
    expect(await received(t.projects.yte, t.tokens.minh, id)).toEqual({ status: 200, body: { received: [0, 2] } });
    expect((await putChunk(t.projects.yte, t.tokens.minh, id, 1, parts[1] as Buffer)).status).toBe(201);

    const res = await complete(t.projects.yte, t.tokens.minh, id, {
      recordId: recordOfMinh,
      totalChunks: 3,
      mimeType: 'image/jpeg',
      sha256: sha256(file),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id,
      recordId: recordOfMinh,
      mimeType: 'image/jpeg',
      size: file.length,
      sha256: sha256(file),
    });

    const got = await fetch(attUrl(t.projects.yte, id), { headers: auth(t.tokens.minh) });
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await got.arrayBuffer()).equals(file)).toBe(true);

    // Chunk tạm đã dọn, chỉ còn file đã ghép.
    expect(readdirSync(join(t.uploadDir, t.projects.yte, id))).toEqual(['file']);
    // Ảnh đã xong: status báo đủ mọi chunk để client không gửi lại.
    expect(await received(t.projects.yte, t.tokens.minh, id)).toEqual({ status: 200, body: { received: [0, 1, 2] } });
  });

  it('gửi lại chunk đã có trả 200 và không ghi lại', async () => {
    const id = randomUUID();
    const file = jpeg(1000);
    expect((await putChunk(t.projects.yte, t.tokens.minh, id, 0, file)).status).toBe(201);
    // Lần hai gửi nội dung khác: server giữ bản đầu, nên complete với hash của bản đầu vẫn đúng.
    expect((await putChunk(t.projects.yte, t.tokens.minh, id, 0, jpeg(1000))).status).toBe(200);
    const res = await complete(t.projects.yte, t.tokens.minh, id, {
      recordId: recordOfMinh,
      totalChunks: 1,
      mimeType: 'image/jpeg',
      sha256: sha256(file),
    });
    expect(res.status).toBe(201);
  });

  it('complete lại ảnh đã xong: cùng hash trả 200, khác hash trả 422', async () => {
    const id = randomUUID();
    const file = png(5000);
    const meta = { recordId: recordOfMinh, mimeType: 'image/png' };
    const first = await upload(t.projects.yte, t.tokens.minh, id, file, meta);
    expect(first.status).toBe(201);
    const body = { ...meta, totalChunks: 1, sha256: sha256(file) };

    const again = await complete(t.projects.yte, t.tokens.minh, id, body);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(await first.json());

    const other = await complete(t.projects.yte, t.tokens.minh, id, { ...body, sha256: sha256(png(5000)) });
    expect(other.status).toBe(422);
    expect(await other.json()).toEqual({ error: 'checksum_mismatch' });
  });

  it('chunk gửi tới ảnh đã xong trả 200, không đổi file', async () => {
    const id = randomUUID();
    const file = jpeg(3000);
    expect((await upload(t.projects.yte, t.tokens.minh, id, file, { recordId: recordOfMinh })).status).toBe(201);
    expect((await putChunk(t.projects.yte, t.tokens.minh, id, 0, jpeg(3000))).status).toBe(200);
    const got = await fetch(attUrl(t.projects.yte, id), { headers: auth(t.tokens.minh) });
    expect(Buffer.from(await got.arrayBuffer()).equals(file)).toBe(true);
  });
});

describe('lỗi khi complete', () => {
  it('thiếu chunk trả 409 missing_chunks kèm chỉ số thiếu', async () => {
    const id = randomUUID();
    const parts = chunksOf(jpeg(2 * MAX_CHUNK_BYTES + 10));
    await putChunk(t.projects.yte, t.tokens.minh, id, 0, parts[0] as Buffer);
    await putChunk(t.projects.yte, t.tokens.minh, id, 2, parts[2] as Buffer);
    const res = await complete(t.projects.yte, t.tokens.minh, id, {
      recordId: recordOfMinh,
      totalChunks: 3,
      mimeType: 'image/jpeg',
      sha256: 'a'.repeat(64),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'missing_chunks', details: [1] });
  });

  it('sai SHA-256 trả 422 và xoá chunk tạm để client gửi lại từ đầu (§5.6)', async () => {
    const id = randomUUID();
    const res = await upload(t.projects.yte, t.tokens.minh, id, jpeg(1000), {
      recordId: recordOfMinh,
      sha256: sha256(jpeg(1000)),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'checksum_mismatch' });
    expect(await received(t.projects.yte, t.tokens.minh, id)).toEqual({ status: 200, body: { received: [] } });
  });

  it('không phải JPEG/PNG/WebP trả 415', async () => {
    const res = await upload(t.projects.yte, t.tokens.minh, randomUUID(), randomBytes(1000), { recordId: recordOfMinh });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'unsupported_media_type' });
  });

  it('magic bytes khác mimeType khai báo trả 415', async () => {
    const res = await upload(t.projects.yte, t.tokens.minh, randomUUID(), png(1000), {
      recordId: recordOfMinh,
      mimeType: 'image/jpeg',
    });
    expect(res.status).toBe(415);
  });

  it('khai báo loại ảnh không hỗ trợ trả 415', async () => {
    const res = await upload(t.projects.yte, t.tokens.minh, randomUUID(), jpeg(1000), {
      recordId: recordOfMinh,
      mimeType: 'image/gif',
    });
    expect(res.status).toBe(415);
  });

  it('thân thiếu trường hoặc sai kiểu trả 400 invalid_body', async () => {
    const id = randomUUID();
    const valid = { recordId: recordOfMinh, totalChunks: 1, mimeType: 'image/jpeg', sha256: 'a'.repeat(64) };
    for (const body of [
      {},
      { ...valid, recordId: '' },
      { ...valid, totalChunks: 0 },
      { ...valid, totalChunks: 1.5 },
      { ...valid, sha256: 'xyz' },
    ]) {
      const res = await complete(t.projects.yte, t.tokens.minh, id, body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
  });
});

describe('giới hạn kích thước', () => {
  it('chunk lớn hơn 256 KB trả 413', async () => {
    const res = await putChunk(t.projects.yte, t.tokens.minh, randomUUID(), 0, jpeg(MAX_CHUNK_BYTES + 1));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'payload_too_large' });
  });

  it('chunk đúng 256 KB được nhận', async () => {
    expect((await putChunk(t.projects.yte, t.tokens.minh, randomUUID(), 0, jpeg(MAX_CHUNK_BYTES))).status).toBe(201);
  });

  it('chỉ số chunk từ 40 trở lên (ảnh quá 10 MB) trả 413', async () => {
    const res = await putChunk(t.projects.yte, t.tokens.minh, randomUUID(), 40, jpeg(100));
    expect(res.status).toBe(413);
    const done = await complete(t.projects.yte, t.tokens.minh, randomUUID(), {
      recordId: recordOfMinh,
      totalChunks: 41,
      mimeType: 'image/jpeg',
      sha256: 'a'.repeat(64),
    });
    expect(done.status).toBe(413);
  });

  it('chunk rỗng hoặc chỉ số không hợp lệ trả 400', async () => {
    const id = randomUUID();
    expect((await putChunk(t.projects.yte, t.tokens.minh, id, 0, Buffer.alloc(0))).status).toBe(400);
    for (const index of ['-1', 'abc', '1.5']) {
      expect((await putChunk(t.projects.yte, t.tokens.minh, id, index, jpeg(100))).status).toBe(400);
    }
  });
});

describe('id ảnh và đường dẫn file', () => {
  it('id không phải UUID trả 400, không tạo file ngoài thư mục upload', async () => {
    for (const id of ['khong-phai-uuid', encodeURIComponent('../../thoat-ra')]) {
      expect((await putChunk(t.projects.yte, t.tokens.minh, id, 0, jpeg(100))).status).toBe(400);
      expect((await received(t.projects.yte, t.tokens.minh, id)).status).toBe(400);
    }
    expect(existsSync(join(t.uploadDir, '..', 'thoat-ra'))).toBe(false);
    expect(existsSync(join(t.uploadDir, 'thoat-ra'))).toBe(false);
  });
});

describe('phạm vi và cách ly dự án (ADR 0002 §3)', () => {
  it('id ảnh đã có ở dự án khác: mọi thao tác qua đường dẫn dự án này trả 404', async () => {
    const id = randomUUID();
    const file = jpeg(2000);
    expect((await upload(t.projects.yte, t.tokens.lan, id, file, { recordId: recordOfLan })).status).toBe(201);

    // lan là thành viên nongnghiep nên qua được requireMember; id thuộc yte nên phải 404.
    const p = t.projects.nongnghiep;
    expect((await received(p, t.tokens.lan, id)).status).toBe(404);
    expect((await putChunk(p, t.tokens.lan, id, 0, jpeg(2000))).status).toBe(404);
    const done = await complete(p, t.tokens.lan, id, {
      recordId: recordInNongnghiep,
      totalChunks: 1,
      mimeType: 'image/jpeg',
      sha256: sha256(file),
    });
    expect(done.status).toBe(404);
    expect((await fetch(attUrl(p, id), { headers: auth(t.tokens.lan) })).status).toBe(404);
  });

  it('gắn ảnh vào phiếu của dự án khác trả 404', async () => {
    const res = await upload(t.projects.nongnghiep, t.tokens.lan, randomUUID(), jpeg(1000), { recordId: recordOfLan });
    expect(res.status).toBe(404);
  });

  it('surveyor gắn ảnh vào phiếu của người khác, hoặc phiếu không tồn tại, trả 404', async () => {
    for (const recordId of [recordOfLan, randomUUID()]) {
      const res = await upload(t.projects.yte, t.tokens.minh, randomUUID(), jpeg(1000), { recordId });
      expect(res.status).toBe(404);
    }
  });

  it('surveyor không tải được ảnh của phiếu người khác; supervisor tải được ảnh của surveyor', async () => {
    const ofLan = randomUUID();
    expect((await upload(t.projects.yte, t.tokens.lan, ofLan, jpeg(1000), { recordId: recordOfLan })).status).toBe(201);
    expect((await fetch(attUrl(t.projects.yte, ofLan), { headers: auth(t.tokens.minh) })).status).toBe(404);
    expect((await received(t.projects.yte, t.tokens.minh, ofLan)).status).toBe(404);

    const ofMinh = randomUUID();
    expect((await upload(t.projects.yte, t.tokens.minh, ofMinh, jpeg(1000), { recordId: recordOfMinh })).status).toBe(201);
    expect((await fetch(attUrl(t.projects.yte, ofMinh), { headers: auth(t.tokens.lan) })).status).toBe(200);
  });

  it('ảnh chưa complete thì không tải được', async () => {
    const id = randomUUID();
    await putChunk(t.projects.yte, t.tokens.minh, id, 0, jpeg(100));
    expect((await fetch(attUrl(t.projects.yte, id), { headers: auth(t.tokens.minh) })).status).toBe(404);
  });
});

describe('detectImageType (magic bytes)', () => {
  it('nhận JPEG, PNG, WebP; từ chối loại khác', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
    expect(detectImageType(jpeg(10))).toBe('image/jpeg');
    expect(detectImageType(png(10))).toBe('image/png');
    expect(detectImageType(webp)).toBe('image/webp');
    expect(detectImageType(Buffer.from('GIF89a......'))).toBeUndefined();
    expect(detectImageType(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('cleanupStaleChunks (dọn rác §5.6)', () => {
  it('xoá chunk tạm cũ hơn 7 ngày, giữ chunk mới và ảnh đã xong', () => {
    const root = mkdtempSync(join(tmpdir(), 'field-survey-cleanup-'));
    try {
      const now = new Date('2026-10-15T00:00:00Z');
      const old = new Date(now.getTime() - 8 * 24 * 3600 * 1000);
      const write = (rel: string, mtime: Date) => {
        const path = join(root, rel);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, 'x');
        utimesSync(path, mtime, mtime);
      };
      write('demo-yte/old-upload/0.part', old);
      write('demo-yte/new-upload/0.part', now);
      write('demo-yte/done/file', old);

      expect(cleanupStaleChunks(root, now)).toBe(1);
      expect(existsSync(join(root, 'demo-yte/old-upload'))).toBe(false);
      expect(existsSync(join(root, 'demo-yte/new-upload/0.part'))).toBe(true);
      expect(readFileSync(join(root, 'demo-yte/done/file'), 'utf8')).toBe('x');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('thư mục upload chưa tồn tại thì không lỗi', () => {
    expect(cleanupStaleChunks(join(tmpdir(), `khong-co-${randomUUID()}`), new Date())).toBe(0);
  });
});
