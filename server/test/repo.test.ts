import { beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../src/auth';
import { openDb, tx, type Db } from '../src/db';
import { getFormVersion, listLatestForms } from '../src/repo/forms';
import { getMemberRole } from '../src/repo/memberships';
import { getHistory, getRecordAccess, pullRecords, writeRecord } from '../src/repo/records';

// Hai dự án, mỗi dự án một supervisor và một surveyor; dữ liệu cố ý dùng cùng formId ở cả hai dự án
// để bắt lỗi thiếu `project_id = ?`.
const yteSup: Ctx = { userId: 'lan', projectId: 'yte', role: 'supervisor' };
const yteSur: Ctx = { userId: 'minh', projectId: 'yte', role: 'surveyor' };
const yteSur2: Ctx = { userId: 'hoa', projectId: 'yte', role: 'surveyor' };
const nnSup: Ctx = { userId: 'vy', projectId: 'nn', role: 'supervisor' };

let db: Db;

function addForm(projectId: string, id: string, version: number, title: string) {
  db.prepare(
    `INSERT INTO forms (project_id, id, version, schema, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(projectId, id, version, JSON.stringify({ id, version, title, fields: [] }), '2026-10-08T00:00:00Z', 'system');
}

function write(ctx: Ctx, id: string, data: Record<string, string>) {
  return tx(db, () => writeRecord(ctx, db, { id, formId: 'survey', formVersion: 1, data, deleted: false }));
}

beforeEach(() => {
  db = openDb(':memory:');
  const now = '2026-10-08T00:00:00Z';
  db.prepare(`INSERT INTO projects (id, name, archived, created_at) VALUES ('yte', 'Y tế', 0, ?)`).run(now);
  db.prepare(`INSERT INTO projects (id, name, archived, created_at) VALUES ('nn', 'Nông nghiệp', 0, ?)`).run(now);
  db.prepare(`INSERT INTO projects (id, name, archived, created_at) VALUES ('cu', 'Đã lưu trữ', 1, ?)`).run(now);
  for (const id of ['lan', 'minh', 'hoa', 'vy']) {
    db.prepare(`INSERT INTO users (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)`).run(id, id, `h-${id}`, now);
  }
  const m = db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`);
  m.run('yte', 'lan', 'supervisor', now);
  m.run('yte', 'minh', 'surveyor', now);
  m.run('yte', 'hoa', 'surveyor', now);
  m.run('nn', 'vy', 'supervisor', now);
  m.run('nn', 'minh', 'surveyor', now); // minh ở cả hai dự án với vai trò khác nhau
  m.run('cu', 'lan', 'supervisor', now);
});

describe('repo/memberships', () => {
  it('trả vai trò theo từng dự án', () => {
    expect(getMemberRole(db, 'lan', 'yte')).toBe('supervisor');
    expect(getMemberRole(db, 'minh', 'yte')).toBe('surveyor');
    expect(getMemberRole(db, 'minh', 'nn')).toBe('surveyor');
  });

  it('không là thành viên, dự án không có, hoặc dự án đã lưu trữ thì undefined', () => {
    expect(getMemberRole(db, 'vy', 'yte')).toBeUndefined();
    expect(getMemberRole(db, 'lan', 'khong-co')).toBeUndefined();
    expect(getMemberRole(db, 'lan', 'cu')).toBeUndefined();
  });
});

describe('repo/forms', () => {
  beforeEach(() => {
    addForm('yte', 'survey', 1, 'Y tế v1');
    addForm('yte', 'survey', 2, 'Y tế v2');
    addForm('nn', 'survey', 1, 'Nông nghiệp v1');
    addForm('nn', 'chi-nn', 1, 'Chỉ nông nghiệp');
  });

  it('listLatestForms chỉ trả phiên bản mới nhất và chỉ của dự án trong ctx', () => {
    const forms = listLatestForms(yteSur, db);
    expect(forms.map((f) => `${f.id}@${f.version}`)).toEqual(['survey@2']);
    expect(forms[0]?.title).toBe('Y tế v2');

    const nn = listLatestForms(nnSup, db);
    expect(nn.map((f) => `${f.id}@${f.version}`)).toEqual(['chi-nn@1', 'survey@1']);
  });

  it('getFormVersion chỉ thấy form trong dự án của ctx', () => {
    expect(getFormVersion(yteSur, db, 'survey', 1)?.title).toBe('Y tế v1');
    expect(getFormVersion(yteSur, db, 'chi-nn', 1)).toBeUndefined();
    expect(getFormVersion(nnSup, db, 'survey', 2)).toBeUndefined();
  });
});

describe('repo/records: ghi', () => {
  it('tạo mới: version 1, created_by và updated_by lấy từ ctx, seq tăng dần', () => {
    const a = write(yteSur, 'r1', { name: 'A' });
    const b = write(yteSur, 'r2', { name: 'B' });
    expect(a.version).toBe(1);
    expect(a.updatedBy).toBe('minh');
    const rows = db.prepare(`SELECT id, project_id, created_by, seq FROM records ORDER BY seq`).all();
    expect(rows).toEqual([
      { id: 'r1', project_id: 'yte', created_by: 'minh', seq: 1 },
      { id: 'r2', project_id: 'yte', created_by: 'minh', seq: 2 },
    ]);
    expect(b.version).toBe(1);
  });

  it('supervisor sửa phiếu của surveyor: version tăng, created_by giữ nguyên, updated_by đổi', () => {
    write(yteSur, 'r1', { name: 'A' });
    const edited = write(yteSup, 'r1', { name: 'A (đã sửa)' });
    expect(edited.version).toBe(2);
    expect(edited.updatedBy).toBe('lan');
    const row = db.prepare(`SELECT created_by, updated_by, project_id FROM records WHERE id = 'r1'`).get();
    expect(row).toEqual({ created_by: 'minh', updated_by: 'lan', project_id: 'yte' });
  });

  it('ghi lịch sử kèm project_id của dự án', () => {
    write(yteSur, 'r1', { name: 'A' });
    write(yteSup, 'r1', { name: 'B' });
    const rows = db.prepare(`SELECT version, project_id, updated_by FROM record_history ORDER BY version`).all();
    expect(rows).toEqual([
      { version: 1, project_id: 'yte', updated_by: 'minh' },
      { version: 2, project_id: 'yte', updated_by: 'lan' },
    ]);
  });

  it('từ chối ghi vào phiếu thuộc dự án khác, dữ liệu không đổi', () => {
    write(yteSur, 'r1', { name: 'A' });
    expect(() => write(nnSup, 'r1', { name: 'XÂM NHẬP' })).toThrow();
    const row = db.prepare(`SELECT data, version, project_id FROM records WHERE id = 'r1'`).get();
    expect(row).toEqual({ data: '{"name":"A"}', version: 1, project_id: 'yte' });
  });

  it('từ chối surveyor ghi vào phiếu của surveyor khác trong cùng dự án', () => {
    write(yteSur, 'r1', { name: 'A' });
    expect(() => write(yteSur2, 'r1', { name: 'XÂM NHẬP' })).toThrow();
    const row = db.prepare(`SELECT data, version FROM records WHERE id = 'r1'`).get();
    expect(row).toEqual({ data: '{"name":"A"}', version: 1 });
  });
});

describe('repo/records: getRecordAccess', () => {
  beforeEach(() => {
    write(yteSur, 'r1', { name: 'A' });
  });

  it('none khi id chưa tồn tại ở đâu cả', () => {
    expect(getRecordAccess(yteSur, db, 'chua-co')).toEqual({ kind: 'none' });
  });

  it('visible cho chủ phiếu và cho supervisor cùng dự án', () => {
    const own = getRecordAccess(yteSur, db, 'r1');
    expect(own.kind).toBe('visible');
    expect(getRecordAccess(yteSup, db, 'r1').kind).toBe('visible');
  });

  it('hidden khi phiếu thuộc dự án khác (không phân biệt được với "có nhưng không được thấy")', () => {
    expect(getRecordAccess(nnSup, db, 'r1')).toEqual({ kind: 'hidden' });
    // minh có vai trò surveyor ở nn nhưng phiếu r1 là của dự án yte
    expect(getRecordAccess({ userId: 'minh', projectId: 'nn', role: 'surveyor' }, db, 'r1')).toEqual({
      kind: 'hidden',
    });
  });

  it('hidden khi surveyor hỏi phiếu của surveyor khác', () => {
    expect(getRecordAccess(yteSur2, db, 'r1')).toEqual({ kind: 'hidden' });
  });
});

describe('repo/records: pullRecords', () => {
  beforeEach(() => {
    write(yteSur, 'minh-1', { name: 'của minh 1' });
    write(yteSur2, 'hoa-1', { name: 'của hoa' });
    write(nnSup, 'nn-1', { name: 'dự án khác' });
    write(yteSur, 'minh-2', { name: 'của minh 2' });
  });

  it('A2: surveyor chỉ nhận phiếu mình tạo, scope là own', () => {
    const page = pullRecords(yteSur, db, 0, 100);
    expect(page.scope).toBe('own');
    expect(page.records.map((r) => r.id)).toEqual(['minh-1', 'minh-2']);
  });

  it('supervisor nhận mọi phiếu của dự án, không có phiếu dự án khác, scope là all', () => {
    const page = pullRecords(yteSup, db, 0, 100);
    expect(page.scope).toBe('all');
    expect(page.records.map((r) => r.id)).toEqual(['minh-1', 'hoa-1', 'minh-2']);
  });

  it('supervisor sửa phiếu của surveyor thì surveyor vẫn nhận được bản mới', () => {
    const before = pullRecords(yteSur, db, 0, 100).cursor;
    write(yteSup, 'minh-1', { name: 'giám sát đã sửa' });
    const page = pullRecords(yteSur, db, before, 100);
    expect(page.records.map((r) => r.id)).toEqual(['minh-1']);
    expect(page.records[0]?.updatedBy).toBe('lan');
  });

  it('cursor là seq của dòng cuối trang, giữ nguyên khi không có gì mới', () => {
    const first = pullRecords(yteSup, db, 0, 2);
    expect(first.records).toHaveLength(2);
    const rest = pullRecords(yteSup, db, first.cursor, 100);
    expect(rest.records.map((r) => r.id)).toEqual(['minh-2']);
    const empty = pullRecords(yteSup, db, rest.cursor, 100);
    expect(empty.records).toEqual([]);
    expect(empty.cursor).toBe(rest.cursor);
  });

  it('cursor không nhảy qua seq của dự án khác làm mất phiếu', () => {
    // nn-1 có seq 3 nằm giữa hai phiếu yte; trang yte phải đủ cả hai phiếu còn lại
    const page = pullRecords(yteSup, db, 0, 100);
    expect(page.records).toHaveLength(3);
  });
});

describe('repo/records: getHistory', () => {
  beforeEach(() => {
    write(yteSur, 'r1', { name: 'v1' });
    write(yteSup, 'r1', { name: 'v2' });
    write(yteSup, 'r1', { name: 'v3' });
  });

  it('trả các phiên bản sau afterVersion, cũ đến mới', () => {
    const all = getHistory(yteSup, db, 'r1');
    expect(all?.map((h) => h.version)).toEqual([1, 2, 3]);
    expect(getHistory(yteSup, db, 'r1', 1)?.map((h) => h.version)).toEqual([2, 3]);
    expect(all?.[1]).toMatchObject({ version: 2, updatedBy: 'lan', deleted: false, data: { name: 'v2' } });
  });

  it('chủ phiếu xem được lịch sử phiếu của mình', () => {
    expect(getHistory(yteSur, db, 'r1')).toHaveLength(3);
  });

  it('undefined khi phiếu thuộc dự án khác hoặc ngoài phạm vi surveyor hoặc không tồn tại', () => {
    expect(getHistory(nnSup, db, 'r1')).toBeUndefined();
    expect(getHistory(yteSur2, db, 'r1')).toBeUndefined();
    expect(getHistory(yteSup, db, 'chua-co')).toBeUndefined();
  });
});
