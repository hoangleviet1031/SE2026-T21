import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FieldDef, FormSchema, SaveFormRequest } from '@field-survey/shared';
import { DEMO_USER_IDS } from '../src/seedDemo';
import { createTestServer, type TestServer } from './fixtures';

// POST P/forms (TV1-03): validate theo design §4.1, version tự tăng, chỉ giám sát viên (A3).

let t: TestServer;

beforeAll(async () => {
  t = await createTestServer();
});
afterAll(() => t.close());

function call(method: string, path: string, token: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${t.base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const formsPath = (projectId: string) => `/projects/${projectId}/forms`;
const save = (body: unknown, token: string = t.tokens.lan, projectId: string = t.projects.yte) =>
  call('POST', formsPath(projectId), token, body);

const NAME: FieldDef = { id: 'householdName', type: 'text', label: 'Tên chủ hộ', required: true };
const WATER: FieldDef = { id: 'water', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng'] };

let seq = 0;
/** Mỗi test một id form riêng để không phụ thuộc thứ tự chạy. */
function newForm(): SaveFormRequest {
  seq += 1;
  return {
    id: `form${seq}`,
    title: 'Khảo sát nước',
    fields: [NAME, WATER],
  };
}

describe('POST P/forms', () => {
  it('giám sát viên tạo v1 rồi v2; GET trả bản mới nhất và đủ hai phiên bản', async () => {
    const v1 = newForm();
    const res1 = await save(v1);
    expect(res1.status).toBe(201);
    expect(await res1.json()).toEqual({ ...v1, version: 1 });

    const v2: SaveFormRequest = {
      ...v1,
      fields: [{ ...NAME, hidden: true }, WATER, { id: 'members', type: 'number', label: 'Số người' }],
    };
    const res2 = await save(v2);
    expect(res2.status).toBe(201);
    expect(((await res2.json()) as FormSchema).version).toBe(2);

    const latest = (await (await call('GET', formsPath(t.projects.yte), t.tokens.minh)).json()) as FormSchema[];
    expect(latest.find((f) => f.id === v1.id)).toEqual({ ...v2, version: 2 });
    const old = await call('GET', `${formsPath(t.projects.yte)}/${v1.id}/versions/1`, t.tokens.minh);
    expect(await old.json()).toEqual({ ...v1, version: 1 });
  });

  it('bỏ qua version client gửi, server tự đặt', async () => {
    const res = await save({ ...newForm(), version: 99 });
    expect(((await res.json()) as FormSchema).version).toBe(1);
  });

  it('lưu created_by từ token', async () => {
    const f = newForm();
    await save(f);
    const row = t.db
      .prepare(`SELECT created_by FROM forms WHERE project_id = ? AND id = ?`)
      .get(t.projects.yte, f.id) as { created_by: string };
    expect(row.created_by).toBe(DEMO_USER_IDS.lan);
  });

  it('hai request song song ra hai version khác nhau', async () => {
    const f = newForm();
    const results = await Promise.all([save(f), save(f)]);
    const versions = await Promise.all(results.map(async (r) => ((await r.json()) as FormSchema).version));
    expect(versions.sort()).toEqual([1, 2]);
  });

  it('đổi type hoặc thiếu trường cũ: 400 invalid_form kèm details', async () => {
    const v1 = newForm();
    await save(v1);
    const res = await save({ ...v1, fields: [{ ...NAME, type: 'number' }] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'invalid_form',
      details: [
        'Không được đổi loại trường "householdName" (tạo trường mới thay vì sửa)',
        'Thiếu trường "water" của phiên bản trước (muốn bỏ thì đặt ẩn)',
      ],
    });
    // Không tạo version mới khi bị từ chối
    const v2 = await save(v1);
    expect(((await v2.json()) as FormSchema).version).toBe(2);
  });

  it('form mới sai luật (id trường trùng, select không lựa chọn): 400 invalid_form', async () => {
    const f = newForm();
    const res = await save({
      ...f,
      fields: [NAME, NAME, { id: 'water', type: 'select', label: 'Nước', options: [] }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('invalid_form');
    expect(body.details).toHaveLength(2);
  });

  it.each([
    ['mảng thay cho object', []],
    ['thiếu fields', { id: 'x', title: 'X' }],
    ['type lạ', { id: 'x', title: 'X', fields: [{ id: 'a', type: 'color', label: 'A' }] }],
    ['options không phải mảng chuỗi', { id: 'x', title: 'X', fields: [{ id: 'a', type: 'select', label: 'A', options: [1] }] }],
    ['required không phải boolean', { id: 'x', title: 'X', fields: [{ id: 'a', type: 'text', label: 'A', required: 'yes' }] }],
  ])('thân sai kiểu (%s): 400 invalid_body', async (_name, body) => {
    const res = await save(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });

  it('A3: điều tra viên gọi: 403 forbidden, không lưu gì', async () => {
    const f = newForm();
    const res = await save(f, t.tokens.minh);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    const latest = (await (await call('GET', formsPath(t.projects.yte), t.tokens.minh)).json()) as FormSchema[];
    expect(latest.map((x) => x.id)).not.toContain(f.id);
  });

  it('không là thành viên (admin): 403 not_member', async () => {
    const res = await save(newForm(), t.tokens.admin);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_member' });
  });

  it('form của dự án A không hiện ở dự án B', async () => {
    const f = newForm();
    await save(f);
    // Lan là giám sát viên ở demo-yte, điều tra viên ở demo-nongnghiep
    const other = (await (await call('GET', formsPath(t.projects.nongnghiep), t.tokens.lan)).json()) as FormSchema[];
    expect(other.map((x) => x.id)).not.toContain(f.id);
    const res = await call('GET', `${formsPath(t.projects.nongnghiep)}/${f.id}/versions/1`, t.tokens.lan);
    expect(res.status).toBe(404);
  });

  it('cùng id form ở hai dự án là hai form riêng, version đếm riêng', async () => {
    const f = newForm();
    await save(f);
    await save(f);
    // Không tạo form ở dự án khác được vì Lan chỉ là điều tra viên ở đó; kiểm qua DB rằng version
    // chỉ đếm trong dự án: thêm tay một bản v1 ở demo-nongnghiep rồi lưu tiếp ở demo-yte.
    t.db
      .prepare(`INSERT INTO forms (project_id, id, version, schema, created_at, created_by) VALUES (?, ?, 1, ?, ?, ?)`)
      .run(t.projects.nongnghiep, f.id, JSON.stringify({ ...f, version: 1 }), new Date().toISOString(), 'system');
    const res = await save(f);
    expect(((await res.json()) as FormSchema).version).toBe(3);
  });
});
