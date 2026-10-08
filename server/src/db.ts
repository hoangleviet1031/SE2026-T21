import { DatabaseSync } from 'node:sqlite';
import type { FormSchema } from '@field-survey/shared';

// SQLite tích hợp sẵn trong Node >= 22.13 (node:sqlite), không cần build native.
// Muốn đổi sang Postgres: giữ nguyên các câu SQL, thay lớp truy cập ở đây.

export type Db = DatabaseSync;

/** Một bước nâng schema. Chạy trong transaction do `migrate` mở, nên chỉ cần `db.exec`. */
export type Migration = (db: Db) => void;

// Đánh số theo vị trí trong mảng: migrations[i] đưa DB từ user_version = i lên i + 1.
// Chỉ nối thêm vào cuối, không sửa bước đã có (design §12).
export const migrations: Migration[] = [
  // 1: schema của khung một-tổ-chức. IF NOT EXISTS để chạy được cả trên DB cũ chưa đánh số
  // (user_version = 0 nhưng đã có bảng).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS forms (
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        schema TEXT NOT NULL,
        PRIMARY KEY (id, version)
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        form_id TEXT NOT NULL,
        form_version INTEGER NOT NULL,
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        -- Số thứ tự thay đổi toàn cục, dùng làm cursor cho pull
        seq INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_seq ON records(seq);
      CREATE TABLE IF NOT EXISTS record_history (
        record_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        data TEXT NOT NULL,
        deleted INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        PRIMARY KEY (record_id, version)
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        key TEXT PRIMARY KEY,
        status INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
      INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', 0);
    `);
  },

  // 2: nhiều tổ chức theo dự án (ADR 0002). NGOẠI LỆ MỘT LẦN so với "chỉ thêm cột/bảng":
  // các bảng dữ liệu được tạo lại vì khung chưa có dữ liệu thật. Từ migration 3 trở đi
  // chỉ được thêm cột/bảng. `meta` giữ nguyên để bộ đếm seq không quay về 0.
  // Xoá theo thứ tự con trước cha vì khoá ngoại đang bật.
  (db) => {
    db.exec(`
      DROP TABLE IF EXISTS record_history;
      DROP TABLE IF EXISTS idempotency;
      DROP TABLE IF EXISTS records;
      DROP TABLE IF EXISTS forms;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      -- Token chỉ lưu SHA-256 (design §9)
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        is_admin INTEGER NOT NULL DEFAULT 0,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE memberships (
        project_id TEXT NOT NULL REFERENCES projects(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL CHECK (role IN ('surveyor', 'supervisor')),
        added_at TEXT NOT NULL,
        PRIMARY KEY (project_id, user_id)
      );
      CREATE INDEX memberships_user ON memberships(user_id);

      CREATE TABLE forms (
        project_id TEXT NOT NULL REFERENCES projects(id),
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        schema TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        PRIMARY KEY (project_id, id, version)
      );

      -- id phiếu là khoá chính toàn hệ thống (không phải theo dự án): nhờ vậy PUT vào id đã có
      -- ở dự án khác phát hiện được và trả 404 (ADR 0002 §3).
      -- Không có FK tới forms (phiếu offline có thể tham chiếu phiên bản form chưa pull) và không
      -- có FK từ created_by/updated_by tới users (người bị vô hiệu hoá vẫn giữ phiếu).
      CREATE TABLE records (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        form_id TEXT NOT NULL,
        form_version INTEGER NOT NULL,
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        -- Số thứ tự thay đổi toàn cục, dùng làm cursor cho pull (design §5.5)
        seq INTEGER NOT NULL
      );
      CREATE INDEX records_project_seq ON records(project_id, seq);
      CREATE INDEX records_project_creator_seq ON records(project_id, created_by, seq);

      -- project_id nhắc lại từ records để mọi truy vấn dữ liệu dự án đều lọc được cùng một cách.
      CREATE TABLE record_history (
        record_id TEXT NOT NULL REFERENCES records(id),
        project_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        data TEXT NOT NULL,
        deleted INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        PRIMARY KEY (record_id, version)
      );
      CREATE INDEX record_history_project_record ON record_history(project_id, record_id);

      -- PK chỉ là key: dùng lại key ở dự án khác phải bị phát hiện và trả 422 (ADR 0001 quy tắc 3).
      CREATE TABLE idempotency (
        key TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        status INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idempotency_created_at ON idempotency(created_at);
    `);
  },
];

/**
 * Chạy các bước còn thiếu trong MỘT transaction cùng với việc đặt `user_version`,
 * nên lỗi giữa chừng không để DB ở trạng thái nửa vời.
 */
export function migrate(db: Db, steps: Migration[] = migrations): void {
  tx(db, () => {
    const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
    const current = row.user_version;
    // DB mới hơn code (vd. chạy bản server cũ trên file của bản mới): dừng thay vì đoán.
    if (current > steps.length) {
      throw new Error(`CSDL ở phiên bản ${current}, mới hơn mã nguồn (${steps.length})`);
    }
    for (let i = current; i < steps.length; i++) steps[i]!(db); // i < steps.length nên chắc chắn có phần tử
    // PRAGMA không nhận tham số ràng buộc; steps.length là số nguyên do chính mã này tạo ra.
    db.exec(`PRAGMA user_version = ${steps.length}`);
  });
}

export function openDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  // journal_mode không đổi được trong transaction nên đặt trước migrate.
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

export function nextSeq(db: Db): number {
  const row = db.prepare(`UPDATE meta SET v = v + 1 WHERE k = 'seq' RETURNING v`).get() as { v: number };
  return row.v;
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const SAMPLE_FORM: FormSchema = {
  id: 'household-survey',
  version: 1,
  title: 'Khảo sát hộ gia đình',
  fields: [
    { id: 'householdName', type: 'text', label: 'Tên chủ hộ', required: true },
    { id: 'members', type: 'number', label: 'Số thành viên' },
    { id: 'waterSource', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng', 'Mưa', 'Khác'] },
    { id: 'assets', type: 'multiselect', label: 'Tài sản', options: ['Xe máy', 'Tivi', 'Tủ lạnh', 'Máy giặt'] },
    { id: 'visitDate', type: 'date', label: 'Ngày khảo sát' },
    { id: 'housePhoto', type: 'photo', label: 'Ảnh nhà' },
    { id: 'location', type: 'gps', label: 'Vị trí' },
  ],
};

/** Dự án mẫu cho dev. Người dùng và dự án thứ hai do `seed:demo` (TV3-02) tạo. */
export function seed(db: Db): void {
  const now = new Date().toISOString();
  tx(db, () => {
    db.prepare(`INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)`).run(
      'demo-yte',
      'Y tế xã (demo)',
      now,
    );
    db.prepare(
      `INSERT OR IGNORE INTO forms (project_id, id, version, schema, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('demo-yte', SAMPLE_FORM.id, SAMPLE_FORM.version, JSON.stringify(SAMPLE_FORM), now, 'system');
  });
}
