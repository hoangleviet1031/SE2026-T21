import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthResponse, MeResponse } from '@field-survey/shared';
import { createTestServer, type TestServer } from './fixtures';

// Tài khoản tên + mật khẩu và phiên theo máy: ADR 0003 §1, design §7 (/auth/*), ca U1–U6 ở §10.1.
// Mỗi ca một server mới, vì bộ đếm giới hạn tần suất nằm trong từng app.

let t: TestServer;

beforeEach(async () => {
  t = await createTestServer();
});
afterEach(() => t.close());

// Tài khoản demo lan, minh, admin đã có sẵn (seedDemo), nên ca test dùng tên khác.
const PASSWORD = 'mat-khau-cua-hoa';

/** `ip` đi qua X-Forwarded-For; server tin header này vì request tới từ loopback (trust proxy). */
function post(path: string, body: unknown, opts: { token?: string; ip?: string } = {}) {
  return fetch(`${t.base}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
      ...(opts.ip && { 'X-Forwarded-For': opts.ip }),
    },
    body: JSON.stringify(body),
  });
}

function register(username: string, opts: { ip?: string; password?: string; name?: string } = {}) {
  return post('register', { username, name: opts.name ?? 'Lan', password: opts.password ?? PASSWORD }, opts);
}

function login(username: string, password: string, ip?: string) {
  return post('login', { username, password }, { ip });
}

function me(token: string) {
  return fetch(`${t.base}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
}

function push(token: string, id: string, baseVersion: number, key: string) {
  return fetch(`${t.base}/api/projects/${t.projects.yte}/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify({
      formId: 'household-survey',
      formVersion: 1,
      baseVersion,
      deleted: false,
      data: { householdName: key },
    }),
  });
}

describe('POST /api/auth/register', () => {
  it('U1: đăng ký trả 201 kèm token; /me bằng token đó đúng người, chưa thuộc dự án nào', async () => {
    const res = await register('Lan.Nguyen', { name: '  Nguyễn Lan ' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as AuthResponse;
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 byte base64url
    expect(body.user).toEqual({ id: expect.stringMatching(/^u_[a-z0-9]{8}$/), username: 'lan.nguyen', name: 'Nguyễn Lan', isAdmin: false });

    const meRes = await me(body.token);
    expect(meRes.status).toBe(200);
    expect((await meRes.json()) as MeResponse).toEqual({ user: body.user, projects: [] });
  });

  it('U2: trùng tên đăng nhập (khác hoa thường) → 409 username_taken', async () => {
    expect((await register('lan.nguyen')).status).toBe(201);
    const res = await register('LAN.Nguyen');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'username_taken' });
  });

  it('trùng tên của tài khoản đã có trước (tài khoản demo lan) → 409', async () => {
    const res = await register('lan');
    expect(res.status).toBe(409);
  });

  it.each([
    ['tên sai định dạng', { username: 'hoa nguyen', name: 'Hoa', password: PASSWORD }],
    ['mật khẩu ngắn', { username: 'hoa', name: 'Hoa', password: '1234567' }],
    ['thiếu tên hiển thị', { username: 'hoa', password: PASSWORD }],
    ['là mảng', ['hoa']],
  ])('%s → 400 invalid_body', async (_label, body) => {
    const res = await post('register', body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });

  it('quá 5 tài khoản/giờ cùng IP → 429; IP khác vẫn đăng ký được', async () => {
    for (let i = 0; i < 5; i++) expect((await register(`nguoi${i}`, { ip: '10.0.0.1' })).status).toBe(201);
    const res = await register('nguoi5', { ip: '10.0.0.1' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'too_many_requests' });
    expect((await register('nguoi6', { ip: '10.0.0.2' })).status).toBe(201);
  });

  it('đăng ký hỏng (trùng tên, sai thân) không tính vào giới hạn 5/giờ', async () => {
    expect((await register('hoa', { ip: '10.0.0.3' })).status).toBe(201);
    for (let i = 0; i < 5; i++) expect((await register('hoa', { ip: '10.0.0.3' })).status).toBe(409);
    expect((await post('register', { username: 'x' }, { ip: '10.0.0.3' })).status).toBe(400);
    expect((await register('hoa2', { ip: '10.0.0.3' })).status).toBe(201);
  });
});

describe('POST /api/auth/login', () => {
  it('đúng tên (không phân biệt hoa thường) và mật khẩu → 200 kèm token phiên mới', async () => {
    const reg = (await (await register('hoa')).json()) as AuthResponse;
    const res = await login('HOA', PASSWORD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthResponse;
    expect(body.user).toEqual(reg.user);
    expect(body.token).not.toBe(reg.token);
    expect((await me(body.token)).status).toBe(200);
  });

  it('U3: sai mật khẩu và sai tên đăng nhập trả cùng 401 invalid_credentials', async () => {
    await register('hoa');
    const wrongPassword = await login('hoa', 'sai-mat-khau');
    const wrongName = await login('khong.co.ai', PASSWORD);
    expect(wrongPassword.status).toBe(401);
    expect(wrongName.status).toBe(401);
    const a: unknown = await wrongPassword.json();
    expect(a).toEqual({ error: 'invalid_credentials' });
    expect(await wrongName.json()).toEqual(a);
  });

  it('tài khoản bị khoá → 401 invalid_credentials (không lộ là bị khoá)', async () => {
    const reg = (await (await register('hoa')).json()) as AuthResponse;
    t.db.prepare(`UPDATE users SET disabled = 1 WHERE id = ?`).run(reg.user.id);
    const res = await login('hoa', PASSWORD);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('tài khoản cũ chưa có mật khẩu (trước migration 4) → 401 invalid_credentials', async () => {
    const res = await login('lan', '');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('tài khoản admin đăng nhập được (để dùng trang quản trị)', async () => {
    const reg = (await (await register('quantri')).json()) as AuthResponse;
    t.db.prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).run(reg.user.id);
    const res = await login('quantri', PASSWORD);
    expect(res.status).toBe(200);
    expect(((await res.json()) as AuthResponse).user.isAdmin).toBe(true);
  });

  it('thân sai kiểu → 400 invalid_body', async () => {
    const res = await post('login', { username: 'hoa' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });

  it('U4: sai mật khẩu 10 lần thì lần 11 nhận 429, kể cả khi mật khẩu đúng', async () => {
    await register('hoa');
    for (let i = 0; i < 10; i++) {
      // Mỗi lần một IP khác để chắc chắn là chặn theo tên đăng nhập
      expect((await login('hoa', `sai-${i}`, `10.1.0.${i}`)).status).toBe(401);
    }
    const res = await login('hoa', PASSWORD, '10.1.0.99');
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'too_many_requests' });
  });

  it('U4 theo IP: 10 lần sai từ một IP (nhiều tên khác nhau) thì IP đó bị chặn, IP khác không', async () => {
    await register('hoa', { ip: '10.2.0.9' });
    for (let i = 0; i < 10; i++) expect((await login(`ten${i}`, 'sai', '10.2.0.1')).status).toBe(401);
    expect((await login('hoa', PASSWORD, '10.2.0.1')).status).toBe(429);
    expect((await login('hoa', PASSWORD, '10.2.0.2')).status).toBe(200);
  });
});

// Kẻ đoán mật khẩu gửi nhiều request cùng lúc: scrypt chạy bất đồng bộ nên mọi request có thể
// qua bước kiểm trước khi lần sai đầu tiên kịp ghi. Lượt phải được giữ chỗ trước khi chờ scrypt.
describe('giới hạn tần suất khi gửi song song', () => {
  it('15 lần đăng nhập sai cùng lúc: tối đa 10 lần được kiểm mật khẩu, còn lại 429; sau đó mật khẩu đúng cũng 429', async () => {
    await register('hoa', { ip: '10.3.0.9' });
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) => login('hoa', `sai-${i}`, `10.3.1.${i}`)),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
    expect((await login('hoa', PASSWORD, '10.3.2.1')).status).toBe(429);
  });

  it('8 lần đăng ký cùng lúc từ một IP: đúng 5 tài khoản được tạo', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => register(`song${i}`, { ip: '10.4.0.1' })));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(3);
    const created = t.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE username LIKE 'song%'`).get() as { n: number };
    expect(created.n).toBe(5);
  });

  it('đăng nhập đúng không chiếm lượt sai: 9 lần sai, 3 lần đúng, thêm 1 lần sai vẫn được kiểm', async () => {
    await register('hoa', { ip: '10.5.0.9' });
    for (let i = 0; i < 9; i++) expect((await login('hoa', `sai-${i}`, `10.5.1.${i}`)).status).toBe(401);
    for (let i = 0; i < 3; i++) expect((await login('hoa', PASSWORD, `10.5.2.${i}`)).status).toBe(200);
    expect((await login('hoa', 'sai-cuoi', '10.5.3.1')).status).toBe(401);
    expect((await login('hoa', PASSWORD, '10.5.3.2')).status).toBe(429);
  });

  it('đăng ký trùng tên cùng lúc không chiếm lượt đăng ký', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => register('trung', { ip: '10.6.0.1' })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    for (let i = 0; i < 4; i++) expect((await register(`khac${i}`, { ip: '10.6.0.1' })).status).toBe(201);
  });
});

describe('phiên theo máy', () => {
  it('U5: hai phiên cùng gửi phiếu; đăng xuất một máy không ảnh hưởng máy kia', async () => {
    const reg = (await (await register('hoa')).json()) as AuthResponse;
    // Thêm vào dự án demo-yte để gửi phiếu được (P/members là việc của TV1-08)
    t.db
      .prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, 'surveyor', 'now')`)
      .run(t.projects.yte, reg.user.id);

    const a = ((await (await login('hoa', PASSWORD)).json()) as AuthResponse).token;
    const b = ((await (await login('hoa', PASSWORD)).json()) as AuthResponse).token;
    expect(a).not.toBe(b);

    expect((await push(a, 'r-may-a', 0, 'k-a1')).status).toBe(201);
    expect((await push(b, 'r-may-b', 0, 'k-b1')).status).toBe(201);

    const out = await post('logout', {}, { token: a });
    expect(out.status).toBe(204);
    expect((await me(a)).status).toBe(401);

    expect((await push(b, 'r-may-b', 1, 'k-b2')).status).toBe(200);
    expect((await me(reg.token)).status).toBe(200);
  });

  it('đăng xuất không có token → 401; đăng xuất lần hai bằng token đã huỷ → 401', async () => {
    expect((await post('logout', {})).status).toBe(401);
    const { token } = (await (await register('hoa')).json()) as AuthResponse;
    expect((await post('logout', {}, { token })).status).toBe(204);
    expect((await post('logout', {}, { token })).status).toBe(401);
  });

  it('U6: CSDL chỉ chứa hash, không có mật khẩu hay token gốc', async () => {
    const reg = (await (await register('hoa')).json()) as AuthResponse;
    const logged = (await (await login('hoa', PASSWORD)).json()) as AuthResponse;
    const secrets = [PASSWORD, reg.token, logged.token];

    const rows = [
      ...(t.db.prepare(`SELECT * FROM users`).all() as Record<string, unknown>[]),
      ...(t.db.prepare(`SELECT * FROM sessions`).all() as Record<string, unknown>[]),
    ];
    const dump = JSON.stringify(rows);
    for (const s of secrets) expect(dump).not.toContain(s);

    const user = t.db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(reg.user.id) as { password_hash: string };
    expect(user.password_hash).toMatch(/^scrypt\$/);
    const sessions = t.db.prepare(`SELECT token_hash FROM sessions WHERE user_id = ?`).all(reg.user.id);
    expect(sessions).toHaveLength(2);
  });
});
