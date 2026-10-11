import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb, seed, type Db } from '../src/db';
import { createApp } from '../src/app';
import { addUser, disableUser, rotateToken, runUserCli } from '../src/cli/user';
import { seedDemoAllowed } from '../src/cli/seedDemo';
import { DEMO_TOKENS, seedDemo } from '../src/seedDemo';

// Lệnh quản trị ở design §12. Kiểm bằng request thật: token qua được xác thực thì
// gọi dự án mình không thuộc nhận 403 not_member; token sai hoặc bị khoá nhận 401.

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

async function statusWith(token: string): Promise<number> {
  const res = await fetch(`${base}/api/projects/demo-yte/records`, { headers: { Authorization: `Bearer ${token}` } });
  return res.status;
}

function userRow(id: string) {
  return db.prepare(`SELECT name, token_hash, is_admin, disabled FROM users WHERE id = ?`).get(id) as
    | { name: string; token_hash: string; is_admin: number; disabled: number }
    | undefined;
}

describe('user:add', () => {
  it('tạo người dùng, token dùng được ngay, DB chỉ giữ hash', async () => {
    const { userId, token } = addUser(db, { name: 'Lan' });
    expect(userId).toMatch(/^u_[a-z0-9]{8}$/);
    expect(await statusWith(token)).toBe(403);
    const row = userRow(userId);
    expect(row).toMatchObject({ name: 'Lan', is_admin: 0, disabled: 0 });
    expect(row?.token_hash).not.toContain(token);
  });

  it('--admin đặt cờ quản trị', () => {
    const { userId } = addUser(db, { name: 'Quản trị', admin: true });
    expect(userRow(userId)?.is_admin).toBe(1);
  });

  it('mỗi lần tạo cho userId và token khác nhau', () => {
    const a = addUser(db, { name: 'A' });
    const b = addUser(db, { name: 'A' });
    expect(a.userId).not.toBe(b.userId);
    expect(a.token).not.toBe(b.token);
  });

  it('tên rỗng thì báo lỗi, không ghi', () => {
    const before = (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
    expect(() => addUser(db, { name: '   ' })).toThrow();
    expect((db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n).toBe(before);
  });
});

describe('user:rotate-token', () => {
  it('token cũ hết hiệu lực, token mới dùng được', async () => {
    const { userId, token: oldToken } = addUser(db, { name: 'Minh' });
    const newToken = rotateToken(db, userId);
    expect(newToken).not.toBe(oldToken);
    expect(await statusWith(oldToken)).toBe(401);
    expect(await statusWith(newToken)).toBe(403);
  });

  it('userId không tồn tại thì báo lỗi', () => {
    expect(() => rotateToken(db, 'u_khongco')).toThrow();
  });
});

describe('user:disable', () => {
  it('token đang dùng bị từ chối 401', async () => {
    const { userId, token } = addUser(db, { name: 'Vy' });
    disableUser(db, userId);
    expect(await statusWith(token)).toBe(401);
    expect(userRow(userId)?.disabled).toBe(1);
  });

  it('userId không tồn tại thì báo lỗi', () => {
    expect(() => disableUser(db, 'u_khongco')).toThrow();
  });
});

describe('runUserCli (đọc tham số dòng lệnh)', () => {
  function run(argv: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = runUserCli(argv, db, { out: (l) => out.push(l), err: (l) => err.push(l) });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  it('add in userId và token, thoát 0', async () => {
    const { code, out } = run(['add', '--name', 'Hà']);
    expect(code).toBe(0);
    const token = /token:\s*(\S+)/i.exec(out)?.[1];
    expect(/userId:\s*(u_[a-z0-9]{8})/i.exec(out)).not.toBeNull();
    expect(token).toBeDefined();
    expect(await statusWith(token ?? '')).toBe(403);
  });

  it('thiếu --name thì thoát 1 và báo lỗi', () => {
    const { code, err } = run(['add']);
    expect(code).toBe(1);
    expect(err).not.toBe('');
  });

  it('thiếu --user hoặc userId sai thì thoát 1', () => {
    expect(run(['rotate-token']).code).toBe(1);
    expect(run(['disable', '--user', 'u_khongco']).code).toBe(1);
  });

  it('lệnh không biết thì thoát 1', () => {
    expect(run(['xoa', '--user', 'u_x']).code).toBe(1);
  });
});

describe('seed:demo', () => {
  it('chạy hai lần không lỗi, không tạo trùng, token demo dùng được', async () => {
    seedDemo(db);
    seedDemo(db);
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE id IN ('u_admin', 'u_lan', 'u_minh')`).get() as {
      n: number;
    }).n;
    expect(n).toBe(3);
    expect(await statusWith(DEMO_TOKENS.lan)).toBe(200);
  });

  it('từ chối chạy khi NODE_ENV=production (token demo ai cũng biết)', () => {
    expect(seedDemoAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(seedDemoAllowed({})).toBe(true);
    expect(seedDemoAllowed({ NODE_ENV: 'development' })).toBe(true);
  });
});
