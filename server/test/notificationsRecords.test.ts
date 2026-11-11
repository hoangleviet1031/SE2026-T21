import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/auth';
import type { Db } from '../src/db';
import {
  createNotifier,
  type Notification,
  type NotificationChannel,
  type Notifier,
  type NotifierOptions,
  type NotifierStats,
  type RecordCreatedEvent,
} from '../src/notifications';
import { DEMO_USER_IDS } from '../src/seedDemo';
import { createTestServer, type DemoUser, type TestServer } from './fixtures';

// Integration qua HTTP thật cho "thông báo phiếu mới" (docs/bt3-vt082/SPEC.md AC1..AC5, invariant).
//
// Mọi test "không có thông báo" đều kèm đối chứng dương: chứng minh đường thông báo đang sống bằng một
// phiếu được báo trong cùng test. Không có đối chứng thì kiểm "kênh không được gọi" đúng cả khi route
// chưa nối notifier, tức test không phát hiện được gì.

const JSON_LIMIT = 2 * 1024 * 1024; // express.json({ limit: '2mb' })
const MARKER = 'NOI-DUNG-PHIEU-BI-MAT';
const METADATA_MAX_BYTES = 1024;
const NOTIFICATION_KEYS = ['createdAt', 'createdBy', 'formId', 'formVersion', 'projectId', 'recipients', 'recordId', 'type'];

type ChannelState = 'good' | 'throwing' | 'failing' | 'hanging';

interface Harness {
  t: TestServer;
  calls: Notification[];
  stats: () => NotifierStats;
  idle: () => Promise<void>;
}

function channelOf(state: ChannelState, calls: Notification[]): NotificationChannel {
  return {
    send: (notification) => {
      calls.push(notification);
      if (state === 'throwing') throw new Error('kênh ném đồng bộ');
      if (state === 'failing') return Promise.reject(new Error('kênh reject'));
      if (state === 'hanging') return new Promise<void>(() => {});
      return Promise.resolve();
    },
  };
}

async function harness(state: ChannelState, opts: NotifierOptions = {}): Promise<Harness> {
  const calls: Notification[] = [];
  let notifier: Notifier | undefined;
  const t = await createTestServer({
    notifier: (db) => {
      notifier = createNotifier(db, channelOf(state, calls), { timeoutMs: 30, ...opts });
      return notifier;
    },
  });
  return {
    t,
    calls,
    stats: () => notifier!.stats(),
    idle: () => notifier!.idle(),
  };
}

interface PushBody {
  baseVersion?: number;
  data?: Record<string, unknown>;
  deleted?: boolean;
  formId?: string;
  formVersion?: number;
  [extra: string]: unknown;
}

function put(t: TestServer, project: string, token: string, id: string, body: PushBody, key: string) {
  return fetch(`${t.base}/api/projects/${project}/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify({ formId: 'household-survey', formVersion: 1, deleted: false, ...body }),
  });
}

const small = () => ({ householdName: MARKER });
const near2mb = () => ({ householdName: MARKER, note: 'x'.repeat(JSON_LIMIT - 8 * 1024) });

/** Tạo một phiếu sống và đòi kênh được gọi đúng cho phiếu đó: đối chứng dương. */
async function expectPipelineAlive(h: Harness, id: string) {
  const before = h.calls.length;
  const res = await put(h.t, h.t.projects.yte, h.t.tokens.minh, id, { baseVersion: 0, data: small() }, `alive-${id}`);
  expect(res.status).toBe(201);
  await h.idle();
  expect(h.calls.slice(before).map((n) => n.recordId)).toEqual([id]);
}

const countRows = (db: Db, sql: string, ...args: string[]) => (db.prepare(sql).get(...args) as { n: number }).n;

// ---------------------------------------------------------------------------------------------------
// Pairwise: 5 yếu tố, tích đầy đủ 3 x 4 x 2 x 3 x 2 = 144 ca, bảng dưới phủ đủ mọi cặp giá trị bằng 12 ca.
// 12 là cận dưới (tích hai yếu tố lớn nhất: vai trò x loại request). Test "bảng phủ đủ" kiểm lại bằng code.
// ---------------------------------------------------------------------------------------------------

const FACTORS = {
  role: ['surveyor', 'supervisor', 'owner'],
  request: ['create', 'edit', 'replay', 'conflict'],
  deleted: [false, true],
  channel: ['good', 'failing', 'hanging'],
  size: ['small', 'near2mb'],
} as const;

type Role = (typeof FACTORS.role)[number];
type RequestKind = (typeof FACTORS.request)[number];
type PairwiseChannel = (typeof FACTORS.channel)[number];
type Size = (typeof FACTORS.size)[number];

interface Row {
  no: number;
  role: Role;
  request: RequestKind;
  deleted: boolean;
  channel: PairwiseChannel;
  size: Size;
  // Kết quả mong đợi ghi tay, không suy từ cùng logic với code cần kiểm.
  status: number;
  version: number;
  notified: number;
}

// `notified`: số thông báo của toàn kịch bản. edit và conflict cần phiếu có sẵn (tạo sống) nên luôn có đúng
// một thông báo của lần tạo đó, không có thêm thông báo của chính request. Phiếu tạo ra đã xoá: 0.
const PAIRWISE: Row[] = [
  // no  role          request     deleted         channel             size                status       version     notified
  { no: 1, role: 'surveyor', request: 'create', deleted: true, channel: 'good', size: 'near2mb', status: 201, version: 1, notified: 0 },
  { no: 2, role: 'supervisor', request: 'create', deleted: false, channel: 'failing', size: 'small', status: 201, version: 1, notified: 1 },
  { no: 3, role: 'owner', request: 'create', deleted: false, channel: 'hanging', size: 'near2mb', status: 201, version: 1, notified: 1 },
  { no: 4, role: 'surveyor', request: 'edit', deleted: true, channel: 'failing', size: 'near2mb', status: 200, version: 2, notified: 1 },
  { no: 5, role: 'supervisor', request: 'edit', deleted: false, channel: 'hanging', size: 'small', status: 200, version: 2, notified: 1 },
  { no: 6, role: 'owner', request: 'edit', deleted: true, channel: 'good', size: 'small', status: 200, version: 2, notified: 1 },
  { no: 7, role: 'surveyor', request: 'replay', deleted: true, channel: 'hanging', size: 'near2mb', status: 201, version: 1, notified: 0 },
  { no: 8, role: 'supervisor', request: 'replay', deleted: false, channel: 'good', size: 'near2mb', status: 201, version: 1, notified: 1 },
  { no: 9, role: 'owner', request: 'replay', deleted: false, channel: 'failing', size: 'small', status: 201, version: 1, notified: 1 },
  { no: 10, role: 'surveyor', request: 'conflict', deleted: false, channel: 'good', size: 'small', status: 409, version: 2, notified: 1 },
  { no: 11, role: 'supervisor', request: 'conflict', deleted: true, channel: 'failing', size: 'near2mb', status: 409, version: 2, notified: 1 },
  { no: 12, role: 'owner', request: 'conflict', deleted: false, channel: 'hanging', size: 'small', status: 409, version: 2, notified: 1 },
];

const USER_OF_ROLE: Record<Role, DemoUser> = { surveyor: 'minh', supervisor: 'lan', owner: 'chu' };
const RECIPIENTS_OF_ROLE: Record<Role, string[]> = {
  surveyor: [DEMO_USER_IDS.chu, DEMO_USER_IDS.lan],
  supervisor: [DEMO_USER_IDS.chu],
  owner: [DEMO_USER_IDS.lan],
};
const COUNTER_OF_CHANNEL: Record<PairwiseChannel, keyof NotifierStats> = {
  good: 'sent',
  failing: 'failed',
  hanging: 'timedOut',
};

describe('bảng pairwise', { timeout: 30_000 }, () => {
  const servers = {} as Record<PairwiseChannel, Harness>;

  beforeAll(async () => {
    for (const channel of FACTORS.channel) servers[channel] = await harness(channel);
  }, 30_000);
  afterAll(() => {
    for (const channel of FACTORS.channel) servers[channel].t.close();
  });

  it('bảng phủ đủ mọi cặp giá trị của 5 yếu tố', () => {
    const names = Object.keys(FACTORS) as Array<keyof typeof FACTORS>;
    const missing: string[] = [];
    for (let a = 0; a < names.length; a += 1) {
      for (let b = a + 1; b < names.length; b += 1) {
        const fa = names[a]!;
        const fb = names[b]!;
        for (const va of FACTORS[fa]) {
          for (const vb of FACTORS[fb]) {
            if (!PAIRWISE.some((row) => row[fa] === va && row[fb] === vb)) missing.push(`${fa}=${va}, ${fb}=${vb}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
    expect(PAIRWISE).toHaveLength(FACTORS.role.length * FACTORS.request.length);
  });

  it.each(PAIRWISE)(
    'ca $no: $role, $request, deleted=$deleted, kênh $channel, cỡ $size -> $status, $notified thông báo',
    async (row) => {
      const h = servers[row.channel];
      const { t } = h;
      const project = t.projects.yte;
      const user = USER_OF_ROLE[row.role];
      const token = t.tokens[user];
      const id = `pw-${row.no}`;
      const key = (suffix: string) => `pw-${row.no}-${suffix}`;
      const data: Record<string, string> = row.size === 'near2mb' ? near2mb() : small();
      if (row.size === 'near2mb') {
        const bytes = Buffer.byteLength(JSON.stringify({ baseVersion: 0, data, deleted: row.deleted }));
        expect(bytes).toBeLessThanOrEqual(JSON_LIMIT);
        expect(bytes).toBeGreaterThan(JSON_LIMIT - 16 * 1024);
      }

      await h.idle();
      const callsBefore = h.calls.length;
      const statsBefore = h.stats();
      const seed = async () => {
        const res = await put(t, project, token, id, { baseVersion: 0, data: small() }, key('seed'));
        expect(res.status).toBe(201);
      };

      // Chạy kịch bản; `res` là response của request đang xét.
      let res: Response;
      let firstBody: unknown;
      if (row.request === 'create') {
        res = await put(t, project, token, id, { baseVersion: 0, data, deleted: row.deleted }, key('main'));
      } else if (row.request === 'edit') {
        await seed();
        res = await put(t, project, token, id, { baseVersion: 1, data, deleted: row.deleted }, key('main'));
      } else if (row.request === 'replay') {
        const first = await put(t, project, token, id, { baseVersion: 0, data, deleted: row.deleted }, key('main'));
        expect(first.status).toBe(201);
        firstBody = await first.json();
        res = await put(t, project, token, id, { baseVersion: 0, data, deleted: row.deleted }, key('main'));
      } else {
        await seed();
        const moved = await put(t, project, token, id, { baseVersion: 1, data: small() }, key('edit'));
        expect(moved.status).toBe(200);
        res = await put(t, project, token, id, { baseVersion: 1, data, deleted: row.deleted }, key('main'));
      }

      // Response giống hệt như khi không có thông báo, ở mọi trạng thái kênh (AC3, invariant).
      expect(res.status).toBe(row.status);
      expect(res.headers.get('Idempotent-Replayed')).toBe(row.request === 'replay' ? 'true' : null);
      const body = await res.json();
      const finalDeleted = row.request === 'conflict' ? false : row.deleted;
      if (row.request === 'conflict') {
        expect(body.error).toBe('version_conflict');
        expect(body.current.version).toBe(row.version);
      } else {
        expect(body.id).toBe(id);
        expect(body.version).toBe(row.version);
        expect(body.deleted).toBe(finalDeleted);
        expect(body.data.note?.length).toBe(row.size === 'near2mb' ? data.note?.length : undefined);
      }
      if (row.request === 'replay') expect(body).toEqual(firstBody);

      // Dữ liệu đã commit (AC3, AC4). Mỗi lần ghi thành công có đúng một dòng history và một dòng idempotency.
      const saved = t.db.prepare(`SELECT version, deleted FROM records WHERE id = ?`).get(id) as {
        version: number;
        deleted: number;
      };
      expect({ version: saved.version, deleted: saved.deleted === 1 }).toEqual({ version: row.version, deleted: finalDeleted });
      expect(countRows(t.db, `SELECT COUNT(*) AS n FROM record_history WHERE record_id = ?`, id)).toBe(row.version);
      expect(countRows(t.db, `SELECT COUNT(*) AS n FROM idempotency WHERE record_id = ?`, id)).toBe(row.version);
      if (row.request === 'conflict') {
        expect(countRows(t.db, `SELECT COUNT(*) AS n FROM idempotency WHERE key = ?`, key('main'))).toBe(0);
      }

      // Thông báo: đúng số lượng, đúng người, chỉ metadata (AC1, AC2, AC4).
      await h.idle();
      const sent = h.calls.slice(callsBefore);
      expect(sent).toHaveLength(row.notified);
      for (const notification of sent) {
        expect(Object.keys(notification).sort()).toEqual(NOTIFICATION_KEYS);
        expect(notification).toMatchObject({
          type: 'record.created',
          projectId: project,
          recordId: id,
          createdBy: DEMO_USER_IDS[user],
        });
        expect([...notification.recipients].sort()).toEqual(RECIPIENTS_OF_ROLE[row.role]);
        const json = JSON.stringify(notification);
        expect(json).not.toContain(MARKER);
        expect(Buffer.byteLength(json)).toBeLessThan(METADATA_MAX_BYTES);
      }

      // Kết cục vào đúng bộ đếm của trạng thái kênh.
      const statsAfter = h.stats();
      const counter = COUNTER_OF_CHANNEL[row.channel];
      expect(statsAfter).toEqual({ ...statsBefore, [counter]: statsBefore[counter] + row.notified });

      await expectPipelineAlive(h, `${id}-alive`);
    },
  );
});

// ---------------------------------------------------------------------------------------------------

describe('AC1: đúng người, một lần', () => {
  let t: TestServer | undefined;
  afterEach(() => {
    t?.close();
    t = undefined;
  });

  it('route gọi recordCreated đúng một lần, sau commit, với ctx từ token và sự kiện không có `data`', async () => {
    const seen: Array<{ ctx: Ctx; event: RecordCreatedEvent; inTransaction: boolean; committed: boolean }> = [];
    const server = await createTestServer({
      notifier: (db) => ({
        recordCreated: (ctx, event) => {
          // BEGIN ném lỗi nếu transaction của route còn mở.
          let inTransaction = false;
          try {
            db.exec('BEGIN');
            db.exec('ROLLBACK');
          } catch {
            inTransaction = true;
          }
          const committed = db.prepare(`SELECT 1 FROM idempotency WHERE record_id = ?`).get(event.recordId) !== undefined;
          seen.push({ ctx, event, inTransaction, committed });
        },
        idle: async () => {},
        stats: () => ({ sent: 0, failed: 0, timedOut: 0, dropped: 0, skipped: 0 }),
      }),
    });
    t = server;

    // Body giả projectId và updatedBy: phải bị bỏ qua, ctx chỉ đến từ đường dẫn và token (ADR 0002).
    const res = await put(
      server,
      server.projects.yte,
      server.tokens.minh,
      'ac1-spy',
      { baseVersion: 0, data: small(), projectId: server.projects.nongnghiep, updatedBy: DEMO_USER_IDS.chu },
      'ac1-spy',
    );
    expect(res.status).toBe(201);
    const body = await res.json();

    await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 500 });
    const [call] = seen;
    expect(call!.ctx).toEqual({ userId: DEMO_USER_IDS.minh, projectId: server.projects.yte, role: 'surveyor' });
    expect(Object.keys(call!.event).sort()).toEqual(['createdAt', 'formId', 'formVersion', 'recordId']);
    expect(call!.event).toMatchObject({ recordId: 'ac1-spy', formId: 'household-survey', formVersion: 1 });
    expect(call!.event.createdAt).toBe(body.updatedAt);
    expect(call!.inTransaction).toBe(false);
    expect(call!.committed).toBe(true);
    expect(JSON.stringify(call!.event)).not.toContain(MARKER);
  });

  it('dự án không có người nhận: vẫn 201, không gọi kênh, đếm skipped', async () => {
    const h = await harness('good');
    t = h.t;
    const nn = h.t.projects.nongnghiep;

    // Ở nongnghiep chu là Owner duy nhất, lan là surveyor nên không nhận.
    const res = await put(h.t, nn, h.t.tokens.chu, 'ac1-none', { baseVersion: 0, data: small() }, 'ac1-none');
    expect(res.status).toBe(201);
    await h.idle();
    expect(h.calls).toHaveLength(0);
    expect(h.stats().skipped).toBe(1);

    // Đối chứng: lan tạo trong cùng dự án thì chu nhận.
    const control = await put(h.t, nn, h.t.tokens.lan, 'ac1-some', { baseVersion: 0, data: small() }, 'ac1-some');
    expect(control.status).toBe(201);
    await h.idle();
    expect(h.calls.map((n) => [n.recordId, n.recipients])).toEqual([['ac1-some', [DEMO_USER_IDS.chu]]]);
  });
});

describe('AC2: không báo sai sự kiện', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await harness('good');
  });
  afterAll(() => h.t.close());

  /** Chạy `act`, đòi đúng `status` và không thêm thông báo. Người gọi tự làm đối chứng dương. */
  async function expectNoNotification(label: string, act: () => Promise<Response>, status: number) {
    await h.idle();
    const before = h.calls.length;
    const res = await act();
    expect(res.status, label).toBe(status);
    await h.idle();
    expect(h.calls.slice(before), label).toEqual([]);
  }

  it('400, 401, 403, 404: không thông báo, không ghi phiếu', async () => {
    const { t } = h;
    const yte = t.projects.yte;
    const nn = t.projects.nongnghiep;
    const url = `${t.base}/api/projects/${yte}/records`;
    const json = { 'Content-Type': 'application/json', Authorization: `Bearer ${t.tokens.minh}` };
    const valid = JSON.stringify({ baseVersion: 0, data: small(), formId: 'household-survey', formVersion: 1, deleted: false });

    expect((await put(t, yte, t.tokens.chu, 'neg-owned', { baseVersion: 0, data: small() }, 'neg-owned')).status).toBe(201);
    await expectPipelineAlive(h, 'neg-alive');

    await expectNoNotification('thiếu Idempotency-Key', () => fetch(`${url}/neg-a`, { method: 'PUT', headers: json, body: valid }), 400);
    await expectNoNotification(
      'thân sai',
      () => put(t, yte, t.tokens.minh, 'neg-b', { data: small() }, 'neg-b'),
      400,
    );
    await expectNoNotification(
      'JSON hỏng',
      () => fetch(`${url}/neg-c`, { method: 'PUT', headers: { ...json, 'Idempotency-Key': 'neg-c' }, body: '{"baseVersion":' }),
      400,
    );
    await expectNoNotification(
      'không có token',
      () =>
        fetch(`${url}/neg-d`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'neg-d' },
          body: valid,
        }),
      401,
    );
    await expectNoNotification(
      'không là thành viên',
      () => put(t, yte, t.tokens.admin, 'neg-e', { baseVersion: 0, data: small() }, 'neg-e'),
      403,
    );
    await expectNoNotification(
      'baseVersion > 0 vào id chưa có',
      () => put(t, yte, t.tokens.lan, 'neg-f', { baseVersion: 3, data: small() }, 'neg-f'),
      404,
    );
    await expectNoNotification(
      'id thuộc dự án khác',
      () => put(t, nn, t.tokens.lan, 'neg-owned', { baseVersion: 0, data: small() }, 'neg-g'),
      404,
    );
    await expectNoNotification(
      'surveyor đụng phiếu người khác',
      () => put(t, yte, t.tokens.minh, 'neg-owned', { baseVersion: 1, data: small() }, 'neg-h'),
      404,
    );

    for (const id of ['neg-a', 'neg-b', 'neg-c', 'neg-d', 'neg-e', 'neg-f']) {
      expect(countRows(t.db, `SELECT COUNT(*) AS n FROM records WHERE id = ?`, id), id).toBe(0);
    }
  });

  it('422: dùng lại key cho nội dung khác hoặc phiếu khác', async () => {
    const { t } = h;
    const yte = t.projects.yte;
    await expectPipelineAlive(h, 'k422');

    await expectNoNotification(
      'cùng phiếu, khác nội dung',
      () => put(t, yte, t.tokens.minh, 'k422', { baseVersion: 0, data: { householdName: 'Khác' } }, 'alive-k422'),
      422,
    );
    // Phiếu chưa có, nếu không kiểm key thì sẽ là một lần tạo mới hợp lệ.
    await expectNoNotification(
      'phiếu khác',
      () => put(t, yte, t.tokens.minh, 'k422-moi', { baseVersion: 0, data: small() }, 'alive-k422'),
      422,
    );
    expect(countRows(t.db, `SELECT COUNT(*) AS n FROM records WHERE id = 'k422-moi'`)).toBe(0);
  });

  it('413: vượt 2mb thì không ghi, không thông báo', async () => {
    const { t } = h;
    await expectPipelineAlive(h, 'big-alive');
    const data = { householdName: MARKER, note: 'x'.repeat(JSON_LIMIT + 1024) };
    await expectNoNotification('quá lớn', () => put(t, t.projects.yte, t.tokens.minh, 'big', { baseVersion: 0, data }, 'big'), 413);
    expect(countRows(t.db, `SELECT COUNT(*) AS n FROM records WHERE id = 'big'`)).toBe(0);
  });

  it('chuỗi đời phiếu: bỏ xoá sau khi tạo đã xoá, replay sau khi sửa, gửi lại lệnh tạo bằng key mới', async () => {
    const { t } = h;
    const yte = t.projects.yte;
    const minh = t.tokens.minh;
    await expectPipelineAlive(h, 'life-alive');

    // Tạo đã xoá rồi khôi phục: khôi phục là sửa (200), không thành "phiếu mới" (design §5.7).
    await expectNoNotification('tạo đã xoá', () => put(t, yte, minh, 'life-del', { baseVersion: 0, data: small(), deleted: true }, 'life-del-1'), 201);
    await expectNoNotification('khôi phục', () => put(t, yte, minh, 'life-del', { baseVersion: 1, data: small(), deleted: false }, 'life-del-2'), 200);

    // Phiếu sống: thông báo chỉ một lần, dù có sửa, xoá và client offline gửi lại đủ kiểu.
    const before = h.calls.length;
    const created = { baseVersion: 0, data: small() };
    const edited = { baseVersion: 1, data: { householdName: 'Sửa' } };
    expect((await put(t, yte, minh, 'life', created, 'life-1')).status).toBe(201);
    await h.idle();
    expect(h.calls.slice(before).map((n) => n.recordId)).toEqual(['life']);

    await expectNoNotification('sửa', () => put(t, yte, minh, 'life', edited, 'life-2'), 200);
    await expectNoNotification('replay lệnh tạo sau khi đã sửa', () => put(t, yte, minh, 'life', created, 'life-1'), 201);
    await expectNoNotification('replay lệnh sửa', () => put(t, yte, minh, 'life', edited, 'life-2'), 200);
    await expectNoNotification('tạo lại bằng key mới', () => put(t, yte, minh, 'life', created, 'life-3'), 409);
    await expectNoNotification('xoá', () => put(t, yte, minh, 'life', { baseVersion: 2, data: small(), deleted: true }, 'life-4'), 200);
  });

  it('gửi đồng thời cùng id: đúng một thông báo cho dù cùng key hay khác key', async () => {
    const { t } = h;
    const yte = t.projects.yte;
    const minh = t.tokens.minh;
    await h.idle();
    const before = h.calls.length;
    const body = { baseVersion: 0, data: small() };

    const sameKey = await Promise.all(Array.from({ length: 10 }, () => put(t, yte, minh, 'race-same', body, 'race-same')));
    expect(sameKey.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(sameKey.filter((r) => r.headers.get('Idempotent-Replayed') === 'true')).toHaveLength(9);

    const otherKeys = await Promise.all(Array.from({ length: 10 }, (_, i) => put(t, yte, minh, 'race-keys', body, `race-keys-${i}`)));
    expect(otherKeys.map((r) => r.status).sort()).toEqual([201, ...Array(9).fill(409)]);

    await h.idle();
    expect(h.calls.slice(before).map((n) => n.recordId).sort()).toEqual(['race-keys', 'race-same']);
  });
});

describe('failure path: thông báo chỉ phát sinh sau khi commit', () => {
  it('transaction rollback thì không thông báo; client gửi lại sau đó nhận đúng một thông báo', async () => {
    const h = await harness('good');
    const { t } = h;
    try {
      const body = { baseVersion: 0, data: small() };
      // Ghi records và record_history xong mới hỏng ở idempotency, tức lỗi ở bước cuối của transaction.
      t.db.exec(`CREATE TRIGGER inject_fail BEFORE INSERT ON idempotency BEGIN SELECT RAISE(ABORT, 'tiêm lỗi'); END`);

      const failed = await put(t, t.projects.yte, t.tokens.minh, 'rb', body, 'rb');
      expect(failed.status).toBe(500);
      await h.idle();
      expect(h.calls).toEqual([]);
      expect(countRows(t.db, `SELECT COUNT(*) AS n FROM records WHERE id = 'rb'`)).toBe(0);
      expect(countRows(t.db, `SELECT COUNT(*) AS n FROM record_history WHERE record_id = 'rb'`)).toBe(0);

      t.db.exec(`DROP TRIGGER inject_fail`);
      const retried = await put(t, t.projects.yte, t.tokens.minh, 'rb', body, 'rb');
      expect(retried.status).toBe(201);
      await h.idle();
      expect(h.calls.map((n) => n.recordId)).toEqual(['rb']);
    } finally {
      t.close();
    }
  });
});

describe('AC3: lỗi kênh không ảnh hưởng giao dịch', () => {
  /** Cùng một chuỗi request; trả kết quả đã bỏ các trường theo đồng hồ để so giữa các server. */
  async function runScript(h: Harness) {
    const { t } = h;
    const yte = t.projects.yte;
    const minh = t.tokens.minh;
    const out: unknown[] = [];
    const step = async (id: string, body: PushBody, key: string) => {
      const res = await put(t, yte, minh, id, body, key);
      const text = await res.text();
      out.push({
        status: res.status,
        replayed: res.headers.get('Idempotent-Replayed'),
        body: text.replace(/"updatedAt":"[^"]+"/g, '"updatedAt":"T"'),
      });
    };
    const created = { baseVersion: 0, data: small() };
    await step('p-1', created, 'p-1a');
    await step('p-1', created, 'p-1a'); // replay
    await step('p-1', { baseVersion: 1, data: { householdName: 'Sửa' } }, 'p-1b');
    await step('p-1', { baseVersion: 1, data: { householdName: 'Cũ' } }, 'p-1c'); // 409
    await step('p-1', created, 'p-1d'); // 409, baseVersion 0
    await step('p-2', { baseVersion: 0, data: small(), deleted: true }, 'p-2a');
    await step('p-3', { baseVersion: 0, data: near2mb() }, 'p-3a');
    await h.idle();

    const rows = (sql: string) => t.db.prepare(sql).all();
    return {
      responses: out,
      records: rows(`SELECT id, project_id, form_id, form_version, data, version, deleted, created_by, updated_by, seq FROM records ORDER BY id`),
      history: rows(`SELECT record_id, project_id, version, data, deleted, updated_by FROM record_history ORDER BY record_id, version`),
      idempotency: rows(`SELECT key, project_id, record_id, request_hash, status FROM idempotency ORDER BY key`),
    };
  }

  it('kênh ném, reject, treo: status, body và dữ liệu đã commit giống hệt kênh tốt', { timeout: 30_000 }, async () => {
    const good = await harness('good');
    let baseline: Awaited<ReturnType<typeof runScript>>;
    try {
      baseline = await runScript(good);
      expect(good.calls.map((n) => n.recordId)).toEqual(['p-1', 'p-3']);
    } finally {
      good.t.close();
    }

    const expected: Array<[ChannelState, keyof NotifierStats]> = [
      ['throwing', 'failed'],
      ['failing', 'failed'],
      ['hanging', 'timedOut'],
    ];
    for (const [state, counter] of expected) {
      const h = await harness(state);
      try {
        const result = await runScript(h);
        expect(result, state).toEqual(baseline);
        // Không có dòng này thì so sánh trên đúng cả khi kênh chưa từng được gọi.
        expect(h.calls.map((n) => n.recordId), state).toEqual(['p-1', 'p-3']);
        expect(h.stats()[counter], state).toBe(2);
      } finally {
        h.t.close();
      }
    }
  });

  it('lỗi kênh được ghi log có recordId; message của kênh có thể chứa dữ liệu phiếu nên không được vào log', async () => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
    let notifier: Notifier | undefined;
    const t = await createTestServer({
      notifier: (db) => {
        // Nhà cung cấp hay echo lại payload trong message lỗi: đây là đường duy nhất dữ liệu lọt được vào log.
        const leaky: NotificationChannel = { send: () => Promise.reject(new RangeError(`provider echo: ${MARKER}`)) };
        notifier = createNotifier(db, leaky);
        return notifier;
      },
    });
    try {
      const res = await put(t, t.projects.yte, t.tokens.minh, 'log-1', { baseVersion: 0, data: small() }, 'log-1');
      expect(res.status).toBe(201);
      await notifier!.idle();
      expect(notifier!.stats().failed).toBe(1);

      const failure = lines.map((line) => JSON.parse(line) as Record<string, unknown>).find((line) => line.event === 'notification_failed');
      expect(failure).toEqual({
        event: 'notification_failed',
        reason: 'channel_error',
        errorName: 'RangeError',
        projectId: t.projects.yte,
        recordId: 'log-1',
      });
      expect(lines.join('\n')).not.toContain(MARKER);
    } finally {
      t.close();
      vi.restoreAllMocks();
    }
  });
});

describe('invariant: notifier vi phạm hợp đồng', () => {
  it('recordCreated ném lỗi sau commit: client vẫn 201 đúng body, phiếu đã ghi, có log, không lộ dữ liệu', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    const t = await createTestServer({
      notifier: () => ({
        recordCreated: () => {
          throw new RangeError(`notifier hỏng: ${MARKER}`);
        },
        idle: async () => {},
        stats: () => ({ sent: 0, failed: 0, timedOut: 0, dropped: 0, skipped: 0 }),
      }),
    });
    try {
      const res = await put(t, t.projects.yte, t.tokens.minh, 'guard', { baseVersion: 0, data: small() }, 'guard');
      expect(res.status).toBe(201);
      expect((await res.json()).version).toBe(1);
      expect(countRows(t.db, `SELECT COUNT(*) AS n FROM records WHERE id = 'guard'`)).toBe(1);
      expect(lines.map((line) => JSON.parse(line))).toEqual([
        { event: 'notification_failed', reason: 'notifier_error', errorName: 'RangeError', projectId: t.projects.yte, recordId: 'guard' },
      ]);
      expect(lines.join('\n')).not.toContain(MARKER);
    } finally {
      t.close();
      vi.restoreAllMocks();
    }
  });
});

describe('AC4, N2: không chờ kênh, hàng đợi không chặn request', () => {
  it('kênh treo và hàng đợi đầy: mọi PUT vẫn 201 ngay, dư thì đếm dropped', async () => {
    // timeoutMs dài hơn timeout của test: nếu route `await` kênh thì fetch đầu tiên không bao giờ trả về.
    const h = await harness('hanging', { capacity: 1, concurrency: 1, timeoutMs: 60_000 });
    const { t } = h;
    const yte = t.projects.yte;
    const minh = t.tokens.minh;
    try {
      const first = await put(t, yte, minh, 'q-0', { baseVersion: 0, data: small() }, 'q-0');
      expect(first.status).toBe(201);
      await vi.waitFor(() => expect(h.calls).toHaveLength(1), { timeout: 1000 });

      for (let i = 1; i <= 4; i += 1) {
        const res = await put(t, yte, minh, `q-${i}`, { baseVersion: 0, data: small() }, `q-${i}`);
        expect(res.status).toBe(201);
      }
      // q-0 đang gửi, q-1 chờ, q-2..q-4 bị bỏ.
      expect(h.stats().dropped).toBe(3);
      expect(h.calls).toHaveLength(1);
      expect(countRows(t.db, `SELECT COUNT(*) AS n FROM records WHERE id LIKE 'q-%'`)).toBe(5);
    } finally {
      t.close();
    }
  });
});

describe('AC4: id quá dài (review plan R4)', () => {
  it('formId cỡ 1 MB: phiếu vẫn 201, thông báo bị bỏ qua và đếm skipped, không giữ chuỗi trong hàng đợi', async () => {
    const h = await harness('good');
    try {
      const res = await put(
        h.t,
        h.t.projects.yte,
        h.t.tokens.minh,
        'long-form',
        { baseVersion: 0, data: small(), formId: 'f'.repeat(1024 * 1024) },
        'long-form',
      );
      expect(res.status).toBe(201);
      await h.idle();
      expect(h.calls).toEqual([]);
      expect(h.stats().skipped).toBe(1);
      await expectPipelineAlive(h, 'long-alive');
    } finally {
      h.t.close();
    }
  });
});

describe('nối dây mặc định (review plan R2)', () => {
  it('createApp không truyền notifier: phiếu mới vẫn ra log kênh mặc định', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    const t = await createTestServer();
    try {
      const res = await put(t, t.projects.yte, t.tokens.minh, 'wired', { baseVersion: 0, data: small() }, 'wired');
      expect(res.status).toBe(201);
      await vi.waitFor(() => {
        const sent = lines.map((line) => JSON.parse(line) as Record<string, unknown>).find((line) => line.type === 'record.created');
        expect(sent).toMatchObject({ recordId: 'wired', projectId: t.projects.yte, createdBy: DEMO_USER_IDS.minh });
      });
      expect(lines.join('\n')).not.toContain(MARKER);
    } finally {
      t.close();
      vi.restoreAllMocks();
    }
  });
});

describe('AC5: cách ly dự án', () => {
  it('người nhận chỉ lấy từ dự án trong đường dẫn, vai trò tính theo từng dự án', async () => {
    const h = await harness('good');
    const { t } = h;
    const yte = t.projects.yte;
    const nn = t.projects.nongnghiep;
    try {
      t.db
        .prepare(`INSERT INTO users (id, username, name, token_hash, is_admin, created_at) VALUES ('u_sup_nn', 'sup_nn', 'sup_nn', 'unused:sup_nn', 0, 'now')`)
        .run();
      t.db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, 'u_sup_nn', 'supervisor', 'now')`).run(nn);

      const body = { baseVersion: 0, data: small() };
      // Body giả projectId không được đổi dự án nhận thông báo.
      expect((await put(t, yte, t.tokens.minh, 'iso-yte', { ...body, projectId: nn }, 'iso-yte')).status).toBe(201);
      // lan: supervisor ở yte nhưng chỉ là surveyor ở nongnghiep, nên không nhận phiếu nongnghiep.
      expect((await put(t, nn, t.tokens.chu, 'iso-nn', body, 'iso-nn')).status).toBe(201);
      await h.idle();

      const byId = new Map(h.calls.map((n) => [n.recordId, n]));
      expect(h.calls).toHaveLength(2);
      expect(byId.get('iso-yte')!.projectId).toBe(yte);
      expect([...byId.get('iso-yte')!.recipients].sort()).toEqual([DEMO_USER_IDS.chu, DEMO_USER_IDS.lan].sort());
      expect(byId.get('iso-nn')!.projectId).toBe(nn);
      expect(byId.get('iso-nn')!.recipients).toEqual(['u_sup_nn']);
    } finally {
      t.close();
    }
  });
});
