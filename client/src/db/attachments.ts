import type { ProjectDb } from './projectDb';

// Ghi ảnh vào bảng attachments của dự án (design §4.4, §5.6). Component gọi qua đây,
// không ghi thẳng db.attachments (client/CLAUDE.md).

/** IndexedDB đầy (design §8): không lưu được ảnh mới. */
export class StorageFullError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('bộ nhớ trình duyệt đã đầy', options);
    this.name = 'StorageFullError';
  }
}

/** Lỗi đầy bộ nhớ có thể tới thẳng, hoặc bị Dexie bọc trong `inner`, hoặc nằm trong `cause`. */
export function isQuotaError(e: unknown): boolean {
  let current: unknown = e;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if ((current as { name?: unknown }).name === 'QuotaExceededError') return true;
    const next = current as { inner?: unknown; cause?: unknown };
    current = next.inner ?? next.cause;
  }
  return false;
}

/** Lưu ảnh đã nén, trả id để đưa vào giá trị trường photo. Ảnh chờ upload ở vòng đồng bộ (TV3-06). */
export async function addPhoto(db: ProjectDb, input: { recordId: string; fieldId: string; blob: Blob }): Promise<string> {
  const id = crypto.randomUUID();
  try {
    await db.attachments.add({
      id,
      recordId: input.recordId,
      fieldId: input.fieldId,
      blob: input.blob,
      mimeType: input.blob.type,
      uploadedChunks: [],
      uploadState: 'pending',
      attempts: 0,
      // Hàng đợi upload cũ trước mới sau (design §5.6); giờ thiết bị chỉ dùng để xếp thứ tự trên máy.
      createdAt: Date.now(),
    });
  } catch (e) {
    if (isQuotaError(e)) throw new StorageFullError({ cause: e });
    throw e;
  }
  return id;
}
