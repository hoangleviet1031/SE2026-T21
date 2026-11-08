import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FormSchema, SaveFormRequest, ServerRecord } from '@field-survey/shared';
import { SAMPLE_FORM } from '../src/db';
import { createTestServer, type TestServer } from './fixtures';

// Xuất JSON cả dự án: GET P/export?format=json&includeDeleted= (design §4.6). Ca EX-01..EX-10 trong
// docs/bt3-23001860/README.md. Server thật + SQLite thật, không mock repo: rủi ro chính là contract giữa
// route và CSDL (cột 0/1 thành boolean, JSON trong cột data, tên ghép bằng LEFT JOIN) bị mock che mất.

const HH = SAMPLE_FORM.id;
const WATER: SaveFormRequest = {
  id: 'water-check',
  title: 'Kiểm tra nguồn nước',
  fields: [{ id: 'note', type: 'text', label: 'Ghi chú' }],
};

let t: TestServer;
let rMinh: string; // household v1, minh (surveyor) tạo
let rLan: string; // household v2, lan (supervisor) tạo
let rWater: string; // form thứ hai của dự án
let rDel: string; // đã xoá
let rOther: string; // dự án nongnghiep, cùng formId household-survey

const P = (project: string) => `${t.base}/api/projects/${project}`;
const exportUrl = (query = '', project: string = t.projects.yte) => `${P(project)}/export${query}`;

function call(method: string, url: string, token: string | undefined, body?: object) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = randomUUID();
  }
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function putRecord(project: string, token: string, formId: string, formVersion: number, data: object) {
  const id = randomUUID();
  const res = await call('PUT', `${P(project)}/records/${id}`, token, { formId, formVersion, baseVersion: 0, deleted: false, data });
  expect(res.status).toBeLessThan(300);
  return id;
}

interface ProjectExport {
  forms: FormSchema[];
  records: ServerRecord[];
}

beforeAll(async () => {
  t = await createTestServer();
  const v2: SaveFormRequest = { id: HH, title: SAMPLE_FORM.title, fields: [...SAMPLE_FORM.fields, { id: 'phone', type: 'text', label: 'Điện thoại' }] };
  expect((await call('POST', `${P(t.projects.yte)}/forms`, t.tokens.lan, v2)).status).toBe(201);
  expect((await call('POST', `${P(t.projects.yte)}/forms`, t.tokens.lan, WATER)).status).toBe(201);
  // Dự án khác có form cùng id với form thứ hai của yte: không được lọt sang file của yte.
  expect((await call('POST', `${P(t.projects.nongnghiep)}/forms`, t.tokens.chu, { ...WATER, title: 'Form riêng nông nghiệp' })).status).toBe(201);

  rMinh = await putRecord(t.projects.yte, t.tokens.minh, HH, 1, { householdName: 'Hộ của Minh', members: 4 });
  rLan = await putRecord(t.projects.yte, t.tokens.lan, HH, 2, { householdName: 'Hộ của Lan', phone: '0912' });
  rWater = await putRecord(t.projects.yte, t.tokens.lan, 'water-check', 1, { note: 'Giếng khoan' });
  rDel = await putRecord(t.projects.yte, t.tokens.lan, HH, 2, { householdName: 'Sẽ xoá' });
  const del = await call('PUT', `${P(t.projects.yte)}/records/${rDel}`, t.tokens.lan, {
    formId: HH,
    formVersion: 2,
    baseVersion: 1,
    deleted: true,
    data: { householdName: 'Sẽ xoá' },
  });
  expect(del.status).toBe(200);
  rOther = await putRecord(t.projects.nongnghiep, t.tokens.chu, HH, 1, { householdName: 'Dự án khác' });
});
afterAll(() => t.close());

describe('xuất cả dự án (thành công)', () => {
  it('EX-01 supervisor: mọi phiên bản của mọi form, phiếu chưa xoá theo thứ tự ghi; tải về dạng file', async () => {
    const res = await call('GET', exportUrl('?format=json'), t.tokens.lan);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${t.projects.yte}.json"`);
    const body = (await res.json()) as ProjectExport;
    expect(body.forms.map((f) => `${f.id}@${f.version}`)).toEqual([`${HH}@1`, `${HH}@2`, 'water-check@1']);
    expect(body.records.map((r) => r.id)).toEqual([rMinh, rLan, rWater]);
  });

  it('EX-02 includeDeleted=1 thì có phiếu đã xoá, deleted là true', async () => {
    const body = (await (await call('GET', exportUrl('?format=json&includeDeleted=1'), t.tokens.lan)).json()) as ProjectExport;
    expect(body.records.map((r) => r.id)).toEqual([rMinh, rLan, rWater, rDel]);
    expect(body.records.find((r) => r.id === rDel)?.deleted).toBe(true);
  });

  it('EX-03 owner xuất được, không truyền format thì mặc định JSON', async () => {
    const res = await call('GET', exportUrl(), t.tokens.chu);
    expect(res.status).toBe(200);
    expect(((await res.json()) as ProjectExport).records.map((r) => r.id)).toEqual([rMinh, rLan, rWater]);
  });

  it('EX-04 contract với CSDL: deleted là boolean, data là object, tên người tạo/sửa ghép từ users', async () => {
    const body = (await (await call('GET', exportUrl(), t.tokens.lan)).json()) as ProjectExport;
    const minh = body.records.find((r) => r.id === rMinh);
    // Cột deleted trong SQLite là 0/1; mock trả sẵn boolean sẽ không bao giờ lộ lỗi quên đổi kiểu.
    expect(minh?.deleted).toBe(false);
    expect(minh?.data).toEqual({ householdName: 'Hộ của Minh', members: 4 });
    expect(minh).toMatchObject({ formId: HH, formVersion: 1, version: 1, createdBy: 'u_minh', createdByName: 'minh', updatedBy: 'u_minh' });
    expect(body.forms.find((f) => f.id === 'water-check')?.title).toBe(WATER.title);
  });
});

describe('phạm vi dữ liệu', () => {
  it('EX-05 không bao giờ có phiếu hay form của dự án khác, kể cả cùng id form', async () => {
    const text = await (await call('GET', exportUrl('?includeDeleted=1'), t.tokens.chu)).text();
    expect(text).not.toContain(rOther);
    expect(text).not.toContain('Dự án khác');
    expect(text).not.toContain('Form riêng nông nghiệp');
    // Và ngược lại: chu xuất nongnghiep chỉ thấy đúng phiếu của nongnghiep.
    const other = (await (await call('GET', exportUrl('', t.projects.nongnghiep), t.tokens.chu)).json()) as ProjectExport;
    expect(other.records.map((r) => r.id)).toEqual([rOther]);
    expect(other.forms.find((f) => f.id === 'water-check')?.title).toBe('Form riêng nông nghiệp');
  });
});

describe('quyền và lỗi (A3, design §7.1)', () => {
  it('EX-06 surveyor nhận 403 forbidden', async () => {
    const res = await call('GET', exportUrl(), t.tokens.minh);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('EX-07 supervisor ở dự án này nhưng surveyor ở dự án kia: xuất dự án kia nhận 403 forbidden', async () => {
    const res = await call('GET', exportUrl('', t.projects.nongnghiep), t.tokens.lan);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('EX-08 admin không là thành viên: 403 not_member; không có token: 401; dự án không có: 403 not_member', async () => {
    expect(await (await call('GET', exportUrl(), t.tokens.admin)).json()).toEqual({ error: 'not_member' });
    expect((await call('GET', exportUrl(), undefined)).status).toBe(401);
    expect(await (await call('GET', exportUrl('', 'khong-co-du-an'), t.tokens.lan)).json()).toEqual({ error: 'not_member' });
  });

  it('EX-09 format khác json (kể cả csv, lặp tham số) thì 400 invalid_body', async () => {
    for (const q of ['?format=csv', '?format=xml', '?format=json&format=json']) {
      const res = await call('GET', exportUrl(q), t.tokens.lan);
      expect(res.status, q).toBe(400);
      expect(await res.json(), q).toEqual({ error: 'invalid_body' });
    }
  });

  it('EX-10 route xuất theo form có sẵn không đổi hành vi', async () => {
    const res = await call('GET', `${P(t.projects.yte)}/export/${HH}?format=json`, t.tokens.lan);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${HH}.json"`);
    expect(((await res.json()) as ProjectExport).records.map((r) => r.id)).toEqual([rMinh, rLan]);
  });
});
