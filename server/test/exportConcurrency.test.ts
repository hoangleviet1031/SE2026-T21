import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FormSchema, ServerRecord } from '@field-survey/shared';
import type { Ctx } from '../src/auth';
import { openDb, SAMPLE_FORM, tx, type Db } from '../src/db';
import { saveFormVersion } from '../src/repo/forms';
import { writeRecord } from '../src/repo/records';
import { createTestServer, type TestServer } from './fixtures';

// Kiểm thử đồng thời cho GET P/export (ca EX-11..EX-14, docs/bt3-23001860/README.md).
// 60 tác vụ cùng lúc theo mức tải của biến thể VT-083. Thứ tự request là một hoán vị cố định
// (không Math.random) để mỗi lần chạy cùng một dữ liệu; kết quả không được phụ thuộc thứ tự hoàn tất.

const N = 60;
const HH = SAMPLE_FORM.id;

interface ProjectExport {
  forms: FormSchema[];
  records: ServerRecord[];
}

function call(method: string, url: string, token: string | undefined, body?: object) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = randomUUID();
  }
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

/** Hoán vị cố định của 0..n-1 (7 nguyên tố cùng nhau với 60), để các loại request đan xen nhau. */
const permuted = <T>(items: T[]): T[] => items.map((_, i) => items[(i * 7) % items.length] as T);

async function putRecord(t: TestServer, project: string, token: string, data: object, formVersion = 1) {
  const id = randomUUID();
  const res = await call('PUT', `${t.base}/api/projects/${project}/records/${id}`, token, {
    formId: HH,
    formVersion,
    baseVersion: 0,
    deleted: false,
    data,
  });
  return { id, status: res.status };
}

describe('nhiều người xuất cùng lúc, mỗi người đúng quyền và đúng phạm vi', () => {
  let t: TestServer;
  const ids = { yte: [] as string[], nongnghiep: [] as string[] };

  beforeAll(async () => {
    t = await createTestServer();
    for (let i = 0; i < 5; i++) {
      ids.yte.push((await putRecord(t, t.projects.yte, t.tokens.minh, { householdName: `Y tế ${i}` })).id);
      ids.nongnghiep.push((await putRecord(t, t.projects.nongnghiep, t.tokens.chu, { householdName: `Nông nghiệp ${i}` })).id);
    }
  });
  afterAll(() => t.close());

  it('EX-11 60 request trộn 6 loại người gọi: không request nào nhận dữ liệu hay mã lỗi của request khác', async () => {
    // [token, dự án, kết quả mong đợi]. Lỗi kiểu "ctx dùng chung giữa các request" sẽ làm một request
    // 403 nhận 200, hoặc chu xuất yte lại nhận phiếu nongnghiep.
    type Expect = { status: 200; ids: string[] } | { status: number; error: string };
    const kinds: [string | undefined, string, Expect][] = [
      [t.tokens.lan, t.projects.yte, { status: 200, ids: ids.yte }],
      [t.tokens.chu, t.projects.yte, { status: 200, ids: ids.yte }],
      [t.tokens.chu, t.projects.nongnghiep, { status: 200, ids: ids.nongnghiep }],
      [t.tokens.minh, t.projects.yte, { status: 403, error: 'forbidden' }],
      [t.tokens.lan, t.projects.nongnghiep, { status: 403, error: 'forbidden' }],
      [t.tokens.admin, t.projects.yte, { status: 403, error: 'not_member' }],
    ];
    const plan = permuted(Array.from({ length: N }, (_, i) => kinds[i % kinds.length]!)); // i % 6 luôn trong mảng

    const results = await Promise.all(
      plan.map(async ([token, project, expected]) => {
        const res = await call('GET', `${t.base}/api/projects/${project}/export`, token);
        return { expected, status: res.status, body: (await res.json()) as ProjectExport | { error: string } };
      }),
    );

    for (const { expected, status, body } of results) {
      expect(status).toBe(expected.status);
      if ('ids' in expected) expect((body as ProjectExport).records.map((r) => r.id)).toEqual(expected.ids);
      else expect(body).toEqual({ error: expected.error });
    }
  });
});

describe('xuất trong lúc đang có người ghi', () => {
  let t: TestServer;
  beforeAll(async () => {
    t = await createTestServer();
  });
  afterAll(() => t.close());

  it('EX-12 30 lần ghi + 30 lần xuất xen nhau: mỗi file là một tiền tố của thứ tự ghi, file cuối đủ mọi phiếu', async () => {
    const tasks = permuted(
      Array.from({ length: N }, (_, i) =>
        i % 2 === 0
          ? { kind: 'write' as const, run: () => putRecord(t, t.projects.yte, i % 4 === 0 ? t.tokens.minh : t.tokens.lan, { householdName: `Hộ ${i}` }) }
          : { kind: 'export' as const, run: () => call('GET', `${t.base}/api/projects/${t.projects.yte}/export`, t.tokens.lan) },
      ),
    );
    const results = await Promise.all(tasks.map(async (task) => ({ kind: task.kind, out: await task.run() })));

    const written = results.flatMap((r) => (r.kind === 'write' && 'id' in r.out ? [r.out] : []));
    expect(written.every((w) => w.status === 201 || w.status === 200)).toBe(true);
    const finalExport = (await (await call('GET', `${t.base}/api/projects/${t.projects.yte}/export`, t.tokens.lan)).json()) as ProjectExport;
    const order = finalExport.records.map((r) => r.id);
    expect(new Set(order)).toEqual(new Set(written.map((w) => w.id)));

    // Mỗi file xuất giữa chừng phải là đúng một tiền tố của thứ tự ghi cuối cùng: không thiếu phiếu ở giữa,
    // không trùng phiếu, không có phiếu "từ tương lai".
    for (const r of results) {
      if (r.kind !== 'export' || !(r.out instanceof Response)) continue;
      expect(r.out.status).toBe(200);
      const got = ((await r.out.json()) as ProjectExport).records.map((x) => x.id);
      expect(got).toEqual(order.slice(0, got.length));
    }
  });
});

describe('quyền bị hạ trong lúc đang xuất', () => {
  let t: TestServer;
  beforeAll(async () => {
    // Server riêng: test này đổi vai trò của lan, không để ảnh hưởng sang test khác (rủi ro shared state).
    t = await createTestServer();
    await putRecord(t, t.projects.yte, t.tokens.minh, { householdName: 'Hộ A' });
  });
  afterAll(() => t.close());

  it('EX-13 hạ supervisor xuống surveyor giữa 60 request: mọi request gửi sau khi hạ xong đều 403', async () => {
    const exportOnce = async () => {
      const res = await call('GET', `${t.base}/api/projects/${t.projects.yte}/export`, t.tokens.lan);
      return { status: res.status, body: (await res.json()) as unknown };
    };
    const before = Array.from({ length: N / 2 }, exportOnce);
    const demote = await call('PUT', `${t.base}/api/projects/${t.projects.yte}/members/u_lan`, t.tokens.chu, { role: 'surveyor' });
    expect(demote.status).toBe(200);
    const after = await Promise.all(Array.from({ length: N / 2 }, exportOnce));

    // Request gửi trước khi hạ xong: được qua hay bị chặn đều đúng, miễn không có trạng thái thứ ba.
    for (const r of await Promise.all(before)) expect([200, 403]).toContain(r.status);
    for (const r of after) expect(r).toEqual({ status: 403, body: { error: 'forbidden' } });
  });
});

describe('một kết nối CSDL khác ghi xen giữa hai câu đọc của export (CLI seed:perf, user:*)', () => {
  let dir: string | undefined;
  let t: TestServer | undefined;
  let other: Db | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    other?.close();
    t?.close();
    t?.db.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('EX-14 file xuất là một ảnh chụp nhất quán: hoặc thấy cả form mới lẫn phiếu dùng form đó, hoặc không thấy cái nào', async () => {
    // CSDL file thật ở chế độ WAL: :memory: không mở được kết nối thứ hai. Trong một tiến trình Node, các
    // handler đồng bộ không chen nhau được, nên chỉ kết nối khác mới tạo ra được đúng khe hở này. Chèn
    // lần ghi vào đúng lúc server chuẩn bị câu đọc phiếu (sau khi đã đọc form) để ca này tất định.
    dir = mkdtempSync(join(tmpdir(), 'field-survey-export-'));
    const file = join(dir, 'survey.db');
    const srv = (t = await createTestServer({ dbPath: file }));
    const conn = (other = openDb(file));
    const ctx: Ctx = { userId: 'u_chu', projectId: srv.projects.yte, role: 'owner' };
    const lateRecord = randomUUID();

    let armed = true;
    const prepare = srv.db.prepare.bind(srv.db);
    vi.spyOn(srv.db, 'prepare').mockImplementation((sql: string) => {
      if (armed && sql.includes('FROM records r')) {
        armed = false;
        const saved = saveFormVersion(ctx, conn, { id: 'late-form', title: 'Form mới', fields: [{ id: 'x', type: 'text', label: 'X' }] }, new Date().toISOString());
        expect(saved.ok).toBe(true);
        tx(conn, () => writeRecord(ctx, conn, { id: lateRecord, formId: 'late-form', formVersion: 1, data: { x: 'a' }, deleted: false }));
      }
      return prepare(sql);
    });

    const during = (await (await call('GET', `${srv.base}/api/projects/${srv.projects.yte}/export`, srv.tokens.lan)).json()) as ProjectExport;
    expect(armed).toBe(false); // lần ghi xen đã thật sự chạy giữa chừng
    const sawForm = during.forms.some((f) => f.id === 'late-form');
    const sawRecord = during.records.some((r) => r.id === lateRecord);
    expect({ sawForm, sawRecord }).toEqual({ sawForm: false, sawRecord: false });

    const after = (await (await call('GET', `${srv.base}/api/projects/${srv.projects.yte}/export`, srv.tokens.lan)).json()) as ProjectExport;
    expect(after.forms.some((f) => f.id === 'late-form')).toBe(true);
    expect(after.records.map((r) => r.id)).toContain(lateRecord);
  });
});
