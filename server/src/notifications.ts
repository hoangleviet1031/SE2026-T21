import type { Ctx } from './auth';
import type { Db } from './db';
import { listNotificationRecipients } from './repo/memberships';

// Thông báo phiếu mới (docs/bt3-vt082/SPEC.md).

const MAX_ID_CHARS = 256;

export interface RecordCreatedEvent {
  recordId: string;
  formId: string;
  formVersion: number;
  createdAt: string;
}

/** Chỉ metadata, không bao giờ có `data` của phiếu (AC4, N3). */
export interface Notification {
  type: 'record.created';
  projectId: string;
  recordId: string;
  formId: string;
  formVersion: number;
  createdBy: string;
  createdAt: string;
  recipients: string[];
}

export interface NotificationChannel {
  send(notification: Notification, signal: AbortSignal): Promise<void>;
}

export interface NotifierStats {
  sent: number;
  failed: number;
  timedOut: number;
  dropped: number;
  skipped: number;
}

export interface Notifier {
  /** Hợp đồng: không bao giờ ném lỗi, không bao giờ chờ I/O. Gọi sau khi transaction đã commit. */
  recordCreated(ctx: Ctx, event: RecordCreatedEvent): void;
  /** Resolve khi hàng đợi rỗng và không còn lần gửi nào đang chạy. */
  idle(): Promise<void>;
  stats(): NotifierStats;
}

export interface NotifierOptions {
  /** Số thông báo chờ tối đa, không tính lần đang gửi. Mặc định 1000. */
  capacity?: number;
  /** Số lần gửi chạy cùng lúc. Mặc định 4. */
  concurrency?: number;
  /** Thời gian tối đa cho một lần gửi. Mặc định 5000 ms. */
  timeoutMs?: number;
}

/** Kênh mặc định của slice này: ghi một dòng JSON ra log. */
export const logChannel: NotificationChannel = {
  send: async (notification) => {
    console.log(JSON.stringify(notification));
  },
};

type FailureReason = 'timeout' | 'channel_error' | 'recipients_error' | 'overflow' | 'notifier_error';
type Draft = Omit<Notification, 'recipients'>;

/** Không bao giờ ghi `err.message`: nhà cung cấp có thể echo dữ liệu phiếu trong đó (AC3). */
export function logFailure(
  reason: FailureReason,
  draft: Pick<Draft, 'projectId' | 'recordId'>,
  err?: unknown,
): void {
  try {
    console.error(
      JSON.stringify({
        event: 'notification_failed',
        reason,
        errorName: err instanceof Error ? err.name : undefined,
        projectId: draft.projectId,
        recordId: draft.recordId,
      }),
    );
  } catch {
    // `err` do kênh ném ra, có thể là giá trị bất kỳ: ghi log hỏng cũng không được lọt ra worker.
  }
}

export function createNotifier(db: Db, channel: NotificationChannel, opts: NotifierOptions = {}): Notifier {
  const capacity = opts.capacity ?? 1000;
  const concurrency = opts.concurrency ?? 4;
  const timeoutMs = opts.timeoutMs ?? 5000;

  const counts: NotifierStats = { sent: 0, failed: 0, timedOut: 0, dropped: 0, skipped: 0 };
  const queue: Array<{ ctx: Ctx; draft: Draft }> = [];
  let idleWaiters: Array<() => void> = [];
  let active = 0;
  let scheduled = false;
  let overflowing = false;

  async function send(notification: Notification): Promise<void> {
    const controller = new AbortController();
    let timedOut = false;
    let expire = () => {};
    const deadline = new Promise<void>((resolve) => {
      expire = resolve;
    });
    // Đặt cờ trước khi abort: kênh tôn trọng `signal` rồi reject vẫn tính là timeout, không phải lỗi kênh.
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      expire();
    }, timeoutMs);
    timer.unref();

    try {
      // `race` đã gắn handler vào promise của kênh nên reject muộn không thành unhandled rejection.
      await Promise.race([channel.send(notification, controller.signal), deadline]);
      if (!timedOut) {
        counts.sent += 1;
        return;
      }
    } catch (err) {
      if (!timedOut) {
        counts.failed += 1;
        logFailure('channel_error', notification, err);
        return;
      }
    } finally {
      clearTimeout(timer);
    }
    counts.timedOut += 1;
    logFailure('timeout', notification);
  }

  async function deliver(ctx: Ctx, draft: Draft): Promise<void> {
    let recipients: string[];
    try {
      recipients = listNotificationRecipients(ctx, db);
    } catch (err) {
      counts.failed += 1;
      logFailure('recipients_error', draft, err);
      return;
    }
    if (recipients.length === 0) {
      counts.skipped += 1;
      return;
    }
    await send({ ...draft, recipients });
  }

  function pump(): void {
    scheduled = false;
    while (active < concurrency && queue.length > 0) {
      const { ctx, draft } = queue.shift()!;
      // Hàng đợi cạn mới là hết đợt tràn; reset sớm hơn thì tải kéo dài sẽ log lại sau mỗi lần lấy ra (R5).
      if (queue.length === 0) overflowing = false;
      active += 1;
      void deliver(ctx, draft).finally(() => {
        active -= 1;
        if (queue.length > 0) schedule();
        else if (active === 0) {
          for (const resolve of idleWaiters) resolve();
          idleWaiters = [];
        }
      });
    }
  }

  // setImmediate: tra CSDL là đồng bộ, phải nằm ngoài đường request và nhường I/O giữa các đợt (N2).
  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    setImmediate(pump);
  }

  return {
    recordCreated: (ctx, event) => {
      if (event.recordId.length > MAX_ID_CHARS || event.formId.length > MAX_ID_CHARS) {
        counts.skipped += 1;
        return;
      }
      // Chép theo danh sách trường để hàng đợi không bao giờ giữ `data` (N3).
      const draft: Draft = {
        type: 'record.created',
        projectId: ctx.projectId,
        recordId: event.recordId,
        formId: event.formId,
        formVersion: event.formVersion,
        createdBy: ctx.userId,
        createdAt: event.createdAt,
      };
      if (queue.length + 1 > capacity) {
        counts.dropped += 1;
        if (!overflowing) logFailure('overflow', draft);
        overflowing = true;
        return;
      }
      queue.push({ ctx, draft });
      schedule();
    },
    idle: () =>
      new Promise<void>((resolve) => {
        if (queue.length === 0 && active === 0) resolve();
        else idleWaiters.push(resolve);
      }),
    stats: () => ({ ...counts }),
  };
}
