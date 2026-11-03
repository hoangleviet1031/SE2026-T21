import Dexie from 'dexie';
import { isQuotaError } from '../db/attachments';
import type { ProjectDb } from '../db/projectDb';
import { AuthError, NetworkError, NotMemberError, fetchAttachmentFile } from './api';
import { classifyDownload, type PhotoFetchResult } from './photoDownloadRules';

// Tải ảnh của phiếu đang mở về bảng attachments (design §5.6). Ô ảnh vẫn chỉ đọc IndexedDB qua liveQuery
// (CLAUDE.md bất biến 7); hàm này không đụng phiếu và outbox nên không tạo op.

interface PhotoRef {
  id: string;
  recordId: string;
  fieldId: string;
}

// Mở lại phiếu lúc lần tải trước chưa xong thì dùng chung một request, đỡ tốn mạng. Hai tab vẫn có thể cùng
// tải; transaction ở `saveDownloaded` bảo đảm chỉ một tab ghi.
const inFlight = new WeakMap<ProjectDb, Map<string, Promise<PhotoFetchResult>>>();

export function downloadPhoto(db: ProjectDb, photo: PhotoRef): Promise<PhotoFetchResult> {
  const running = inFlight.get(db) ?? new Map<string, Promise<PhotoFetchResult>>();
  inFlight.set(db, running);
  const existing = running.get(photo.id);
  if (existing) return existing;
  const task = fetchAndSave(db, photo).finally(() => running.delete(photo.id));
  running.set(photo.id, task);
  return task;
}

async function fetchAndSave(db: ProjectDb, photo: PhotoRef): Promise<PhotoFetchResult> {
  try {
    if (await db.attachments.get(photo.id)) return 'saved';
    if (!isShowable(await db.records.get(photo.recordId))) return 'gone';
    if (!navigator.onLine) return 'network';
    const { status, blob } = await fetchAttachmentFile(db.projectId, photo.id);
    const kind = classifyDownload(status, blob?.type);
    if (kind !== 'ok') return kind;
    // classifyDownload chỉ trả 'ok' khi có loại ảnh, tức là có blob; TypeScript không suy ra được
    if (!blob) return 'server';
    return await saveDownloaded(db, photo, blob);
  } catch (err) {
    if (err instanceof NetworkError) return 'network';
    if (err instanceof AuthError) return 'auth';
    if (err instanceof NotMemberError) return 'not_member';
    if (isQuotaError(err)) return 'storage_full';
    // Đăng xuất giữa lúc tải: CSDL đã xoá và không tự mở lại, không có gì để ghi nữa.
    if (err instanceof Error && err.name === Dexie.errnames.DatabaseClosed) return 'gone';
    throw err;
  }
}

function isShowable(record: { deleted: boolean } | undefined): boolean {
  return record !== undefined && !record.deleted;
}

/**
 * Kiểm lại ngay trong transaction vì lúc tải có thể đã đổi: phiếu bị xoá thì không ghi để khỏi có dòng mồ
 * côi; đã có dòng (ảnh `pending` của máy này, tab khác vừa tải xong) thì giữ nguyên. Ảnh vừa bị bỏ khỏi phiếu
 * thì vẫn ghi: §5.6 vốn giữ blob của ảnh đã bỏ, và form đang mở hay bộ đệm khôi phục có thể còn id này.
 *
 * `done`: hàng đợi upload và `hasUnsentData` bỏ qua. Không có `createdAt` vì máy này không chọn ảnh, trường
 * đó chỉ để xếp hàng upload; `uploadedChunks` rỗng vì máy này không gửi chunk nào.
 */
async function saveDownloaded(db: ProjectDb, photo: PhotoRef, blob: Blob): Promise<PhotoFetchResult> {
  return db.transaction('rw', db.records, db.attachments, async () => {
    if (await db.attachments.get(photo.id)) return 'saved';
    if (!isShowable(await db.records.get(photo.recordId))) return 'gone';
    await db.attachments.add({
      id: photo.id,
      recordId: photo.recordId,
      fieldId: photo.fieldId,
      blob,
      mimeType: blob.type,
      uploadedChunks: [],
      uploadState: 'done',
      attempts: 0,
    });
    return 'saved';
  });
}
