import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, seed, type Db } from '../src/db';
import { createApp } from '../src/app';
import { addUser, disableUser, newTempPassword, resetPassword, revokeSessions, runUserCli } from '../src/cli/user';
import { seedDemoAllowed } from '../src/cli/seedDemo';
import { DEMO_PASSWORD, DEMO_PROJECTS, DEMO_USERNAMES, seedDemo } from '../src/seedDemo';
import { hashToken } from '../src/auth';

// Lệnh quản trị theo tài khoản tên + mật khẩu (design §12 bản mới, ADR 0003 §1, ticket TV3-12).
// Kiểm bằng request thật: đăng nhập qua /api/auth/login, dùng phiên gọi /api/me.

let db: Db;
let server: Server;
let base: string;

beforeAll(async () => {
  db = openDb(':memory:');
  seed(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

async function login(username: string, password: string): Promise<{ status: number; token?: string }> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json()) as { token?: string };
  return { status: res.status, token: body.token };
}

async function meStatus(token: string): Promise<number> {
  return (await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${token}` } })).status;
}

async function loginToken(username: string, password: string): Promise<string> {
  const res = await login(username, password);
  expect(res.status).toBe(200);
  return res.token ?? '';
}

function userRow(username: string) {
  return db.prepare(`SELECT id, name, token_hash, password_hash, is_admin, disabled FROM users WHERE username = ?`).get(
    username,
  ) as
    | { id: string; name: string; token_hash: string; password_hash: string | null; is_admin: number; disabled: number }
    | undefined;
}

const userCount = () => (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;

describe('newTempPassword', () => {
  it('12 ký tự chữ và số, không có ký tự dễ nhầm, đủ dài theo luật mật khẩu', () => {
    for (let i = 0; i < 50; i++) {
      const p = newTempPassword();
      expect(p).toMatch(/^[A-Za-z0-9]{12}$/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
    expect(newTempPassword()).not.toBe(newTempPassword());
  });
});

describe('user:add', () => {
  it('tạo tài khoản, đăng nhập được bằng mật khẩu tạm, DB chỉ giữ hash', async () => {
    const { userId, username, password } = await addUser(db, { username: 'Lan.Nguyen', name: '  Lan  ' });
    expect(username).toBe('lan.nguyen');
    expect(userId).toMatch(/^u_[a-z0-9]{8}$/);
    const row = userRow('lan.nguyen');
    expect(row).toMatchObject({ id: userId, name: 'Lan', is_admin: 0, disabled: 0 });
    expect(row?.password_hash).toMatch(/^scrypt\$/);
    expect(row?.password_hash).not.toContain(password);

    const token = await loginToken('lan.nguyen', password);
    expect(await meStatus(token)).toBe(200);
  });

  it('--admin đặt cờ quản trị', async () => {
    await addUser(db, { username: 'quantri', name: 'Quản trị', admin: true });
    expect(userRow('quantri')?.is_admin).toBe(1);
  });

  it('tên đăng nhập sai định dạng, trùng (khác hoa thường) hoặc tên hiển thị rỗng thì báo lỗi, không ghi', async () => {
    await addUser(db, { username: 'trung.ten', name: 'A' });
    const before = userCount();
    await expect(addUser(db, { username: 'ab', name: 'Ngắn' })).rejects.toThrow();
    await expect(addUser(db, { username: 'co dau cach', name: 'X' })).rejects.toThrow();
    await expect(addUser(db, { username: 'TRUNG.TEN', name: 'Trùng' })).rejects.toThrow();
    await expect(addUser(db, { username: 'ten.moi', name: '   ' })).rejects.toThrow();
    expect(userCount()).toBe(before);
  });
});

describe('user:reset-password', () => {
  it('mật khẩu cũ hết dùng, mật khẩu tạm mới dùng được, phiên đang có vẫn còn', async () => {
    const { password: oldPassword } = await addUser(db, { username: 'minh.reset', name: 'Minh' });
    const oldSession = await loginToken('minh.reset', oldPassword);

    const newPassword = await resetPassword(db, 'MINH.RESET');
    expect(newPassword).not.toBe(oldPassword);
    expect((await login('minh.reset', oldPassword)).status).toBe(401);
    expect(await meStatus(await loginToken('minh.reset', newPassword))).toBe(200);
    // Không thu hồi phiên: máy đang giữ phiếu chưa gửi vẫn gửi được (ADR 0003 §1).
    expect(await meStatus(oldSession)).toBe(200);
  });

  it('tên không tồn tại thì báo lỗi', async () => {
    await expect(resetPassword(db, 'khong.co')).rejects.toThrow();
  });
});

describe('user:revoke-sessions', () => {
  it('mọi phiên của người đó nhận 401, đăng nhập lại được', async () => {
    const { password } = await addUser(db, { username: 'vy.vu', name: 'Vy' });
    const a = await loginToken('vy.vu', password);
    const b = await loginToken('vy.vu', password);
    const other = (await addUser(db, { username: 'khac', name: 'Khác' })).password;
    const otherSession = await loginToken('khac', other);

    expect(revokeSessions(db, 'vy.vu')).toBe(2);
    expect(await meStatus(a)).toBe(401);
    expect(await meStatus(b)).toBe(401);
    expect(await meStatus(otherSession)).toBe(200);
    expect(await meStatus(await loginToken('vy.vu', password))).toBe(200);
  });

  it('tên không tồn tại thì báo lỗi', () => {
    expect(() => revokeSessions(db, 'khong.co')).toThrow();
  });
});

describe('user:disable', () => {
  it('khoá tài khoản: phiên cũ nhận 401, không đăng nhập được nữa', async () => {
    const { password } = await addUser(db, { username: 'bi.khoa', name: 'Bị khoá' });
    const session = await loginToken('bi.khoa', password);

    disableUser(db, 'bi.khoa');
    expect(userRow('bi.khoa')?.disabled).toBe(1);
    expect(await meStatus(session)).toBe(401);
    expect((await login('bi.khoa', password)).status).toBe(401);
    // Phiên bị xoá luôn, không chỉ bị chặn bởi cờ khoá (ADR 0003 §1).
    const sessions = db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`).get(userRow('bi.khoa')?.id ?? '');
    expect(sessions).toEqual({ n: 0 });
  });

  it('tên không tồn tại thì báo lỗi', () => {
    expect(() => disableUser(db, 'khong.co')).toThrow();
  });
});

describe('runUserCli (đọc tham số dòng lệnh)', () => {
  async function run(argv: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runUserCli(argv, db, { out: (l) => out.push(l), err: (l) => err.push(l) });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  it('add in tên đăng nhập và mật khẩu tạm, thoát 0', async () => {
    const { code, out } = await run(['add', '--username', 'ha.le', '--name', 'Hà']);
    expect(code).toBe(0);
    const password = /mật khẩu tạm:\s*(\S+)/i.exec(out)?.[1];
    expect(out).toMatch(/tên đăng nhập:\s*ha\.le\b/i);
    expect(out).toMatch(/userId:\s*u_[a-z0-9]{8}\b/);
    expect(await meStatus(await loginToken('ha.le', password ?? ''))).toBe(200);
  });

  it('reset-password, revoke-sessions, disable chạy được qua dòng lệnh', async () => {
    await run(['add', '--username', 'dong.lenh', '--name', 'Dòng lệnh']);
    const reset = await run(['reset-password', '--user', 'dong.lenh']);
    expect(reset.code).toBe(0);
    const password = /mật khẩu tạm:\s*(\S+)/i.exec(reset.out)?.[1] ?? '';
    await loginToken('dong.lenh', password);
    expect((await run(['revoke-sessions', '--user', 'dong.lenh'])).code).toBe(0);
    expect((await run(['disable', '--user', 'dong.lenh'])).code).toBe(0);
  });

  it('thiếu tham số, tên không có, lệnh lạ hoặc lệnh cũ rotate-token thì thoát 1 và báo lỗi', async () => {
    for (const argv of [
      ['add', '--name', 'Thiếu tên đăng nhập'],
      ['add', '--username', 'thieu.ten'],
      ['reset-password'],
      ['disable', '--user', 'khong.co'],
      ['rotate-token', '--user', 'ha.le'],
      ['xoa'],
    ]) {
      const { code, err } = await run(argv);
      expect({ argv, code, hasError: err !== '' }).toEqual({ argv, code: 1, hasError: true });
    }
  });
});

describe('seed:demo', () => {
  it('chạy hai lần không lỗi, không tạo trùng', () => {
    seedDemo(db);
    seedDemo(db);
    const ids = Object.values(DEMO_USERNAMES);
    const rows = db
      .prepare(`SELECT username FROM users WHERE username IN (${ids.map(() => '?').join(',')}) ORDER BY username`)
      .all(...ids) as { username: string }[];
    expect(rows.map((r) => r.username)).toEqual([...ids].sort());
  });

  it('tài khoản demo đăng nhập được bằng mật khẩu demo; không còn phiên token cố định (N7)', async () => {
    for (const username of Object.values(DEMO_USERNAMES)) {
      expect(await meStatus(await loginToken(username, DEMO_PASSWORD))).toBe(200);
    }
    for (const name of ['admin', 'lan', 'minh', 'chu']) expect(await meStatus(`demo-token-${name}`)).toBe(401);
  });

  it('DB dev có phiên token demo từ bản cũ: chạy seed thì phiên đó bị xoá', async () => {
    // Giả lập DB dev đã seed bằng bản trước N7 (phiên với token đoán được)
    db.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, 'u_lan', 'x', 'x')`).run(
      hashToken('demo-token-lan'),
    );
    expect(await meStatus('demo-token-lan')).toBe(200);
    seedDemo(db);
    expect(await meStatus('demo-token-lan')).toBe(401);
    // Phiên đăng nhập thật của tài khoản demo không bị đụng tới
    const real = await loginToken('lan', DEMO_PASSWORD);
    seedDemo(db);
    expect(await meStatus(real)).toBe(200);
  });

  it('chu là Owner của cả hai dự án; lan, minh giữ vai trò cũ; admin không thuộc dự án nào', () => {
    const roles = db
      .prepare(
        `SELECT u.username, m.project_id, m.role FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE u.username IN ('chu', 'lan', 'minh', 'admin') ORDER BY u.username, m.project_id`,
      )
      .all();
    expect(roles).toEqual([
      { username: DEMO_USERNAMES.chu, project_id: DEMO_PROJECTS.nongnghiep, role: 'owner' },
      { username: DEMO_USERNAMES.chu, project_id: DEMO_PROJECTS.yte, role: 'owner' },
      { username: DEMO_USERNAMES.lan, project_id: DEMO_PROJECTS.nongnghiep, role: 'surveyor' },
      { username: DEMO_USERNAMES.lan, project_id: DEMO_PROJECTS.yte, role: 'supervisor' },
      { username: DEMO_USERNAMES.minh, project_id: DEMO_PROJECTS.yte, role: 'surveyor' },
    ]);
  });

  it('từ chối chạy khi NODE_ENV=production (mật khẩu demo ai cũng biết)', () => {
    expect(seedDemoAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(seedDemoAllowed({})).toBe(true);
    expect(seedDemoAllowed({ NODE_ENV: 'development' })).toBe(true);
  });
});
