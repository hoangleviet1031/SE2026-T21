import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/auth';
import { openDb, type Db } from '../src/db';
import {
  createNotifier,
  type Notification,
  type NotificationChannel,
  type RecordCreatedEvent,
} from '../src/notifications';
import { DEMO_PROJECTS, DEMO_USER_IDS, seedDemo } from '../src/seedDemo';

// Unit cho createNotifier (docs/bt3-vt082/SPEC.md AC1, AC3, AC4, AC5, N2, N3). Test chỉ dựa vào interface
// công khai: không giả định recipient được tra lúc nhận sự kiện hay lúc gửi. Muốn biết chắc một lần gửi
// đã chiếm chỗ thì chờ kênh được gọi, rồi mới phát các sự kiện tiếp theo.

const { admin: U_ADMIN, lan: U_LAN, minh: U_MINH, chu: U_CHU } = DEMO_USER_IDS;
const YTE = DEMO_PROJECTS.yte;
const NN = DEMO_PROJECTS.nongnghiep;

const minhCtx: Ctx = { userId: U_MINH, projectId: YTE, role: 'surveyor' };
const lanCtx: Ctx = { userId: U_LAN, projectId: YTE, role: 'supervisor' };
const chuCtx: Ctx = { userId: U_CHU, projectId: YTE, role: 'owner' };

const CREATED_AT = '2026-11-03T08:00:00.000Z';
const event = (recordId: string): RecordCreatedEvent => ({
  recordId,
  formId: 'household-survey',
  formVersion: 1,
  createdAt: CREATED_AT,
});

const tick = (ms = 20) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const sorted = (xs: string[]) => [...xs].sort();

function addMember(db: Db, userId: string, projectId: string, role: string, disabled = 0) {
  db.prepare(
    `INSERT OR IGNORE INTO users (id, username, name, token_hash, is_admin, disabled, created_at)
     VALUES (?, ?, ?, ?, 0, ?, 'now')`,
  ).run(userId, userId, userId, `unused:${userId}`, disabled);
  db.prepare(`INSERT INTO memberships (project_id, user_id, role, added_at) VALUES (?, ?, ?, 'now')`).run(
    projectId,
    userId,
    role,
  );
}

interface Recorded {
  notification: Notification;
  signal: AbortSignal;
}

/** Kênh tốt: ghi lại lần gọi rồi xong ngay. */
function recordingChannel() {
  const calls: Recorded[] = [];
  const channel: NotificationChannel = {
    send: async (notification, signal) => {
      calls.push({ notification, signal });
    },
  };
  return { channel, calls };
}

/** Kênh bị chặn tới khi `release()`, đếm số lần đang chạy cùng lúc. Bỏ qua `signal`. */
function gatedChannel() {
  const calls: Notification[] = [];
  let inFlight = 0;
  let peak = 0;
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const channel: NotificationChannel = {
    send: async (notification) => {
      calls.push(notification);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await gate;
      inFlight -= 1;
    },
  };
  return { channel, calls, release: () => open(), peak: () => peak };
}

let db: Db;
const logs = {
  log: undefined as unknown as ReturnType<typeof vi.spyOn>,
  info: undefined as unknown as ReturnType<typeof vi.spyOn>,
  warn: undefined as unknown as ReturnType<typeof vi.spyOn>,
  error: undefined as unknown as ReturnType<typeof vi.spyOn>,
};
/** Các dòng log lỗi của notifier, đã parse. Dòng log phải là JSON một dòng như requestLogger. */
const failureLogs = (): Array<Record<string, unknown>> =>
  logs.error.mock.calls.map((args: unknown[]) => JSON.parse(String(args[0])) as Record<string, unknown>);

beforeEach(() => {
  db = openDb(':memory:');
  seedDemo(db);
  logs.log = vi.spyOn(console, 'log').mockImplementation(() => {});
  logs.info = vi.spyOn(console, 'info').mockImplementation(() => {});
  logs.warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  logs.error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    db.close();
  } catch {
    // Test lỗi CSDL đã tự đóng.
  }
});

describe('nội dung thông báo và người nhận (AC1, AC4, AC5)', () => {
  it('gửi đúng một thông báo chỉ metadata tới supervisor và Owner, trừ người tạo, kể cả khi sự kiện lọt `data`', async () => {
    const { channel, calls } = recordingChannel();
    const notifier = createNotifier(db, channel);

    // Kiểu không cho có `data`; ép kiểu để giữ được chốt chặn ở runtime (N3): notifier phải chép theo danh sách trường.
    const leaky = { ...event('r-1'), data: { householdName: 'BI-MAT' } } as RecordCreatedEvent;
    notifier.recordCreated(minhCtx, leaky);
    await notifier.idle();

    expect(calls).toHaveLength(1);
    const { notification, signal } = calls[0]!;
    expect({ ...notification, recipients: sorted(notification.recipients) }).toEqual({
      type: 'record.created',
      projectId: YTE,
      recordId: 'r-1',
      formId: 'household-survey',
      formVersion: 1,
      createdBy: U_MINH,
      createdAt: CREATED_AT,
      recipients: sorted([U_LAN, U_CHU]),
    });
    expect(JSON.stringify(notification)).not.toContain('BI-MAT');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(notifier.stats().sent).toBe(1);

    // Người tạo là supervisor hoặc Owner thì cũng không tự nhận.
    notifier.recordCreated(lanCtx, event('r-2'));
    notifier.recordCreated(chuCtx, event('r-3'));
    await notifier.idle();
    const byRecord = new Map(calls.map((c) => [c.notification.recordId, c.notification.recipients]));
    expect(byRecord.get('r-2')).toEqual([U_CHU]);
    expect(byRecord.get('r-3')).toEqual([U_LAN]);
  });

  it('loại surveyor, tài khoản bị khoá, admin không là thành viên và thành viên dự án khác', async () => {
    addMember(db, 'u_sup_khoa', YTE, 'supervisor', 1);
    addMember(db, 'u_owner_khoa', YTE, 'owner', 1);
    addMember(db, 'u_sv_khac', YTE, 'surveyor');
    addMember(db, 'u_sup_nn', NN, 'supervisor');
    const { channel, calls } = recordingChannel();
    const notifier = createNotifier(db, channel);

    notifier.recordCreated(minhCtx, event('r-1'));
    await notifier.idle();

    expect(calls).toHaveLength(1);
    const recipients = calls[0]!.notification.recipients;
    expect(sorted(recipients)).toEqual(sorted([U_LAN, U_CHU]));
    expect(recipients).not.toContain(U_ADMIN);
    expect(recipients).not.toContain('u_sup_nn');
  });

});

describe('biên độ dài id (AC4, review plan R4; bổ sung sau khi mutation M2, M3 sống sót)', () => {
  // Giá trị ngay tại biên và ngay trên biên: test chuỗi 1 MB không phân biệt được `>` với `>=`.
  it.each([
    ['formId', 256, 1],
    ['formId', 257, 0],
    ['recordId', 256, 1],
    ['recordId', 257, 0],
  ] as const)('%s dài %i ký tự: %i thông báo', async (field, length, expected) => {
    const { channel, calls } = recordingChannel();
    const notifier = createNotifier(db, channel);

    notifier.recordCreated(minhCtx, { ...event('r-1'), [field]: 'x'.repeat(length) });
    await notifier.idle();

    expect(calls).toHaveLength(expected);
    expect(notifier.stats()).toEqual({ sent: expected, failed: 0, timedOut: 0, dropped: 0, skipped: 1 - expected });
  });
});

describe('hàng đợi có giới hạn (AC4, N3)', () => {
  it('quá sức chứa thì bỏ và đếm dropped, không ném lỗi, phần còn lại gửi theo thứ tự vào', async () => {
    const { channel, calls, release } = gatedChannel();
    const notifier = createNotifier(db, channel, { capacity: 2, concurrency: 1, timeoutMs: 5000 });

    notifier.recordCreated(minhCtx, event('dang-gui'));
    await vi.waitFor(() => expect(calls).toHaveLength(1), { timeout: 500 });

    // `capacity` không tính lần đang gửi: 2 vào hàng đợi, 3 bị bỏ.
    for (const id of ['cho-1', 'cho-2', 'bo-1', 'bo-2', 'bo-3']) {
      expect(notifier.recordCreated(minhCtx, event(id))).toBeUndefined();
    }
    expect(notifier.stats().dropped).toBe(3);
    expect(notifier.stats().sent).toBe(0);

    release();
    await notifier.idle();
    expect(calls.map((n) => n.recordId)).toEqual(['dang-gui', 'cho-1', 'cho-2']);
    expect(notifier.stats()).toEqual({ sent: 3, failed: 0, timedOut: 0, dropped: 3, skipped: 0 });
  });

  it('tràn hàng đợi: log một dòng khi bắt đầu tràn, hết tràn rồi tràn lại thì log thêm một dòng', async () => {
    const first = gatedChannel();
    const notifier = createNotifier(db, first.channel, { capacity: 1, concurrency: 1, timeoutMs: 5000 });
    const overflowLines = () => failureLogs().filter((line) => line.reason === 'overflow');

    notifier.recordCreated(minhCtx, event('dang-gui'));
    await vi.waitFor(() => expect(first.calls).toHaveLength(1), { timeout: 500 });
    notifier.recordCreated(minhCtx, event('cho'));
    for (const id of ['bo-1', 'bo-2', 'bo-3']) notifier.recordCreated(minhCtx, event(id));
    expect(overflowLines()).toHaveLength(1);

    first.release();
    await notifier.idle();
    notifier.recordCreated(minhCtx, event('dot-2-dang-gui'));
    notifier.recordCreated(minhCtx, event('dot-2-bo'));
    await notifier.idle();
    expect(overflowLines()).toHaveLength(2);
    expect(notifier.stats().dropped).toBe(4);
  });

  it('không vượt `concurrency`; idle() chỉ resolve khi hàng đợi rỗng và không còn lần gửi nào', async () => {
    const { channel, calls, release, peak } = gatedChannel();
    const notifier = createNotifier(db, channel, { concurrency: 2, timeoutMs: 5000 });

    for (let i = 0; i < 5; i += 1) notifier.recordCreated(minhCtx, event(`r-${i}`));
    await vi.waitFor(() => expect(calls).toHaveLength(2), { timeout: 500 });
    await tick();
    expect(calls).toHaveLength(2);

    let idled = false;
    const waiting = notifier.idle().then(() => {
      idled = true;
    });
    await tick();
    expect(idled).toBe(false);

    release();
    await waiting;
    expect(idled).toBe(true);
    expect(calls).toHaveLength(5);
    expect(peak()).toBe(2);
    expect(notifier.stats().sent).toBe(5);
  });
});

describe('timeout (N2)', () => {
  it('kênh treo bị abort, đếm timedOut, trả chỗ cho lần sau; kết thúc muộn không làm đếm lại', async () => {
    const calls: Recorded[] = [];
    let settleLate: (err: Error) => void = () => {};
    const channel: NotificationChannel = {
      // Lần đầu treo và cố ý bỏ qua `signal`, các lần sau thành công.
      send: (notification, signal) => {
        calls.push({ notification, signal });
        if (calls.length > 1) return Promise.resolve();
        return new Promise<void>((_resolve, reject) => {
          settleLate = reject;
        });
      },
    };
    const notifier = createNotifier(db, channel, { concurrency: 1, timeoutMs: 20 });

    notifier.recordCreated(minhCtx, event('treo'));
    notifier.recordCreated(minhCtx, event('sau-treo'));
    await notifier.idle();

    expect(calls.map((c) => c.notification.recordId)).toEqual(['treo', 'sau-treo']);
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.signal.aborted).toBe(false);
    expect(notifier.stats()).toEqual({ sent: 1, failed: 0, timedOut: 1, dropped: 0, skipped: 0 });
    expect(failureLogs()).toEqual([
      expect.objectContaining({ event: 'notification_failed', reason: 'timeout', projectId: YTE, recordId: 'treo' }),
    ]);

    // Kênh reject sau khi đã hết giờ: không unhandled rejection, không đếm thêm vào failed.
    settleLate(new Error('muộn'));
    await tick();
    expect(notifier.stats()).toEqual({ sent: 1, failed: 0, timedOut: 1, dropped: 0, skipped: 0 });
  });
});

describe('timeout với kênh tôn trọng signal (N2)', () => {
  it('kênh reject ngay khi bị abort: tính là timedOut, không phải failed', async () => {
    const channel: NotificationChannel = {
      send: (_notification, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    };
    const notifier = createNotifier(db, channel, { timeoutMs: 20 });

    notifier.recordCreated(minhCtx, event('r-abort'));
    await notifier.idle();

    expect(notifier.stats()).toEqual({ sent: 0, failed: 0, timedOut: 1, dropped: 0, skipped: 0 });
    expect(failureLogs().map((line) => line.reason)).toEqual(['timeout']);
  });
});

describe('kênh lỗi (AC3)', () => {
  it('ném đồng bộ, reject Error, reject giá trị lạ: không lọt ra ngoài, đếm failed, ghi log, lần sau vẫn gửi', async () => {
    const failures: Array<() => Promise<void>> = [
      () => {
        throw new Error('ném đồng bộ');
      },
      () => Promise.reject(new Error('reject')),
      () => Promise.reject(undefined),
      () => Promise.reject('chuỗi'),
    ];
    const calls: Notification[] = [];
    const channel: NotificationChannel = {
      send: (notification) => {
        calls.push(notification);
        const fail = failures[calls.length - 1];
        return fail ? fail() : Promise.resolve();
      },
    };
    const notifier = createNotifier(db, channel, { concurrency: 1, timeoutMs: 1000 });

    for (let i = 0; i < 5; i += 1) {
      expect(() => notifier.recordCreated(minhCtx, event(`r-${i}`))).not.toThrow();
    }
    await notifier.idle();

    expect(calls).toHaveLength(5);
    expect(notifier.stats()).toEqual({ sent: 1, failed: 4, timedOut: 0, dropped: 0, skipped: 0 });
    expect(failureLogs().map((line) => [line.reason, line.recordId])).toEqual([
      ['channel_error', 'r-0'],
      ['channel_error', 'r-1'],
      ['channel_error', 'r-2'],
      ['channel_error', 'r-3'],
    ]);
  });

  it('CSDL hỏng khi tra người nhận: không ném lỗi, idle() vẫn resolve, không gọi kênh', async () => {
    const { channel, calls } = recordingChannel();
    const notifier = createNotifier(db, channel);

    // Đối chứng: trước khi hỏng thì notifier đang gửi được.
    notifier.recordCreated(minhCtx, event('truoc'));
    await notifier.idle();
    expect(calls).toHaveLength(1);

    db.close();
    expect(() => notifier.recordCreated(minhCtx, event('sau'))).not.toThrow();
    await expect(notifier.idle()).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(notifier.stats()).toEqual({ sent: 1, failed: 1, timedOut: 0, dropped: 0, skipped: 0 });
    expect(failureLogs().map((line) => [line.reason, line.recordId])).toEqual([['recipients_error', 'sau']]);
  });
});

// Production gọi `createNotifier` không truyền opts (app.ts), mọi test khác đều truyền số riêng. Kiểm hành vi có
// chặn trên chứ không ghim đúng số mặc định, vì ghim số là lý do đã xoá D2 (TEST-REVIEW.md).
describe('cấu hình mặc định như production (bổ sung sau khi mutation M11, M12, M13 sống sót)', () => {
  it('hàng đợi có giới hạn: kênh chặn thì sự kiện dư bị bỏ, không giữ hết trong bộ nhớ (N3)', async () => {
    const EVENTS = 20_000;
    const { channel, calls, release } = gatedChannel();
    const notifier = createNotifier(db, channel);

    notifier.recordCreated(minhCtx, event('dang-gui'));
    await vi.waitFor(() => expect(calls).toHaveLength(1), { timeout: 500 });
    for (let i = 0; i < EVENTS; i += 1) notifier.recordCreated(minhCtx, event(`r-${i}`));
    expect(notifier.stats().dropped).toBeGreaterThan(0);

    release();
    await notifier.idle();
    const { sent, dropped } = notifier.stats();
    expect(sent + dropped).toBe(EVENTS + 1);
  });

  it('mỗi lần gửi có timeout: kênh treo và bỏ qua signal vẫn hết giờ trong vòng 1 giờ (N2)', async () => {
    const ONE_HOUR_MS = 60 * 60 * 1000;
    // Chỉ giả setTimeout: worker cần setImmediate thật để chạy.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const signals: AbortSignal[] = [];
      const channel: NotificationChannel = {
        send: (_notification, signal) => {
          signals.push(signal);
          return new Promise<void>(() => {});
        },
      };
      const notifier = createNotifier(db, channel);

      notifier.recordCreated(minhCtx, event('treo'));
      await vi.waitFor(() => expect(signals).toHaveLength(1), { timeout: 500 });
      vi.advanceTimersByTime(ONE_HOUR_MS);
      await vi.waitFor(() => expect(notifier.stats().timedOut).toBe(1), { timeout: 500 });
      expect(signals[0]!.aborted).toBe(true);
      await notifier.idle();
    } finally {
      vi.useRealTimers();
    }
  });

  it('số lần gửi cùng lúc có chặn trên, sự kiện còn lại vẫn được gửi hết', async () => {
    const EVENTS = 100;
    const MAX_SANE_CONCURRENCY = 16;
    const { channel, calls, release, peak } = gatedChannel();
    const notifier = createNotifier(db, channel);

    for (let i = 0; i < EVENTS; i += 1) notifier.recordCreated(minhCtx, event(`r-${i}`));
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 500 });
    await tick();
    expect(calls.length).toBeLessThanOrEqual(MAX_SANE_CONCURRENCY);

    release();
    await notifier.idle();
    expect(calls).toHaveLength(EVENTS);
    expect(peak()).toBeLessThanOrEqual(MAX_SANE_CONCURRENCY);
    expect(notifier.stats().sent).toBe(EVENTS);
  });
});
