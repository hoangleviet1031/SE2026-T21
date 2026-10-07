import { DatabaseSync } from 'node:sqlite';
import type { FormSchema } from '@field-survey/shared';

// SQLite tích hợp sẵn trong Node >= 22.13 (node:sqlite), không cần build native.
// Muốn đổi sang Postgres: giữ nguyên các câu SQL, thay lớp truy cập ở đây.

export type Db = DatabaseSync;

export function openDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
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

export function seed(db: Db): void {
  db.prepare(`INSERT OR IGNORE INTO forms (id, version, schema) VALUES (?, ?, ?)`).run(
    SAMPLE_FORM.id,
    SAMPLE_FORM.version,
    JSON.stringify(SAMPLE_FORM),
  );
}
