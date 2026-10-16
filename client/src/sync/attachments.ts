import { nextRetryDelay } from '@field-survey/shared';
import type { LocalAttachment, ProjectDb } from '../db/projectDb';
import { NetworkError, completeAttachment, fetchAttachmentStatus, putAttachmentChunk, type AttachmentResult } from './api';
import { classifyUploadError, isUploadable } from './attachmentRules';
import { saveRecordLocally } from './outbox';

// Hàng đợi upload ảnh (design §5.6): chính bảng attachments, không dùng outbox. Chạy trong vòng
// đồng bộ sau bước push phiếu (§5.3 bước 3), mỗi lần một ảnh, cũ trước mới sau.

/** Kích thước chunk theo server (design §4.4, server/src/uploads.ts MAX_CHUNK_BYTES). */
export const CHUNK_BYTES = 256 * 1024;

/** Tối đa số lượt trong một vòng cho một ảnh: gửi bù sau 409 hoặc gửi lại từ đầu sau 422 lần đầu. */
const MAX_PASSES = 3;

const totalChunks = (blob: Blob) => Math.max(1, Math.ceil(blob.size / CHUNK_BYTES));

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function uploadPendingAttachments(db: ProjectDb): Promise<void> {
  const now = Date.now();
  const queue = (await db.attachments.where('uploadState').anyOf('pending', 'uploading').toArray())
    .filter((a) => (a.nextAttemptAt ?? 0) <= now)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  for (const attachment of queue) {
    if (!navigator.onLine) return;
    const record = await db.records.get(attachment.recordId);
    // Phiếu chưa lên server: để vòng sau, sau khi push xong. Ảnh đã bỏ khỏi phiếu hay phiếu đã xoá: bỏ qua.
    if (!record || !isUploadable(record, attachment)) continue;
    await uploadOne(db, attachment, record.id);
  }
}

type PassResult = { ok: true } | ({ ok: false } & AttachmentResult);

/** Một lượt: hỏi chunk đã có, gửi phần thiếu, rồi complete. Dừng ở response lỗi đầu tiên. */
async function uploadPass(db: ProjectDb, a: LocalAttachment, recordId: string): Promise<PassResult> {
  const status = await fetchAttachmentStatus(db.projectId, a.id);
  if (!status.received) return { ok: false, status: status.status, code: status.code };
  const received = new Set(status.received);
  await db.attachments.update(a.id, { uploadedChunks: [...received] });

  const total = totalChunks(a.blob);
  for (let i = 0; i < total; i++) {
    if (received.has(i)) continue;
    const res = await putAttachmentChunk(db.projectId, a.id, i, a.blob.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
    if (res.status !== 200 && res.status !== 201) return { ok: false, ...res };
    received.add(i);
    await db.attachments.update(a.id, { uploadedChunks: [...received] });
  }

  const done = await completeAttachment(db.projectId, a.id, {
    recordId,
    totalChunks: total,
    mimeType: a.mimeType,
    sha256: await sha256Hex(a.blob),
  });
  if (done.status === 200 || done.status === 201) return { ok: true };
  return { ok: false, ...done };
}

async function scheduleRetry(db: ProjectDb, a: LocalAttachment) {
  const attempts = (a.attempts ?? 0) + 1;
  await db.attachments.update(a.id, { uploadState: 'pending', attempts, nextAttemptAt: Date.now() + nextRetryDelay(attempts) });
}

async function uploadOne(db: ProjectDb, a: LocalAttachment, recordId: string): Promise<void> {
  await db.attachments.update(a.id, { uploadState: 'uploading' });
  let checksumFailures = a.checksumFailures ?? 0;
  try {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const result = await uploadPass(db, a, recordId);
      if (result.ok) {
        await db.attachments.update(a.id, {
          uploadState: 'done',
          uploadedChunks: Array.from({ length: totalChunks(a.blob) }, (_, i) => i),
          attempts: 0,
          nextAttemptAt: undefined,
          lastError: undefined,
        });
        return;
      }
      const action = classifyUploadError(result.status, result.code, checksumFailures);
      if (action.kind === 'retry') return void (await scheduleRetry(db, a));
      if (action.kind === 'failed') {
        await db.attachments.update(a.id, { uploadState: 'failed', lastError: action.message, checksumFailures });
        return;
      }
      if (action.kind === 'restart') {
        // Server đã xoá chunk khi sai hash: lượt sau gửi lại toàn bộ.
        checksumFailures++;
        await db.attachments.update(a.id, { checksumFailures, uploadedChunks: [] });
      }
      // resync: lượt sau hỏi lại status và gửi bù chunk thiếu.
    }
    // Vẫn chưa xong sau MAX_PASSES lượt: để backoff thay vì lặp mãi trong một vòng.
    await scheduleRetry(db, a);
  } catch (err) {
    if (err instanceof NetworkError) return void (await scheduleRetry(db, a));
    // 401, 403 not_member, lỗi lập trình: trả ảnh về hàng đợi rồi để engine xử lý như với phiếu.
    await db.attachments.update(a.id, { uploadState: 'pending' });
    throw err;
  }
}

/** "Thử lại" cho ảnh lỗi: về hàng đợi như ảnh mới. Nơi gọi tự gọi syncNow(). */
export async function retryAttachment(db: ProjectDb, id: string): Promise<void> {
  await db.attachments.update(id, {
    uploadState: 'pending',
    attempts: 0,
    checksumFailures: 0,
    nextAttemptAt: 0,
    lastError: undefined,
    uploadedChunks: [],
  });
}

/**
 * "Bỏ ảnh này": bỏ id khỏi mọi trường của phiếu, lưu qua saveRecordLocally để có op mới (CLAUDE.md
 * bất biến 2). Blob giữ trên máy tới khi người dùng dọn bộ nhớ (§5.6). Phiếu đang xung đột thì
 * saveRecordLocally ném RecordInConflictError; màn hình không hiện nút cho phiếu đó.
 */
export async function dropAttachment(db: ProjectDb, recordId: string, attachmentId: string): Promise<void> {
  const record = await db.records.get(recordId);
  if (!record) return;
  const data = Object.fromEntries(
    Object.entries(record.data).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x) => x !== attachmentId) : v]),
  );
  await saveRecordLocally(db, { id: record.id, formId: record.formId, formVersion: record.formVersion, data });
}
