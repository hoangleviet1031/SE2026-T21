import {
  detectDeleteConflict,
  nextRetryDelay,
  threeWayMerge,
  type ConflictResponse,
  type RecordData,
  type ServerRecord,
} from '@field-survey/shared';
import { db, formKey, getMeta, setMeta, type OutboxOp } from '../db/db';
import { NetworkError, fetchForms, pullRecords, pushRecord } from './api';
import { getSurveyorName } from './outbox';

// Sync engine: push outbox (FIFO theo từng bản ghi) rồi pull thay đổi từ server.
// Xem docs/design.md §5 và docs/adr/0001-consistency-model.md.

let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** Gọi bất cứ lúc nào; các lần gọi chồng nhau được gộp làm một. */
export function syncNow(): Promise<void> {
  // Reset trong .finally (luôn chạy bất đồng bộ) để không ghi đè sau khi đã reset
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

export function startSyncLoop(intervalMs = 30_000): () => void {
  const kick = () => void syncNow().catch((e) => console.warn('sync failed', e));
  window.addEventListener('online', kick);
  const timer = setInterval(kick, intervalMs);
  kick();
  return () => {
    window.removeEventListener('online', kick);
    clearInterval(timer);
  };
}

async function runSync(): Promise<void> {
  try {
    if (!navigator.onLine) return;
    // Push trước: dữ liệu người dùng quan trọng hơn danh sách form
    await pushAll();
    await pullAll();
    await syncForms();
  } finally {
    await scheduleNextRetry();
  }
}

/** Hẹn giờ chạy lại đúng lúc op sớm nhất hết thời gian backoff */
async function scheduleNextRetry() {
  clearTimeout(retryTimer);
  // Offline thì chờ sự kiện 'online'; chỉ hẹn giờ cho op đang trong thời gian backoff
  if (!navigator.onLine) return;
  const next = await db.outbox
    .where('nextAttemptAt')
    .above(Date.now())
    .filter((op) => op.status === 'queued')
    .first();
  if (!next) return;
  const delay = Math.max(0, next.nextAttemptAt - Date.now());
  retryTimer = setTimeout(() => void syncNow().catch((e) => console.warn('sync failed', e)), delay);
}

async function syncForms(): Promise<void> {
  const forms = await fetchForms();
  await db.forms.bulkPut(forms.map((f) => ({ ...f, key: formKey(f.id, f.version) })));
}

async function pushAll(): Promise<void> {
  const ops = await db.outbox.orderBy('seq').toArray();
  const blockedRecords = new Set<string>();
  for (const op of ops) {
    // Mỗi bản ghi xử lý tuần tự: op sau chỉ đi khi op trước đã xong
    if (blockedRecords.has(op.recordId)) continue;
    if (op.status !== 'queued' || op.nextAttemptAt > Date.now()) {
      blockedRecords.add(op.recordId);
      continue;
    }
    const done = await pushOne(op);
    if (!done) blockedRecords.add(op.recordId);
  }
}

/** Trả về true nếu op đã xong (thành công hoặc đã được thay thế). */
async function pushOne(op: OutboxOp): Promise<boolean> {
  const record = await db.records.get(op.recordId);
  if (!record) {
    await db.outbox.delete(op.seq!);
    return true;
  }

  let res: { status: number; body: unknown };
  try {
    res = await pushRecord(
      record.id,
      {
        formId: record.formId,
        formVersion: record.formVersion,
        baseVersion: record.baseVersion,
        data: op.data,
        deleted: op.deleted,
        updatedBy: getSurveyorName(),
      },
      op.opId,
    );
  } catch (err) {
    if (err instanceof NetworkError) {
      await scheduleRetry(op, err.message);
      return false;
    }
    throw err;
  }

  if (res.status === 200 || res.status === 201) {
    await onPushed(op, res.body as ServerRecord);
    return true;
  }
  if (res.status === 409) {
    await onConflict(op, res.body as ConflictResponse);
    return true;
  }
  if (res.status >= 500 || res.status === 408 || res.status === 429) {
    await scheduleRetry(op, `HTTP ${res.status}`);
    return false;
  }
  // 4xx khác: lỗi dữ liệu, retry cũng vô ích
  await db.transaction('rw', db.outbox, db.records, async () => {
    await db.outbox.update(op.seq!, { status: 'failed', lastError: `HTTP ${res.status}` });
    await db.records.update(op.recordId, { syncState: 'error', lastError: `HTTP ${res.status}` });
  });
  return false;
}

async function scheduleRetry(op: OutboxOp, error: string) {
  await db.outbox.update(op.seq!, {
    attempts: op.attempts + 1,
    nextAttemptAt: Date.now() + nextRetryDelay(op.attempts),
    lastError: error,
  });
}

async function onPushed(op: OutboxOp, saved: ServerRecord) {
  await db.transaction('rw', db.outbox, db.records, async () => {
    await db.outbox.delete(op.seq!);
    const remaining = await db.outbox.where('recordId').equals(op.recordId).count();
    await db.records.update(op.recordId, {
      baseData: saved.data,
      baseVersion: saved.version,
      syncState: remaining === 0 ? 'synced' : 'pending',
      lastError: undefined,
    });
  });
}

/**
 * 409: gộp toàn bộ các op của bản ghi thành một, three-way merge
 *   base = record.baseData, local = record.data (mới nhất), remote = server.current.
 * Không có trường xung đột -> tự gộp và gửi lại ngay. Có -> chờ người dùng.
 */
async function onConflict(op: OutboxOp, conflict: ConflictResponse) {
  await db.transaction('rw', db.outbox, db.records, db.conflicts, async () => {
    const record = (await db.records.get(op.recordId))!;
    const remote = conflict.current;
    const merge = threeWayMerge(record.baseData, record.data, remote.data);
    const recordLevel = detectDeleteConflict(
      record.baseData,
      { data: record.data, deleted: record.deleted },
      { data: remote.data, deleted: remote.deleted },
    );

    await db.outbox.where('recordId').equals(op.recordId).delete();

    if (merge.conflicts.length === 0 && recordLevel === 'none') {
      const deleted = record.deleted || remote.deleted;
      await db.records.update(record.id, {
        data: merge.merged,
        deleted,
        baseData: remote.data,
        baseVersion: remote.version,
        syncState: 'pending',
      });
      await db.outbox.add(newOp(record.id, merge.merged, deleted));
      return;
    }

    await db.conflicts.put({
      recordId: record.id,
      detectedAt: new Date().toISOString(),
      server: remote,
      history: conflict.history,
      merge,
      recordLevel,
    });
    await db.records.update(record.id, { syncState: 'conflict' });
  });
}

/** Người dùng đã chọn giá trị cho từng trường ở màn hình conflict. */
export async function resolveConflict(recordId: string, resolved: RecordData, deleted: boolean) {
  await db.transaction('rw', db.outbox, db.records, db.conflicts, async () => {
    const c = await db.conflicts.get(recordId);
    if (!c) return;
    await db.records.update(recordId, {
      data: resolved,
      deleted,
      baseData: c.server.data,
      baseVersion: c.server.version,
      syncState: 'pending',
    });
    await db.outbox.where('recordId').equals(recordId).delete();
    await db.outbox.add(newOp(recordId, resolved, deleted));
    await db.conflicts.delete(recordId);
  });
  void syncNow();
}

function newOp(recordId: string, data: RecordData, deleted: boolean): OutboxOp {
  return {
    opId: crypto.randomUUID(),
    recordId,
    data,
    deleted,
    attempts: 0,
    nextAttemptAt: 0,
    status: 'queued',
  };
}

async function pullAll(): Promise<void> {
  let cursor = await getMeta<number>('pullCursor', 0);
  for (;;) {
    const page = await pullRecords(cursor);
    await db.transaction('rw', db.records, db.outbox, db.meta, async () => {
      for (const remote of page.records) {
        const local = await db.records.get(remote.id);
        const hasOps = (await db.outbox.where('recordId').equals(remote.id).count()) > 0;
        // Bản ghi đang có thay đổi cục bộ: để nguyên, lần push tới sẽ nhận 409 và merge
        if (local && (hasOps || local.syncState === 'conflict')) continue;
        if (local && local.baseVersion >= remote.version) continue;
        await db.records.put({
          id: remote.id,
          formId: remote.formId,
          formVersion: remote.formVersion,
          data: remote.data,
          deleted: remote.deleted,
          baseData: remote.data,
          baseVersion: remote.version,
          syncState: 'synced',
          updatedAt: remote.updatedAt,
        });
      }
      await setMeta('pullCursor', page.cursor);
    });
    if (page.cursor === cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
}
