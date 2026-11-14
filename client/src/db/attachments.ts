import { NO_PHOTOS, addTotals, sumPhotos, type PhotoTotals } from '../photoCleanup';
import { accountDb } from './accountDb';
import { openProjectDb, projectDbExists } from './current';
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

// Dọn ảnh đã tải lên (design §5.6 "Dọn ảnh trên máy", nút ở Cài đặt). Chỉ ảnh `done`: server đã có file, nên
// xoá trên máy không mất gì. Ảnh `pending`, `uploading`, `failed` không bao giờ bị đụng, kể cả ảnh không còn
// phiếu nào tham chiếu: ảnh vừa chọn ở form đang mở chưa bấm Lưu cũng ở dạng đó (CLAUDE.md bất biến 1).

const uploadedPhotos = (db: ProjectDb) => db.attachments.where('uploadState').equals('done');

/** Số ảnh server đã có còn nằm trên máy và dung lượng blob của chúng. */
export async function uploadedPhotoStats(db: ProjectDb): Promise<PhotoTotals> {
  return sumPhotos(await uploadedPhotos(db).toArray());
}

/**
 * Xoá cả dòng chứ không chỉ blob: không còn dòng thì ô ảnh coi như "máy chưa có blob" và tự tải lại khi mở
 * phiếu (sync/photoDownload.ts), nhãn phiếu và khoá Đăng xuất không đổi vì chúng chỉ xét dòng chưa `done`.
 * Một transaction chỉ trên `attachments`: không đụng phiếu, không tạo op. Không cần khoá vòng đồng bộ, vì ảnh
 * đang gửi chưa `done` nên không nằm trong tập bị xoá. Trả số thật đã xoá, có thể khác số lúc hỏi xác nhận.
 */
export async function deleteUploadedPhotos(db: ProjectDb): Promise<PhotoTotals> {
  return db.transaction('rw', db.attachments, async () => {
    const rows = await uploadedPhotos(db).toArray();
    await db.attachments.bulkDelete(rows.map((row) => row.id));
    return sumPhotos(rows);
  });
}

/**
 * CSDL của các tổ chức đang tham gia có trên máy. Bỏ tổ chức đã rời (`removed`): ảnh ở đó không tải lại được
 * nữa, và CSDL ấy chỉ còn chờ người dùng xuất dữ liệu chưa gửi. Chỉ mở CSDL đã tồn tại để không tạo CSDL rỗng.
 */
async function activeProjectDbs(): Promise<ProjectDb[]> {
  const dbs: ProjectDb[] = [];
  for (const p of await accountDb.projects.toArray()) {
    if (p.status === 'active' && (await projectDbExists(p.id))) dbs.push(openProjectDb(p.id));
  }
  return dbs;
}

/** Tổng trên mọi tổ chức đang tham gia: dòng "Đã dùng" ở Cài đặt cũng là của cả máy. */
export async function uploadedPhotoStatsOnDevice(): Promise<PhotoTotals> {
  let totals = NO_PHOTOS;
  for (const db of await activeProjectDbs()) totals = addTotals(totals, await uploadedPhotoStats(db));
  return totals;
}

/**
 * Dọn từng tổ chức, mỗi tổ chức một transaction. Một tổ chức lỗi thì vẫn dọn các tổ chức còn lại và báo
 * `failed`, kèm số thật đã dọn: màn hình hiện cả hai, không báo "đã dọn" sai số (design §8).
 */
export async function deleteUploadedPhotosOnDevice(): Promise<{ cleaned: PhotoTotals; failed: boolean }> {
  let cleaned = NO_PHOTOS;
  let failed = false;
  for (const db of await activeProjectDbs()) {
    try {
      cleaned = addTotals(cleaned, await deleteUploadedPhotos(db));
    } catch (e) {
      console.warn('không dọn được ảnh của tổ chức', db.projectId, e);
      failed = true;
    }
  }
  return { cleaned, failed };
}
