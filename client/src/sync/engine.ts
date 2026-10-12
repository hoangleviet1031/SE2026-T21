import {
  detectDeleteConflict,
  nextRetryDelay,
  threeWayMerge,
  type ConflictResponse,
  type MeResponse,
  type RecordData,
  type ServerRecord,
} from '@field-survey/shared';
import { accountDb, type AccountProject } from '../db/accountDb';
import { getCurrentProjectId, openProjectDb } from '../db/current';
import { formKey, getMeta, setMeta, type OutboxOp, type ProjectDb, type SyncState } from '../db/projectDb';
import { NetworkError, NotMemberError, fetchForms, fetchMe, pullRecords, pushRecord } from './api';
import { mergeMeIntoProjects, projectsToSync, pullStateAfterPage, type PullState } from './accountSync';
import { applyMembershipChanges, markRemoved } from './membership';
import { earliestCreatedAt } from './outbox';

// Sync engine: push outbox (FIFO theo từng bản ghi) rồi pull thay đổi từ server.
// Xem docs/design.md §5 và docs/adr/0001-consistency-model.md.

let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

// Một khoá cho cả thiết bị: mọi tab dùng chung IndexedDB nên chung outbox (ADR 0001, Nhiều tab).
const SYNC_LOCK = 'field-survey-sync';

// Số đếm cho bộ chọn dự án (design §4.7): cần người dùng làm gì đó / chưa lên server.
const NEEDS_ATTENTION: SyncState[] = ['conflict', 'error'];
const UNSYNCED: SyncState[] = ['pending', 'draft'];

/** Gọi bất cứ lúc nào; các lần gọi chồng nhau trong cùng tab được gộp làm một. */
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
  // Tab không lấy được khoá thì bỏ lượt này: tab đang giữ khoá sẽ gửi, và tab này vẫn thấy kết
  // quả qua liveQuery (design §5.3). Trình duyệt chưa có Web Locks thì chạy luôn; gửi trùng vẫn
  // an toàn nhờ idempotency key.
  if (!('locks' in navigator)) return syncAllProjects();
  await navigator.locks.request(SYNC_LOCK, { ifAvailable: true }, async (lock) => {
    if (lock) await syncAllProjects();
  });
}

async function syncAllProjects(): Promise<void> {
  if (!navigator.onLine) return;
  const projects = await refreshProjects();
  await applyMembershipChanges(projects);
  const dbs = projectsToSync(projects, await getCurrentProjectId()).map(openProjectDb);
  try {
    for (const db of dbs) {
      try {
        await syncProject(db);
      } catch (err) {
        if (!(err instanceof NotMemberError)) throw err;
        // Bị rút giữa hai lần gọi /me: ngừng gửi cho dự án này, giữ nguyên dữ liệu; vòng sau
        // applyMembershipChanges xử lý như dự án bị rút (ADR 0002 §6).
        await markRemoved(db.projectId);
      }
    }
  } finally {
    await scheduleNextRetry(dbs);
  }
}

/**
 * Lấy danh sách dự án mới từ /me và lưu vào CSDL account. Mất mạng giữa chừng thì dùng bản đã
 * lưu (design §5.3). 401 thì api.ts ném AuthError, vòng đồng bộ dừng.
 */
async function refreshProjects(): Promise<AccountProject[]> {
  let me: MeResponse;
  try {
    me = await fetchMe();
  } catch (err) {
    if (err instanceof NetworkError) return accountDb.projects.toArray();
    throw err;
  }
  const projects = me.projects;
  return accountDb.transaction('rw', accountDb.projects, async () => {
    const merged = mergeMeIntoProjects(await accountDb.projects.toArray(), projects);
    await accountDb.projects.bulkPut(merged);
    return merged;
  });
}

async function syncProject(db: ProjectDb): Promise<void> {
  // Push trước: dữ liệu người dùng quan trọng hơn danh sách form
  await pushAll(db);
  await uploadAttachments(db);
  await pullAll(db);
  await syncForms(db);
  await updateCounts(db);
}

// TODO(TV3-06): upload ảnh của dự án (design §5.6). Đặt giữa push và pull theo §5.3.
async function uploadAttachments(_db: ProjectDb): Promise<void> {}

async function updateCounts(db: ProjectDb): Promise<void> {
  const needsAttention = await db.records.where('syncState').anyOf(NEEDS_ATTENTION).count();
  const unsynced = await db.records.where('syncState').anyOf(UNSYNCED).count();
  await accountDb.projects.update(db.projectId, { needsAttention, unsynced });
}

/** Hẹn giờ chạy lại đúng lúc op sớm nhất (trên mọi dự án) hết thời gian backoff */
async function scheduleNextRetry(dbs: ProjectDb[]) {
  clearTimeout(retryTimer);
  // Offline thì chờ sự kiện 'online'; chỉ hẹn giờ cho op đang trong thời gian backoff
  if (!navigator.onLine) return;
  let earliest = Infinity;
  for (const db of dbs) {
    const next = await db.outbox
      .where('nextAttemptAt')
      .above(Date.now())
      .filter((op) => op.status === 'queued')
      .first();
    if (next) earliest = Math.min(earliest, next.nextAttemptAt);
  }
  if (earliest === Infinity) return;
  const delay = Math.max(0, earliest - Date.now());
  retryTimer = setTimeout(() => void syncNow().catch((e) => console.warn('sync failed', e)), delay);
}

async function syncForms(db: ProjectDb): Promise<void> {
  const forms = await fetchForms(db.projectId);
  await db.forms.bulkPut(forms.map((f) => ({ ...f, key: formKey(f.id, f.version) })));
}

async function pushAll(db: ProjectDb): Promise<void> {
  const ops = await db.outbox.orderBy('seq').toArray();
  const blockedRecords = new Set<string>();
  for (const op of ops) {
    // Mỗi bản ghi xử lý tuần tự: op sau chỉ đi khi op trước đã xong
    if (blockedRecords.has(op.recordId)) continue;
    if (op.status !== 'queued' || op.nextAttemptAt > Date.now()) {
      blockedRecords.add(op.recordId);
      continue;
    }
    const done = await pushOne(db, op);
    if (!done) blockedRecords.add(op.recordId);
  }
}

/** Trả về true nếu op đã xong (thành công hoặc đã được thay thế). */
async function pushOne(db: ProjectDb, op: OutboxOp): Promise<boolean> {
  const record = await db.records.get(op.recordId);
  if (!record) {
    await db.outbox.delete(op.seq!);
    return true;
  }

  let res: { status: number; body: unknown };
  try {
    res = await pushRecord(
      db.projectId,
      record.id,
      {
        formId: record.formId,
        formVersion: record.formVersion,
        baseVersion: record.baseVersion,
        data: op.data,
        deleted: op.deleted,
      },
      op.opId,
    );
  } catch (err) {
    if (err instanceof NetworkError) {
      await scheduleRetry(db, op, err.message);
      return false;
    }
    throw err;
  }

  if (res.status === 200 || res.status === 201) {
    await onPushed(db, op, res.body as ServerRecord);
    return true;
  }
  if (res.status === 409) {
    await onConflict(db, op, res.body as ConflictResponse);
    return true;
  }
  if (res.status >= 500 || res.status === 408 || res.status === 429) {
    await scheduleRetry(db, op, `HTTP ${res.status}`);
    return false;
  }
  // 403 forbidden (sai vai trò): giữ op trong outbox, không đánh dấu lỗi (bất biến 1).
  // 403 not_member và 401 đã được api.ts ném thành NotMemberError / AuthError.
  if (res.status === 403) return false;
  // 4xx khác: lỗi dữ liệu, tự retry cũng vô ích; chờ người dùng sửa hoặc bấm "Thử lại".
  // Tính là một lần gửi (attempts + 1): op đã tới server thì không được gộp dữ liệu mới vào nữa.
  await db.transaction('rw', db.outbox, db.records, async () => {
    await db.outbox.update(op.seq!, {
      status: 'failed',
      attempts: op.attempts + 1,
      lastError: `HTTP ${res.status}`,
    });
    await db.records.update(op.recordId, { syncState: 'error', lastError: `HTTP ${res.status}` });
  });
  return false;
}

async function scheduleRetry(db: ProjectDb, op: OutboxOp, error: string) {
  await db.outbox.update(op.seq!, {
    attempts: op.attempts + 1,
    nextAttemptAt: Date.now() + nextRetryDelay(op.attempts),
    lastError: error,
  });
}

async function onPushed(db: ProjectDb, op: OutboxOp, saved: ServerRecord) {
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
async function onConflict(db: ProjectDb, op: OutboxOp, conflict: ConflictResponse) {
  await db.transaction('rw', db.outbox, db.records, db.conflicts, async () => {
    const record = (await db.records.get(op.recordId))!;
    const remote = conflict.current;
    const merge = threeWayMerge(record.baseData, record.data, remote.data);
    const recordLevel = detectDeleteConflict(
      record.baseData,
      { data: record.data, deleted: record.deleted },
      { data: remote.data, deleted: remote.deleted },
    );

    const replaced = await db.outbox.where('recordId').equals(op.recordId).toArray();
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
      await db.outbox.add(newOp(record.id, merge.merged, deleted, earliestCreatedAt(replaced)));
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
export async function resolveConflict(db: ProjectDb, recordId: string, resolved: RecordData, deleted: boolean) {
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

/** Op mới với opId mới. `createdAt` giữ mốc của op bị thay để cảnh báo tồn lâu không bị đặt lại. */
function newOp(recordId: string, data: RecordData, deleted: boolean, createdAt = Date.now()): OutboxOp {
  return {
    opId: crypto.randomUUID(),
    recordId,
    data,
    deleted,
    attempts: 0,
    nextAttemptAt: 0,
    status: 'queued',
    createdAt,
  };
}

async function pullAll(db: ProjectDb): Promise<void> {
  let state = await getMeta<PullState>(db, 'pull', { cursor: 0, scope: null });
  for (;;) {
    const cursor = state.cursor;
    const page = await pullRecords(db.projectId, cursor);
    const next = pullStateAfterPage(state, page.scope);
    if (next.restart) {
      // Phạm vi rộng ra: phiếu người khác có seq nhỏ hơn cursor cũ, phải pull lại từ 0 (§5.5)
      state = { cursor: 0, scope: next.scope };
      await setMeta(db, 'pull', state);
      continue;
    }
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
      state = { cursor: page.cursor, scope: next.scope };
      await setMeta(db, 'pull', state);
    });
    if (page.cursor === cursor || page.records.length === 0) break;
  }
}
