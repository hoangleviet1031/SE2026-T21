import type { Ctx } from './auth';
import type { Db } from './db';

// Thông báo phiếu mới (docs/bt3-vt082/SPEC.md). Khung interface, chưa có hành vi.

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
  send: async () => {},
};

export function createNotifier(_db: Db, _channel: NotificationChannel, _opts: NotifierOptions = {}): Notifier {
  return {
    recordCreated: () => {},
    idle: async () => {},
    stats: () => ({ sent: 0, failed: 0, timedOut: 0, dropped: 0, skipped: 0 }),
  };
}
