import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FormSchema, SaveFormRequest } from '@field-survey/shared';
import { SAMPLE_FORM } from '../src/db';
import { BOM } from '../src/lib/csv';
import { createTestServer, type TestServer } from './fixtures';

// Xuất CSV/JSON theo dự án (design §4.6, ticket TV3-09). Ca A3 phần export (design §10.1).

const BASE = 'https://khao-sat.test';
const FORM = SAMPLE_FORM.id;

let t: TestServer;
let r1: string; // form v1, minh tạo
let r2: string; // form v2, lan tạo
let r3: string; // đã xoá
let otherProject: string; // cùng formId nhưng ở dự án nongnghiep

const P = (project: string) => `${t.base}/api/projects/${project}`;

function call(method: string, url: string, token: string | undefined, body?: object) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = randomUUID();
  }
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function putRecord(project: string, token: string, formVersion: number, data: object, baseVersion = 0, id = randomUUID()) {
  const res = await call('PUT', `${P(project)}/records/${id}`, token, {
    formId: FORM,
    formVersion,
    baseVersion,
    deleted: false,
    data,
  });
  expect(res.status).toBeLessThan(300);
  return id;
}

const exportUrl = (query = '', project = t.projects.yte, form = FORM) => `${P(project)}/export/${form}${query}`;

/**
 * Nội dung CSV giữ nguyên BOM: Response.text() tự bỏ BOM khi giải mã UTF-8 nên đọc byte rồi giải mã
 * với ignoreBOM. Kiểm luôn 3 byte đầu là BOM UTF-8 (EF BB BF) để Excel đọc đúng tiếng Việt.
 */
async function csvText(res: Response): Promise<string> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
}

/** Tách CSV đơn giản: dữ liệu test không có dấu phẩy hay xuống dòng trong ô. */
function parseCsv(text: string): string[][] {
  return text
    .slice(BOM.length)
    .split('\r\n')
    .filter((l) => l !== '')
    .map((l) => l.split(','));
}

beforeAll(async () => {
  t = await createTestServer({ publicBaseUrl: BASE });
  // Form v2: thêm trường "phone" (luật đổi form chỉ cho thêm, không cho bỏ trường, design §4.1)
  const v2: SaveFormRequest = {
    id: FORM,
    title: SAMPLE_FORM.title,
    fields: [...SAMPLE_FORM.fields, { id: 'phone', type: 'text', label: 'Điện thoại' }],
  };
  expect((await call('POST', `${P(t.projects.yte)}/forms`, t.tokens.lan, v2)).status).toBe(201);

  r1 = await putRecord(t.projects.yte, t.tokens.minh, 1, {
    householdName: '=1+1',
    members: -2,
    assets: ['Xe máy', 'Tivi'],
    housePhoto: ['a1', 'a2'],
    location: { lat: 10.5, lng: 106.25, accuracy: 12 },
  });
  r2 = await putRecord(t.projects.yte, t.tokens.lan, 2, { householdName: 'Bình', phone: '0912' });
  r3 = await putRecord(t.projects.yte, t.tokens.lan, 2, { householdName: 'Đã xoá' });
  const del = await call('PUT', `${P(t.projects.yte)}/records/${r3}`, t.tokens.lan, {
    formId: FORM,
    formVersion: 2,
    baseVersion: 1,
    deleted: true,
    data: { householdName: 'Đã xoá' },
  });
  expect(del.status).toBe(200);
  otherProject = await putRecord(t.projects.nongnghiep, t.tokens.lan, 1, { householdName: 'Dự án khác' });
});
afterAll(() => t.close());

describe('CSV', () => {
  it('file có BOM, tải về dạng file; phiếu v1 và v2 cùng file, cột đúng thứ tự; không có phiếu đã xoá', async () => {
    const res = await call('GET', exportUrl('?format=csv'), t.tokens.lan);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${FORM}.csv"`);
    const text = await csvText(res);
    expect(text.startsWith(BOM)).toBe(true);

    const [header, ...rows] = parseCsv(text);
    expect(header).toEqual([
      'id', 'version', 'updatedAt', 'updatedBy', 'updatedByName', 'formVersion', 'deleted',
      'householdName', 'members', 'waterSource', 'assets', 'visitDate', 'housePhoto',
      'location_lat', 'location_lng', 'location_accuracy', 'phone',
    ]);
    expect(rows.map((r) => r[0])).toEqual([r1, r2]);

    const cell = (row: string[] | undefined, name: string) => row?.[header?.indexOf(name) ?? -1];
    const [row1, row2] = rows;
    expect(cell(row1, 'formVersion')).toBe('1');
    expect(cell(row1, 'updatedBy')).toBe('u_minh');
    expect(cell(row1, 'updatedByName')).toBe('minh');
    // Chống CSV injection ở ô chữ; số âm giữ nguyên là số
    expect(cell(row1, 'householdName')).toBe("'=1+1");
    expect(cell(row1, 'members')).toBe('-2');
    expect(cell(row1, 'assets')).toBe('Xe máy; Tivi');
    expect(cell(row1, 'housePhoto')).toBe(
      `${BASE}/api/projects/${t.projects.yte}/attachments/a1; ${BASE}/api/projects/${t.projects.yte}/attachments/a2`,
    );
    expect([cell(row1, 'location_lat'), cell(row1, 'location_lng'), cell(row1, 'location_accuracy')]).toEqual([
      '10.5',
      '106.25',
      '12',
    ]);
    // Phiếu v1 không có trường chỉ v2 mới có: ô trống
    expect(cell(row1, 'phone')).toBe('');
    expect(cell(row2, 'formVersion')).toBe('2');
    expect(cell(row2, 'phone')).toBe('0912');
  });

  it('không truyền format thì mặc định CSV', async () => {
    const res = await call('GET', exportUrl(), t.tokens.lan);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  });

  it('includeDeleted=1 thì gồm phiếu đã xoá, cột deleted là true', async () => {
    const [header, ...rows] = parseCsv(await csvText(await call('GET', exportUrl('?includeDeleted=1'), t.tokens.lan)));
    expect(rows.map((r) => r[0])).toEqual([r1, r2, r3]);
    expect(rows[2]?.[header?.indexOf('deleted') ?? -1]).toBe('true');
  });

  it('không bao giờ có phiếu của dự án khác, kể cả cùng formId', async () => {
    const text = await csvText(await call('GET', exportUrl('?includeDeleted=1'), t.tokens.lan));
    expect(text).not.toContain(otherProject);
    expect(text).not.toContain('Dự án khác');
  });
});

describe('JSON', () => {
  it('{ forms, records }: mọi phiên bản form, phiếu chưa xoá của dự án', async () => {
    const res = await call('GET', exportUrl('?format=json'), t.tokens.lan);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${FORM}.json"`);
    const body = (await res.json()) as { forms: FormSchema[]; records: { id: string; createdByName: string }[] };
    expect(body.forms.map((f) => f.version)).toEqual([1, 2]);
    expect(body.records.map((r) => r.id)).toEqual([r1, r2]);
    expect(body.records[0]?.createdByName).toBe('minh');
  });
});

describe('quyền và lỗi (A3, design §7.1)', () => {
  it('surveyor nhận 403 forbidden; supervisor và owner xuất được', async () => {
    const asMinh = await call('GET', exportUrl(), t.tokens.minh);
    expect(asMinh.status).toBe(403);
    expect(await asMinh.json()).toEqual({ error: 'forbidden' });
    expect((await call('GET', exportUrl(), t.tokens.chu)).status).toBe(200);
  });

  it('không thuộc dự án: 403 not_member; không có token: 401', async () => {
    expect(await (await call('GET', exportUrl(), t.tokens.admin)).json()).toEqual({ error: 'not_member' });
    expect((await call('GET', exportUrl(), undefined)).status).toBe(401);
  });

  it('format lạ thì 400 invalid_body; form không có trong dự án thì 404 not_found', async () => {
    const bad = await call('GET', exportUrl('?format=xml'), t.tokens.lan);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_body' });
    const missing = await call('GET', exportUrl('', t.projects.yte, 'khong-co'), t.tokens.lan);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not_found' });
  });
});
