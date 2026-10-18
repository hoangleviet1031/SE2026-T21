import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate, migrations, openDb, seed, type Db } from '../src/db';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { MeResponse } from '@field-survey/shared';
import { createApp } from '../src/app';
import { hashToken } from '../src/auth';

// Schema đích sau migration 2, theo bản nháp đã duyệt cho TV2-01 (docs/design.md §6.1, ADR 0002),
// cộng bảng attachments của migration 3 (TV3-05) và tài khoản, phiên, vai trò owner của migration 4
// (TV2-14, ADR 0003 §5), bảng project_requests của migration 5 (TV2-15).
// Viết tường minh thay vì suy ra từ code để test bắt được cột bị thiếu hay thừa.
const EXPECTED_COLUMNS: Record<string, string[]> = {
  projects: ['id', 'name', 'archived', 'created_at', 'public'],
  users: ['id', 'name', 'token_hash', 'is_admin', 'disabled', 'created_at', 'username', 'password_hash'],
  memberships: ['project_id', 'user_id', 'role', 'added_at', 'added_by'],
  sessions: ['token_hash', 'user_id', 'created_at', 'last_seen_at'],
  forms: ['project_id', 'id', 'version', 'schema', 'created_at', 'created_by'],
  records: [
    'id',
    'project_id',
    'form_id',
    'form_version',
    'data',
    'version',
    'deleted',
    'created_by',
    'updated_at',
    'updated_by',
    'seq',
  ],
  record_history: ['record_id', 'project_id', 'version', 'data', 'deleted', 'updated_at', 'updated_by'],
  idempotency: ['key', 'project_id', 'record_id', 'request_hash', 'status', 'body', 'created_at'],
  meta: ['k', 'v'],
  attachments: [
    'id',
    'project_id',
    'record_id',
    'mime_type',
    'size',
    'sha256',
    'total_chunks',
    'created_by',
    'created_at',
    'completed_at',
  ],
  project_requests: [
    'id',
    'user_id',
    'name',
    'note',
    'status',
    'created_at',
    'decided_at',
    'decided_by',
    'reason',
    'project_id',
  ],
};

const EXPECTED_PRIMARY_KEYS: Record<string, string[]> = {
  projects: ['id'],
  users: ['id'],
  memberships: ['project_id', 'user_id'],
  forms: ['project_id', 'id', 'version'],
  records: ['id'],
  record_history: ['record_id', 'version'],
  idempotency: ['key'],
  meta: ['k'],
  attachments: ['id'],
  sessions: ['token_hash'],
  project_requests: ['id'],
};

// Tên index tự đặt -> danh sách cột theo thứ tự. Index tự sinh (sqlite_autoindex_*) kiểm riêng.
const EXPECTED_INDEXES: Record<string, string[]> = {
  memberships_user: ['user_id'],
  records_project_seq: ['project_id', 'seq'],
  records_project_creator_seq: ['project_id', 'created_by', 'seq'],
  record_history_project_record: ['project_id', 'record_id'],
  idempotency_created_at: ['created_at'],
  attachments_record: ['project_id', 'record_id'],
  users_username: ['username'],
  sessions_user: ['user_id'],
  project_requests_status: ['status', 'created_at'],
  project_requests_user: ['user_id', 'status'],
};

// "bảng.cột -> bảng cha"
const EXPECTED_FOREIGN_KEYS = [
  'memberships.project_id -> projects',
  'memberships.user_id -> users',
  'forms.project_id -> projects',
  'records.project_id -> projects',
  'record_history.record_id -> records',
  'attachments.project_id -> projects',
  'attachments.record_id -> records',
  'sessions.user_id -> users',
  'project_requests.user_id -> users',
  'project_requests.project_id -> projects',
];

interface ColumnInfo {
  name: string;
  pk: number;
}

function tableNames(db: Db): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function columns(db: Db, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnInfo[];
}

function indexColumns(db: Db, index: string): string[] {
  const rows = db.prepare(`PRAGMA index_info(${index})`).all() as { seqno: number; name: string }[];
  return rows.sort((a, b) => a.seqno - b.seqno).map((r) => r.name);
}

function foreignKeys(db: Db): string[] {
  const out: string[] = [];
  for (const table of tableNames(db)) {
    const rows = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; from: string }[];
    for (const fk of rows) out.push(`${table}.${fk.from} -> ${fk.table}`);
  }
  return out.sort();
}

/** Ảnh chụp toàn bộ schema (kể cả DDL), để so hai DB có cùng schema hay không. */
function snapshot(db: Db): unknown {
  const objects = db
    .prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`)
    .all();
  const tables = tableNames(db).map((t) => ({ table: t, columns: columns(db, t) }));
  return { objects, tables, foreignKeys: foreignKeys(db) };
}

function userVersion(db: Db): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

describe('schema sau migration', () => {
  const db = openDb(':memory:');

  it('đúng tập bảng, không thừa không thiếu', () => {
    expect(tableNames(db)).toEqual(Object.keys(EXPECTED_COLUMNS).sort());
  });

  it.each(Object.entries(EXPECTED_COLUMNS))('bảng %s có đúng cột', (table, expected) => {
    const names = columns(db, table).map((c) => c.name);
    expect(names.slice().sort()).toEqual(expected.slice().sort());
  });

  it.each(Object.entries(EXPECTED_PRIMARY_KEYS))('bảng %s có đúng khoá chính', (table, expected) => {
    const pk = columns(db, table)
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    expect(pk).toEqual(expected);
  });

  it.each(Object.entries(EXPECTED_INDEXES))('index %s đúng cột', (index, expected) => {
    expect(indexColumns(db, index)).toEqual(expected);
  });

  it('index cũ records_seq (chỉ theo seq) không còn', () => {
    const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as { name: string }[]).map(
      (r) => r.name,
    );
    expect(names).not.toContain('records_seq');
  });

  it('khoá ngoại đúng như bản duyệt, created_by/updated_by không có FK', () => {
    expect(foreignKeys(db)).toEqual(EXPECTED_FOREIGN_KEYS.slice().sort());
  });

  it('token_hash là duy nhất', () => {
    const insert = db.prepare(`INSERT INTO users (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)`);
    insert.run('u1', 'An', 'hash-1', '2026-10-07T00:00:00Z');
    expect(() => insert.run('u2', 'Bình', 'hash-1', '2026-10-07T00:00:00Z')).toThrow();
  });

  // Trước migration 4 ca này là "chỉ nhận surveyor hoặc supervisor"; ADR 0003 §2 thêm owner.
  it('role chỉ nhận surveyor, supervisor hoặc owner', () => {
    db.prepare(`INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`).run('p-role', 'P', '2026-10-07T00:00:00Z');
    db.prepare(`INSERT INTO users (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)`).run('u-own', 'Chủ', 'hash-own', '2026-10-07T00:00:00Z');
    const insert = db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`);
    expect(() => insert.run('p-role', 'u1', 'admin', '2026-10-07T00:00:00Z')).toThrow();
    expect(() => insert.run('p-role', 'u1', 'surveyor', '2026-10-07T00:00:00Z')).not.toThrow();
    expect(() => insert.run('p-role', 'u-own', 'owner', '2026-10-07T00:00:00Z')).not.toThrow();
  });

  it('username là duy nhất; nhiều tài khoản chưa có username (NULL) vẫn được', () => {
    const insert = db.prepare(`INSERT INTO users (id, name, token_hash, username, created_at) VALUES (?, ?, ?, ?, ?)`);
    insert.run('u-a', 'A', 'hash-a', 'trung', '2026-10-07T00:00:00Z');
    expect(() => insert.run('u-b', 'B', 'hash-b', 'trung', '2026-10-07T00:00:00Z')).toThrow();
    insert.run('u-c', 'C', 'hash-c', null, '2026-10-07T00:00:00Z');
    expect(() => insert.run('u-d', 'D', 'hash-d', null, '2026-10-07T00:00:00Z')).not.toThrow();
  });

  it('project_requests.status chỉ nhận pending, approved, rejected, cancelled', () => {
    db.prepare(`INSERT INTO users (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)`).run('u-req', 'Gửi', 'hash-req', '2026-10-07T00:00:00Z');
    const insert = db.prepare(
      `INSERT INTO project_requests (id, user_id, name, status, created_at) VALUES (?, 'u-req', 'Tổ chức', ?, '2026-10-07T00:00:00Z')`,
    );
    for (const status of ['pending', 'approved', 'rejected', 'cancelled']) {
      expect(() => insert.run(`r-${status}`, status)).not.toThrow();
    }
    expect(() => insert.run('r-sai', 'done')).toThrow();
  });

  it('projects.public mặc định 0 (tổ chức mới không công khai)', () => {
    db.prepare(`INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`).run('p-pub', 'P', '2026-10-07T00:00:00Z');
    expect(db.prepare(`SELECT public FROM projects WHERE id = 'p-pub'`).get()).toEqual({ public: 0 });
  });

  it('khoá ngoại được thực thi: phiếu không thể trỏ tới dự án không tồn tại', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO records (id, project_id, form_id, form_version, data, version, created_by, updated_at, updated_by, seq)
           VALUES ('r-x', 'khong-ton-tai', 'f', 1, '{}', 1, 'u1', '2026-10-07T00:00:00Z', 'u1', 1)`,
        )
        .run(),
    ).toThrow();
  });

  it('created_by/updated_by không bị ràng buộc với users (người bị vô hiệu hoá vẫn giữ phiếu)', () => {
    db.prepare(`INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`).run('p-fk', 'P', '2026-10-07T00:00:00Z');
    expect(() =>
      db
        .prepare(
          `INSERT INTO records (id, project_id, form_id, form_version, data, version, created_by, updated_at, updated_by, seq)
           VALUES ('r-ok', 'p-fk', 'f', 1, '{}', 1, 'nguoi-khong-co', '2026-10-07T00:00:00Z', 'nguoi-khong-co', 1)`,
        )
        .run(),
    ).not.toThrow();
  });
});

describe('migration', () => {
  it('DB rỗng và DB ở user_version = 1 ra cùng schema', () => {
    const fresh = openDb(':memory:');

    const old = new DatabaseSync(':memory:');
    migrate(old, migrations.slice(0, 1));
    expect(userVersion(old)).toBe(1);
    migrate(old, migrations);

    expect(snapshot(old)).toEqual(snapshot(fresh));
    expect(userVersion(old)).toBe(migrations.length);
    expect(userVersion(fresh)).toBe(migrations.length);
  });

  it('DB cũ của khung (user_version = 0, đã có bảng và dữ liệu) cũng lên được cùng schema', () => {
    const legacy = new DatabaseSync(':memory:');
    legacy.exec(`
      CREATE TABLE forms (id TEXT NOT NULL, version INTEGER NOT NULL, schema TEXT NOT NULL, PRIMARY KEY (id, version));
      CREATE TABLE records (id TEXT PRIMARY KEY, form_id TEXT NOT NULL, form_version INTEGER NOT NULL, data TEXT NOT NULL,
        version INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
        seq INTEGER NOT NULL);
      CREATE INDEX records_seq ON records(seq);
      CREATE TABLE record_history (record_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL,
        deleted INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (record_id, version));
      CREATE TABLE idempotency (key TEXT PRIMARY KEY, status INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
      INSERT INTO meta (k, v) VALUES ('seq', 7);
      INSERT INTO records VALUES ('r1', 'f', 1, '{}', 1, 0, '2026-10-01T00:00:00Z', 'An', 7);
    `);
    expect(userVersion(legacy)).toBe(0);

    migrate(legacy, migrations);

    expect(snapshot(legacy)).toEqual(snapshot(openDb(':memory:')));
  });

  it('bộ đếm seq vẫn còn sau migration, để cursor không quay về 0', () => {
    const db = openDb(':memory:');
    const row = db.prepare(`SELECT v FROM meta WHERE k = 'seq'`).get() as { v: number } | undefined;
    expect(row).toBeDefined();
  });

  it('chạy lại trên DB đã mới nhất không đổi gì', () => {
    const db = openDb(':memory:');
    const before = snapshot(db);
    migrate(db, migrations);
    expect(snapshot(db)).toEqual(before);
    expect(userVersion(db)).toBe(migrations.length);
  });

  it('migration lỗi giữa chừng thì rollback toàn bộ, user_version giữ nguyên', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, migrations.slice(0, 1));
    const before = snapshot(db);

    const broken = [
      ...migrations.slice(0, 1),
      (d: Db) => {
        d.exec('CREATE TABLE nua_voi (id TEXT)');
        throw new Error('hỏng giữa chừng');
      },
    ];
    expect(() => migrate(db, broken)).toThrow('hỏng giữa chừng');

    expect(userVersion(db)).toBe(1);
    expect(tableNames(db)).not.toContain('nua_voi');
    expect(snapshot(db)).toEqual(before);
  });

  it('migration 2 lỗi thật sự (sau khi đã xoá bảng cũ) cũng không để DB nửa vời', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, migrations.slice(0, 1));
    const before = snapshot(db);

    // Lấy migration 2 thật, rồi thêm một bước lỗi ngay sau nó trong cùng lượt chạy.
    const second = migrations[1];
    expect(second).toBeDefined();
    const broken = [
      migrations[0]!,
      (d: Db) => {
        second!(d);
        throw new Error('lỗi sau migration 2');
      },
    ];
    expect(() => migrate(db, broken)).toThrow('lỗi sau migration 2');

    expect(userVersion(db)).toBe(1);
    expect(snapshot(db)).toEqual(before);
  });
});

describe('seed', () => {
  it('tạo dự án demo-yte và form mẫu trong dự án đó', () => {
    const db = openDb(':memory:');
    seed(db);
    const project = db.prepare(`SELECT id, archived FROM projects WHERE id = 'demo-yte'`).get() as
      | { id: string; archived: number }
      | undefined;
    expect(project).toEqual({ id: 'demo-yte', archived: 0 });

    const form = db.prepare(`SELECT project_id, id, version FROM forms`).all();
    expect(form).toEqual([{ project_id: 'demo-yte', id: 'household-survey', version: 1 }]);
  });

  it('gọi lại không nhân đôi dữ liệu', () => {
    const db = openDb(':memory:');
    seed(db);
    seed(db);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM projects`).get() as { n: number }).n).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM forms`).get() as { n: number }).n).toBe(1);
  });

  it('không tạo người dùng nào (việc của seed:demo ở TV3-02)', () => {
    const db = openDb(':memory:');
    seed(db);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n).toBe(0);
  });
});

describe('khoá ngoại', () => {
  // node:sqlite bật khoá ngoại mặc định; test này giữ cho ai đổi cấu hình phải biết (ADR 0002).
  it('đang bật trên kết nối từ openDb', () => {
    const db = openDb(':memory:');
    expect((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1);
  });

  it('từ chối thành viên trỏ tới dự án không tồn tại', () => {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO users (id, name, token_hash, is_admin, disabled, created_at) VALUES ('u1', 'A', 'h', 0, 0, 'now')`).run();
    expect(() =>
      db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES ('khong-co', 'u1', 'surveyor', 'now')`).run(),
    ).toThrow(/FOREIGN KEY/i);
  });
});

// Nâng DB đang chạy bản cũ (user_version = 3: có attachments, chưa có tài khoản) lên migration 4.
// ADR 0003 §5, design §6.1 "Dữ liệu cũ khi nâng cấp", ca MG1, MG2 ở §10.1.
describe('migration 4: tài khoản, phiên, owner', () => {
  const NOW = '2026-10-10T00:00:00Z';

  /** DB ở user_version = 3 với hai dự án, ba người dùng có token cũ. */
  function dbAtVersion3(): Db {
    const db = new DatabaseSync(':memory:');
    migrate(db, migrations.slice(0, 3));
    expect(userVersion(db)).toBe(3);
    db.exec(`
      INSERT INTO projects (id, name, archived, created_at) VALUES
        ('yte', 'Y tế', 0, '${NOW}'), ('nn', 'Nông nghiệp', 0, '${NOW}');
      INSERT INTO users (id, name, token_hash, is_admin, disabled, created_at) VALUES
        ('u_lan', 'Lan', '${hashToken('tok-lan')}', 0, 0, '${NOW}'),
        ('u_minh', 'Minh', '${hashToken('tok-minh')}', 0, 0, '${NOW}'),
        ('u_root', 'Quản trị', '${hashToken('tok-root')}', 1, 0, '${NOW}');
      INSERT INTO memberships (project_id, user_id, role, added_at) VALUES
        ('yte', 'u_lan', 'supervisor', '${NOW}'),
        ('nn', 'u_lan', 'surveyor', '${NOW}'),
        ('yte', 'u_minh', 'surveyor', '${NOW}');
      INSERT INTO forms (project_id, id, version, schema, created_at, created_by) VALUES
        ('yte', 'f', 1, '{"id":"f","version":1,"title":"F","fields":[]}', '${NOW}', 'u_lan');
    `);
    return db;
  }

  function memberships(db: Db): unknown[] {
    return db.prepare(`SELECT project_id, user_id, role, added_at FROM memberships ORDER BY project_id, user_id`).all();
  }

  it('MG1: admin đang là thành viên → lỗi liệt kê tài khoản, dự án, vai trò; rollback, user_version giữ 3', () => {
    const db = dbAtVersion3();
    db.exec(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES ('nn', 'u_root', 'supervisor', '${NOW}')`);
    const before = snapshot(db);
    const membersBefore = memberships(db);

    let message = '';
    try {
      migrate(db, migrations);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('u_root');
    expect(message).toContain('nn');
    expect(message).toContain('supervisor');
    // Chỉ liệt kê tài khoản admin, không liệt kê người thường
    expect(message).not.toContain('u_lan');

    expect(userVersion(db)).toBe(3);
    expect(snapshot(db)).toEqual(before);
    expect(memberships(db)).toEqual(membersBefore);
  });

  it('MG1: admin là thành viên dự án đã lưu trữ cũng bị chặn', () => {
    const db = dbAtVersion3();
    db.exec(`
      INSERT INTO projects (id, name, archived, created_at) VALUES ('cu', 'Cũ', 1, '${NOW}');
      INSERT INTO memberships (project_id, user_id, role, added_at) VALUES ('cu', 'u_root', 'surveyor', '${NOW}');
    `);
    expect(() => migrate(db, migrations)).toThrow(/u_root/);
    expect(userVersion(db)).toBe(3);
  });

  it('MG2: lên bản mới nhất; membership giữ nguyên số dòng và vai trò, added_by để trống', () => {
    const db = dbAtVersion3();
    const membersBefore = memberships(db);

    migrate(db, migrations);

    expect(userVersion(db)).toBe(migrations.length);
    expect(memberships(db)).toEqual(membersBefore);
    const addedBy = db.prepare(`SELECT DISTINCT added_by FROM memberships`).all();
    expect(addedBy).toEqual([{ added_by: null }]);
    // Chưa tổ chức nào có Owner: migration không tự chọn (ADR 0003 §5)
    expect(db.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE role = 'owner'`).get()).toEqual({ n: 0 });
  });

  it('MG2: tài khoản cũ có username = id, chưa có mật khẩu; mỗi token cũ thành một phiên', () => {
    const db = dbAtVersion3();
    migrate(db, migrations);

    expect(db.prepare(`SELECT id, username, password_hash FROM users ORDER BY id`).all()).toEqual([
      { id: 'u_lan', username: 'u_lan', password_hash: null },
      { id: 'u_minh', username: 'u_minh', password_hash: null },
      { id: 'u_root', username: 'u_root', password_hash: null },
    ]);
    expect(db.prepare(`SELECT token_hash, user_id, created_at, last_seen_at FROM sessions ORDER BY user_id`).all()).toEqual([
      { token_hash: hashToken('tok-lan'), user_id: 'u_lan', created_at: NOW, last_seen_at: NOW },
      { token_hash: hashToken('tok-minh'), user_id: 'u_minh', created_at: NOW, last_seen_at: NOW },
      { token_hash: hashToken('tok-root'), user_id: 'u_root', created_at: NOW, last_seen_at: NOW },
    ]);
  });

  it('MG2: token cũ vẫn gọi được API; supervisor dùng được P/... khi tổ chức chưa có Owner', async () => {
    const db = dbAtVersion3();
    migrate(db, migrations);
    const server: Server = createApp(db).listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    try {
      const me = await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer tok-lan' } });
      expect(me.status).toBe(200);
      const body = (await me.json()) as MeResponse;
      expect(body.user).toEqual({ id: 'u_lan', username: 'u_lan', name: 'Lan', isAdmin: false });
      expect(body.projects).toEqual([
        { id: 'nn', name: 'Nông nghiệp', role: 'surveyor' },
        { id: 'yte', name: 'Y tế', role: 'supervisor' },
      ]);

      const forms = await fetch(`${base}/api/projects/yte/forms`, { headers: { Authorization: 'Bearer tok-lan' } });
      expect(forms.status).toBe(200);
      const save = await fetch(`${base}/api/projects/yte/forms`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok-lan', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'f', title: 'F', fields: [] }),
      });
      expect(save.status).toBe(201);
    } finally {
      server.close();
    }
  });
});
