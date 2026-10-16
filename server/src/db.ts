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
  // 3: ảnh đã ghép xong (TV3-05, design §6.1). Chunk đang tải lên chỉ nằm trên đĩa; dòng ở đây
  // tạo lúc `complete`, khi đã biết ảnh thuộc phiếu nào. `id` là khoá toàn hệ thống như id phiếu,
  // để phát hiện id đang thuộc dự án khác (ADR 0002 §3). Như bảng records: không có FK từ
  // created_by tới users (người bị vô hiệu hoá vẫn giữ ảnh).
  (db) => {
    db.exec(`
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        record_id TEXT NOT NULL REFERENCES records(id),
        mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        total_chunks INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL
      );
      CREATE INDEX attachments_record ON attachments(project_id, record_id);
    `);
  },

  // 4: tài khoản tên + mật khẩu, phiên theo máy, vai trò owner (ADR 0003 §5, design §6.1).
  // Bảng project_requests để migration của TV2-15.
  (db) => {
    // Bản mới không cho tài khoản admin là thành viên tổ chức (ADR 0003 §8). Dữ liệu cũ vi phạm thì
    // dừng hẳn để người vận hành tự xử lý, không tự gỡ quyền hay membership của ai (§5 mục 1).
    // Ném ở đây thì `migrate` rollback, user_version giữ nguyên.
    const adminMembers = db
      .prepare(
        `SELECT u.id, u.name, m.project_id, m.role FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE u.is_admin = 1 ORDER BY u.id, m.project_id`,
      )
      .all() as { id: string; name: string; project_id: string; role: string }[];
    if (adminMembers.length > 0) {
      const lines = adminMembers.map((r) => `  - ${r.id} (${r.name}) – ${r.project_id} – ${r.role}`);
      throw new Error(
        'Migration 4 dừng, CSDL không đổi: tài khoản admin đang là thành viên tổ chức (ADR 0003 §5).\n' +
          `${lines.join('\n')}\n` +
          'Bỏ cờ admin của tài khoản đó hoặc rút nó khỏi tổ chức, rồi khởi động lại. Xem docs/deploy.md.',
      );
    }

    // SQLite không cho ADD COLUMN kèm UNIQUE nên username dùng index riêng. Tài khoản cũ lấy
    // username = id. users.token_hash (NOT NULL UNIQUE) giữ lại nhưng không đọc nữa; tài khoản tạo
    // từ bản này ghi giá trị giữ chỗ không bao giờ khớp SHA-256 (xem routes/auth.ts).
    const membershipCount = (db.prepare(`SELECT COUNT(*) AS n FROM memberships`).get() as { n: number }).n;
    db.exec(`
      ALTER TABLE users ADD COLUMN username TEXT;
      ALTER TABLE users ADD COLUMN password_hash TEXT;
      UPDATE users SET username = id;
      CREATE UNIQUE INDEX users_username ON users(username);

      -- Mỗi lần đăng nhập một phiên, chỉ lưu SHA-256 của token. Phiên không tự hết hạn (ADR 0003 §1).
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX sessions_user ON sessions(user_id);
      -- Máy đang đăng nhập bằng token cũ (staging) không bị đẩy ra.
      INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at)
        SELECT token_hash, id, created_at, created_at FROM users;

      ALTER TABLE projects ADD COLUMN public INTEGER NOT NULL DEFAULT 0;

      -- NGOẠI LỆ thứ hai so với "chỉ thêm cột/bảng" (design §12): SQLite không sửa được CHECK nên tạo
      -- lại bảng và chép nguyên dữ liệu. added_by của dòng cũ để trống vì không biết ai đã thêm.
      -- Không có FK từ added_by, giống created_by của records.
      CREATE TABLE memberships_new (
        project_id TEXT NOT NULL REFERENCES projects(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL CHECK (role IN ('surveyor', 'supervisor', 'owner')),
        added_at TEXT NOT NULL,
        added_by TEXT,
        PRIMARY KEY (project_id, user_id)
      );
      INSERT INTO memberships_new (project_id, user_id, role, added_at)
        SELECT project_id, user_id, role, added_at FROM memberships;
      DROP TABLE memberships;
      ALTER TABLE memberships_new RENAME TO memberships;
      CREATE INDEX memberships_user ON memberships(user_id);
    `);
    // Chép thiếu dòng nào là mất quyền của người đó: thà không khởi động còn hơn.
    const after = (db.prepare(`SELECT COUNT(*) AS n FROM memberships`).get() as { n: number }).n;
    if (after !== membershipCount) {
      throw new Error(`Migration 4: memberships có ${membershipCount} dòng trước khi tạo lại, ${after} dòng sau`);
    }
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
