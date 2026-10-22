import { tx, seed, SAMPLE_FORM, type Db } from './db';
import { hashToken } from './auth';

// Dữ liệu demo: hai dự án, bốn tài khoản có mật khẩu cố định để dev và test dùng chung.
// CHỈ dành cho dev/test (bật bằng SEED_DEMO=1 hoặc npm run seed:demo). Xem docs/design.md §12.

export const DEMO_PASSWORD = 'demo-password';
// scrypt của DEMO_PASSWORD, tạo sẵn bằng hashPassword (password.ts) để seed chạy đồng bộ và không tốn
// vài chục ms scrypt mỗi lần khởi động server hay mỗi file test. Mật khẩu demo vốn công khai.
const DEMO_PASSWORD_HASH =
  'scrypt$16384$DLCA1b+KMcQS+MbmNcLzYw==$zi0y2CDTtn2pBecywO5Ow88grW4K1izmRinUXpiSO5bRkI5y2K/pPqR7U7sLgG1nUBzILITnuhspMW/faGjm5A==';

export const DEMO_USERNAMES = { admin: 'admin', lan: 'lan', minh: 'minh', chu: 'chu' } as const;
export const DEMO_USER_IDS = { admin: 'u_admin', lan: 'u_lan', minh: 'u_minh', chu: 'u_chu' } as const;

// Token cố định mà seed tạo trước khi trả nợ N7 (docs/tech-debt.md): ai có bản dev là đoán được. Seed
// không tạo nữa và xoá phiên của các token này nếu DB dev còn giữ từ bản cũ. Muốn có phiên thì đăng nhập
// bằng mật khẩu demo như người dùng (E2E: client/e2e/global-setup.ts).
const LEGACY_DEMO_TOKENS = ['demo-token-admin', 'demo-token-lan', 'demo-token-minh', 'demo-token-chu'];

export const DEMO_PROJECTS = { yte: 'demo-yte', nongnghiep: 'demo-nongnghiep' } as const;

const DEMO_NAMES = { admin: 'admin', lan: 'lan', minh: 'minh', chu: 'Chủ (demo)' } as const;

export function seedDemo(db: Db): void {
  seed(db); // dự án demo-yte và form mẫu
  const now = new Date().toISOString();
  tx(db, () => {
    db.prepare(`INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)`).run(
      DEMO_PROJECTS.nongnghiep,
      'Nông nghiệp (demo)',
      now,
    );
    db.prepare(
      `INSERT OR IGNORE INTO forms (project_id, id, version, schema, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(DEMO_PROJECTS.nongnghiep, SAMPLE_FORM.id, SAMPLE_FORM.version, JSON.stringify(SAMPLE_FORM), now, 'system');

    const addUser = db.prepare(
      `INSERT OR IGNORE INTO users (id, username, name, token_hash, password_hash, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    // DB dev tạo trước TV3-12 đã có lan, minh, admin nhưng chưa có mật khẩu: bổ sung, không đổi mật khẩu đã có.
    const setPassword = db.prepare(`UPDATE users SET password_hash = ? WHERE id = ? AND password_hash IS NULL`);
    for (const key of ['admin', 'lan', 'minh', 'chu'] as const) {
      const id = DEMO_USER_IDS[key];
      // users.token_hash là NOT NULL UNIQUE từ migration 2; giá trị giữ chỗ không phải hex nên không bao
      // giờ trùng SHA-256 của token nào, và requireAuth chỉ tra bảng sessions (như repo/users.ts insertUser).
      addUser.run(id, DEMO_USERNAMES[key], DEMO_NAMES[key], `unused:demo-${key}`, DEMO_PASSWORD_HASH, key === 'admin' ? 1 : 0, now);
      setPassword.run(DEMO_PASSWORD_HASH, id);
    }
    const dropSession = db.prepare(`DELETE FROM sessions WHERE token_hash = ?`);
    for (const token of LEGACY_DEMO_TOKENS) dropSession.run(hashToken(token));

    const addMember = db.prepare(
      `INSERT OR IGNORE INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`,
    );
    addMember.run(DEMO_PROJECTS.yte, DEMO_USER_IDS.lan, 'supervisor', now);
    addMember.run(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.lan, 'surveyor', now);
    addMember.run(DEMO_PROJECTS.yte, DEMO_USER_IDS.minh, 'surveyor', now);
    // Mỗi dự án demo có một Owner (ADR 0003 §2); admin không thuộc dự án nào (ADR 0003, migration 4).
    addMember.run(DEMO_PROJECTS.yte, DEMO_USER_IDS.chu, 'owner', now);
    addMember.run(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.chu, 'owner', now);
  });
}
