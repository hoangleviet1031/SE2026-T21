import type { SyncState } from './db/projectDb';

// Màn hình 4: form khoá khi nào và vì sao. Hàm thuần, không phụ thuộc React.

export type RecordLock = 'editable' | 'conflict' | 'deleted';

/**
 * Xung đột được ưu tiên hơn đã xoá: phiếu xoá vs sửa còn phải hỏi người dùng (ADR 0001 quy tắc 6).
 * Phiếu đã thấy trên máy mà biến mất là do op xoá vừa được xác nhận hoặc tab khác vừa xoá hẳn (design §5.7),
 * không được coi là phiếu mới: Lưu lúc đó sẽ ghi lại phiếu dưới id cũ. `record` khác id là bản của phiếu
 * trước, trong lúc trang đổi sang phiếu khác, nên không dùng.
 */
export function recordLock(input: {
  record: { id: string; deleted: boolean; syncState: SyncState } | undefined;
  recordId: string;
  seenRecordId: string | undefined;
  inConflict: boolean;
}): RecordLock {
  const { record, recordId, seenRecordId, inConflict } = input;
  if (inConflict || record?.syncState === 'conflict') return 'conflict';
  if (record?.id === recordId) return record.deleted ? 'deleted' : 'editable';
  return record === undefined && seenRecordId === recordId ? 'deleted' : 'editable';
}

/**
 * Lưu lên phiếu đã xoá sẽ bỏ xoá mà không hỏi, kể cả trên server vì `baseVersion` khớp (design §5.7). Bỏ xoá chỉ
 * đi qua "Khôi phục" ở màn hình xung đột, đường đó không gọi `saveRecordLocally`.
 */
export function saveWouldUndelete(existing: { deleted: boolean } | undefined, inputDeleted: boolean | undefined): boolean {
  return existing?.deleted === true && inputDeleted !== true;
}
