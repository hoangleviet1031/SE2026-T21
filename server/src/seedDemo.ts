import { tx, seed, SAMPLE_FORM, type Db } from './db';
import { hashToken } from './auth';

// Dữ liệu demo: hai dự án, ba người dùng, token cố định để dev và test dùng chung.
// CHỈ dành cho dev/test (bật bằng SEED_DEMO=1). Xem docs/design.md §12.
export const DEMO_TOKENS = {
  admin: 'demo-token-admin',
  lan: 'demo-token-lan',
  minh: 'demo-token-minh',
} as const;

export const DEMO_USER_IDS = { admin: 'u_admin', lan: 'u_lan', minh: 'u_minh' } as const;

export const DEMO_PROJECTS = { yte: 'demo-yte', nongnghiep: 'demo-nongnghiep' } as const;

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
      `INSERT OR IGNORE INTO users (id, name, token_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)`,
    );
    addUser.run(DEMO_USER_IDS.admin, 'admin', hashToken(DEMO_TOKENS.admin), 1, now);
    addUser.run(DEMO_USER_IDS.lan, 'lan', hashToken(DEMO_TOKENS.lan), 0, now);
    addUser.run(DEMO_USER_IDS.minh, 'minh', hashToken(DEMO_TOKENS.minh), 0, now);

    const addMember = db.prepare(
      `INSERT OR IGNORE INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`,
    );
    addMember.run(DEMO_PROJECTS.yte, DEMO_USER_IDS.lan, 'supervisor', now);
    addMember.run(DEMO_PROJECTS.nongnghiep, DEMO_USER_IDS.lan, 'surveyor', now);
    addMember.run(DEMO_PROJECTS.yte, DEMO_USER_IDS.minh, 'surveyor', now);
  });
}
