import {
  detectDeleteConflict,
  nextRetryDelay,
  threeWayMerge,
  type ConflictResponse,
  type MeResponse,
  type RecordData,
  type ServerRecord,
} from '@field-survey/shared';
import { accountDb, setAccountValue, type AccountProject } from '../db/accountDb';
import { getCurrentProjectId, openProjectDb } from '../db/current';
import {
  formKey,
  getMeta,
  setMeta,
  type LocalRecord,
  type OutboxOp,
  type ProjectDb,
  type SyncState,
} from '../db/projectDb';
import { NetworkError, NotMemberError, fetchFormVersion, fetchForms, fetchMe, pullRecords, pushRecord } from './api';
import { mergeMeIntoProjects, projectsToSync, pullStateAfterPage, type PullState } from './accountSync';
import { applyMembershipChanges, markRemoved } from './membership';
import { earliestCreatedAt } from './outbox';
import { uploadPendingAttachments } from './attachments';

// Sync engine: push outbox (FIFO theo từng bản ghi) rồi pull thay đổi từ server.
// Xem docs/design.md §5 và docs/adr/0001-consistency-model.md.

let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

// Một khoá cho cả thiết bị: mọi tab dùng chung IndexedDB nên chung outbox (ADR 0001, Nhiều tab).
export const SYNC_LOCK = 'field-survey-sync';

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

/**
 * Một vòng đồng bộ bắt đầu sau lúc gọi. Dùng sau khi vừa đổi thứ mà vòng đồng bộ đọc từ server
 * (vd. tự hạ vai trò, đổi tên tổ chức ở màn hình Thành viên): vòng đang chạy có thể đã đọc /me cũ,
 * syncNow sẽ chỉ gộp vào vòng đó. Lỗi của vòng cũ do nơi khởi động nó xử lý (startSyncLoop ghi log),
 * ở đây chỉ chờ nó kết thúc.
 */
export async function syncAfterChange(): Promise<void> {
  if (running) await Promise.allSettled([running]);
  return syncNow();
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
  return accountDb.transaction('rw', accountDb.projects, accountDb.account, async () => {
    const merged = mergeMeIntoProjects(await accountDb.projects.toArray(), projects);
    await accountDb.projects.bulkPut(merged);
    await setAccountValue('user', me.user);
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

// Upload ảnh của dự án (design §5.6), giữa push và pull theo §5.3: phiếu đã lên thì ảnh mới lên được.
async function uploadAttachments(db: ProjectDb): Promise<void> {
  await uploadPendingAttachments(db);
}

async function updateCounts(db: ProjectDb): Promise<void> {
  const needsAttention = await db.records.where('syncState').anyOf(NEEDS_ATTENTION).count();
  const unsynced = await db.records.where('syncState').anyOf(UNSYNCED).count();
  await accountDb.projects.update(db.projectId, { needsAttention, unsynced });
}

/** Hẹn giờ chạy lại đúng lúc op hoặc ảnh sớm nhất (trên mọi dự án) hết thời gian backoff (§5.3 bước 6) */
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
    const nextPhoto = await db.attachments
      .where('nextAttemptAt')
      .above(Date.now())
      .filter((a) => a.uploadState === 'pending' || a.uploadState === 'uploading')
      .first();
    if (nextPhoto?.nextAttemptAt !== undefined) earliest = Math.min(earliest, nextPhoto.nextAttemptAt);
  }
  if (earliest === Infinity) return;
  const delay = Math.max(0, earliest - Date.now());
  retryTimer = setTimeout(() => void syncNow().catch((e) => console.warn('sync failed', e)), delay);
}

async function syncForms(db: ProjectDb): Promise<void> {
  const forms = await fetchForms(db.projectId);
  await db.forms.bulkPut(forms.map((f) => ({ ...f, key: formKey(f.id, f.version) })));
  await fetchMissingFormVersions(db);
}

/**
 * Phiếu luôn mở bằng đúng `formVersion` của nó, mà GET forms chỉ trả bản mới nhất: phiếu pull từ
 * máy khác có thể dùng bản cũ máy này chưa từng thấy (design §5.3 bước 5, §8). Quét mọi phiếu
 * chứ không chỉ phiếu vừa pull, để trang điền phiếu chỉ cần gọi syncNow() khi thiếu bản form.
 */
async function fetchMissingFormVersions(db: ProjectDb): Promise<void> {
  const have = new Set(await db.forms.toCollection().primaryKeys());
  const missing = new Map<string, { id: string; version: number }>();
  await db.records.each((r) => {
    const key = formKey(r.formId, r.formVersion);
    if (!have.has(key)) missing.set(key, { id: r.formId, version: r.formVersion });
  });
  for (const [key, { id, version }] of missing) {
    const form = await fetchFormVersion(db.projectId, id, version);
    // Server không có bản này thì phiếu vẫn nằm trên máy, chỉ chưa mở được; không chặn vòng đồng bộ
    if (!form) {
      console.warn('server không có form', key);
      continue;
    }
    await db.forms.put({ ...form, key });
  }
}

// Server bị sửa liên tục thì mỗi lần gửi lại đều có thể nhận 409 mới; quá số lần này trong một
// vòng thì để vòng sau, tránh lặp không dừng.
const MAX_MERGES_PER_ROUND = 3;

async function pushAll(db: ProjectDb): Promise<void> {
  const ops = await db.outbox.orderBy('seq').toArray();
  // Bản ghi đã xử lý xong trong vòng này hoặc phải chờ: bỏ qua các op còn lại của nó
  const skipRecords = new Set<string>();
  for (const op of ops) {
    // Mỗi bản ghi xử lý tuần tự: op sau chỉ đi khi op trước đã xong
    if (skipRecords.has(op.recordId)) continue;
    if (op.status !== 'queued' || op.nextAttemptAt > Date.now()) {
      skipRecords.add(op.recordId);
      continue;
    }
    const result = await pushOne(db, op);
    if (result === 'done') continue;
    // 409: mọi op của bản ghi đã bị thay (các op cũ trong danh sách trên không còn), nên không đi
    // tiếp danh sách cho bản ghi này nữa.
    skipRecords.add(op.recordId);
    if (result === 'merged') await pushMerged(db, op.recordId);
  }
}

/**
 * Tự gộp được thì gửi lại ngay trong vòng này (ADR 0001 quy tắc 7, design §5.3), không chờ vòng
 * sau. Op gộp là op mới (`attempts = 0`), chưa từng dùng opId cho dữ liệu nào khác.
 */
async function pushMerged(db: ProjectDb, recordId: string): Promise<void> {
  for (let i = 0; i < MAX_MERGES_PER_ROUND; i++) {
    const op = await db.outbox.where('recordId').equals(recordId).first();
    if (!op || op.status !== 'queued' || op.nextAttemptAt > Date.now()) return;
    if ((await pushOne(db, op)) !== 'merged') return;
  }
}

/**
 * - `done`: op đã xong (thành công, hoặc phiếu không còn).
 * - `merged`: 409 và đã tự gộp thành một op mới, cần gửi lại.
 * - `conflict`: 409 có xung đột, chờ người dùng.
 * - `stop`: chưa xong (lỗi mạng, backoff, 4xx), op sau của bản ghi phải chờ.
 */
type PushResult = 'done' | 'merged' | 'conflict' | 'stop';

async function pushOne(db: ProjectDb, op: OutboxOp): Promise<PushResult> {
  const record = await db.records.get(op.recordId);
  if (!record) {
    await db.outbox.delete(op.seq!);
    return 'done';
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
      return 'stop';
    }
    throw err;
  }

  if (res.status === 200 || res.status === 201) {
    await onPushed(db, op, res.body as ServerRecord);
    return 'done';
  }
  if (res.status === 409) {
    return (await onConflict(db, op, res.body as ConflictResponse)) ? 'merged' : 'conflict';
  }
  if (res.status >= 500 || res.status === 408 || res.status === 429) {
    await scheduleRetry(db, op, `HTTP ${res.status}`);
    return 'stop';
  }
  // 403 forbidden (sai vai trò): giữ op trong outbox, không đánh dấu lỗi (bất biến 1).
  // 403 not_member và 401 đã được api.ts ném thành NotMemberError / AuthError.
  if (res.status === 403) return 'stop';
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
  return 'stop';
}

async function scheduleRetry(db: ProjectDb, op: OutboxOp, error: string) {
  await db.outbox.update(op.seq!, {
    attempts: op.attempts + 1,
    nextAttemptAt: Date.now() + nextRetryDelay(op.attempts),
    lastError: error,
  });
}

/**
 * Người tạo theo bản server. Response từ trước TV1-17 (bản xung đột đã lưu, response PUT trả lại
 * theo Idempotency-Key) không có trường này: trả rỗng để không ghi đè giá trị đang có bằng undefined.
 */
function creatorOf(remote: ServerRecord): Pick<LocalRecord, 'createdBy' | 'createdByName'> {
  return typeof remote.createdBy === 'string'
    ? { createdBy: remote.createdBy, createdByName: remote.createdByName }
    : {};
}

async function onPushed(db: ProjectDb, op: OutboxOp, saved: ServerRecord) {
  await db.transaction('rw', db.outbox, db.records, db.attachments, async () => {
    await db.outbox.delete(op.seq!);
    const remaining = await db.outbox.where('recordId').equals(op.recordId).count();
    // Op xoá đã được server xác nhận và không còn gì chờ gửi: tombstone đã nằm trên server, máy
    // không cần giữ phiếu và ảnh nữa (design §5.7). Ảnh chưa upload cũng bỏ, vì phiếu đã xoá.
    if (saved.deleted && remaining === 0) {
      await db.attachments.where('recordId').equals(op.recordId).delete();
      await db.records.delete(op.recordId);
      return;
    }
    const record = await db.records.get(op.recordId);
    await db.records.update(op.recordId, {
      ...creatorOf(saved),
      baseData: saved.data,
      baseVersion: saved.version,
      // Op vừa gửi là bản hợp lệ cũ; phiếu đã sửa thành nháp sau đó thì vẫn là nháp (TV1-05)
      syncState: record?.syncState === 'draft' ? 'draft' : remaining === 0 ? 'synced' : 'pending',
      lastError: undefined,
    });
  });
}

/**
 * 409: gộp toàn bộ các op của bản ghi thành một, three-way merge
 *   base = record.baseData, local = record.data (mới nhất), remote = server.current.
 * Không có trường xung đột -> tự gộp, trả true để gửi lại ngay. Có -> chờ người dùng, trả false.
 * Sau `resolveConflict`, base là bản server người dùng đã thấy, nên 409 lặp lại cũng đi qua đây
 * đúng quy tắc 5 (ADR 0001 quy tắc 7, ca C8).
 */
async function onConflict(db: ProjectDb, op: OutboxOp, conflict: ConflictResponse): Promise<boolean> {
  return db.transaction('rw', db.outbox, db.records, db.conflicts, async () => {
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
        ...creatorOf(remote),
        data: merge.merged,
        deleted,
        baseData: remote.data,
        baseVersion: remote.version,
        syncState: 'pending',
      });
      await db.outbox.add(newOp(record.id, merge.merged, deleted, earliestCreatedAt(replaced)));
      return true;
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
    return false;
  });
}

/**
 * Người dùng đã chọn giá trị cho từng trường ở màn hình conflict. Base mới là bản server người
 * dùng đã thấy (`conflict.server`), để nếu server đổi tiếp thì 409 kế tiếp merge với đúng base đó.
 */
export async function resolveConflict(db: ProjectDb, recordId: string, resolved: RecordData, deleted: boolean) {
  await db.transaction('rw', db.outbox, db.records, db.conflicts, async () => {
    const c = await db.conflicts.get(recordId);
    if (!c) return;
    await db.records.update(recordId, {
      ...creatorOf(c.server),
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
        // Bản ghi đang có thay đổi cục bộ (kể cả nháp chưa có op): để nguyên, lần push tới
        // sẽ nhận 409 và merge (ADR 0001 quy tắc 8)
        if (local && (hasOps || local.syncState === 'conflict' || local.syncState === 'draft')) continue;
        if (local && local.baseVersion >= remote.version) continue;
        // Tombstone của phiếu máy không có (chưa từng tải, hoặc vừa xoá xong khỏi máy sau khi op xoá
        // được xác nhận): không có gì để ẩn, không chèn lại (design §5.7)
        if (!local && remote.deleted) continue;
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
          ...creatorOf(remote),
        });
      }
      state = { cursor: page.cursor, scope: next.scope };
      await setMeta(db, 'pull', state);
    });
    if (page.cursor === cursor || page.records.length === 0) break;
  }
}
