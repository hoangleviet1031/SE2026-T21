import type { RecordData } from '@field-survey/shared';

// Quy tắc thuần của hàng đợi ảnh (design §5.6, §5.7). Tách khỏi Dexie và mạng để unit test được;
// sync/attachments.ts, sync/displayState.ts và sync/membership.ts dùng chung.

/**
 * Id ảnh mà phiếu đang tham chiếu: mọi chuỗi trong các trường dạng danh sách. Trường multiselect
 * cũng là danh sách chuỗi nhưng chứa nhãn lựa chọn, không bao giờ trùng UUID của ảnh.
 */
export function referencedIds(data: RecordData): Set<string> {
  const ids = new Set<string>();
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) for (const v of value) ids.add(v);
  }
  return ids;
}

/**
 * Ảnh "còn sống": thuộc một phiếu chưa xoá và phiếu đó còn tham chiếu nó. Ảnh người dùng đã bỏ
 * khỏi trường (§5.6) hay ảnh của phiếu chưa từng lưu thì không upload và không tính là dữ liệu chưa
 * gửi: người dùng đã chủ động bỏ, blob chỉ còn chờ dọn bộ nhớ.
 */
export function isLiveAttachment(
  record: { id: string; deleted: boolean; data: RecordData } | undefined,
  attachment: { id: string; recordId: string },
): boolean {
  return (
    record !== undefined &&
    record.id === attachment.recordId &&
    !record.deleted &&
    referencedIds(record.data).has(attachment.id)
  );
}

/** Upload được khi ảnh còn sống và phiếu đã có trên server (server kiểm phiếu lúc complete). */
export function isUploadable(
  record: { id: string; deleted: boolean; baseVersion: number; data: RecordData } | undefined,
  attachment: { id: string; recordId: string },
): boolean {
  return record !== undefined && record.baseVersion > 0 && isLiveAttachment(record, attachment);
}

export type UploadErrorAction =
  | { kind: 'retry' }
  | { kind: 'resync' }
  | { kind: 'restart' }
  | { kind: 'failed'; message: string };

/**
 * Việc cần làm khi server trả lỗi (design §5.6, §7.1). `checksumFailures`: số lần đã nhận
 * `422 checksum_mismatch` cho ảnh này (server xoá chunk mỗi lần như vậy).
 */
export function classifyUploadError(status: number, code: string | undefined, checksumFailures: number): UploadErrorAction {
  if (status === 408 || status === 429 || status >= 500) return { kind: 'retry' };
  if (status === 409 && code === 'missing_chunks') return { kind: 'resync' };
  if (status === 422 && code === 'checksum_mismatch') {
    return checksumFailures === 0 ? { kind: 'restart' } : { kind: 'failed', message: 'Ảnh bị hỏng trên đường gửi' };
  }
  if (status === 413) return { kind: 'failed', message: 'Ảnh quá lớn (tối đa 10 MB)' };
  if (status === 415) return { kind: 'failed', message: 'Tệp không phải ảnh JPEG, PNG hoặc WebP' };
  return { kind: 'failed', message: `Máy chủ từ chối ảnh (mã ${status})` };
}
