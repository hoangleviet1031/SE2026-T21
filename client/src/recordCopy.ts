import { hasValue, validateRecord, type FormSchema, type RecordData, type Role } from '@field-survey/shared';
import type { LocalRecord } from './db/projectDb';
import { canDeleteRecord } from './projects';
import type { TypingBuffer } from './typingBuffer';

// Nhân bản phiếu ở màn hình 4 (design §4.1 "Nhân bản phiếu"; Could, cắt được). Hàm thuần, không I/O.

/**
 * Phần được chép sang bản sao, xét theo bản form mới nhất vì bản sao là phiếu tạo lúc này (ADR 0001 quy tắc 9).
 * Ảnh và vị trí gắn với lần đến thực địa nên không chép. Trường đã ẩn thì phiếu mới không hiện (§4.1). Giá trị sai
 * định dạng cũng bỏ: ô chọn sẽ hiện trống trong khi dữ liệu vẫn còn giá trị. Phiếu gốc không đổi nên không mất gì.
 */
export function copyableData(form: FormSchema, data: RecordData): RecordData {
  const picked: RecordData = {};
  for (const field of form.fields) {
    if (field.hidden || field.type === 'photo' || field.type === 'gps') continue;
    const value = data[field.id];
    if (value !== undefined && hasValue(value)) picked[field.id] = value;
  }
  const errors = validateRecord(form, picked);
  return Object.fromEntries(Object.entries(picked).filter(([id]) => errors[id] === undefined));
}

/**
 * Bản sao chỉ là bộ đệm đang nhập của một phiếu chưa có trên máy: chưa có phiếu, chưa có op cho tới khi bấm Lưu
 * (bất biến 2). `base` rỗng như phiếu mới, để bộ đệm đi đúng nhánh phiếu mới của `restorePlan`.
 */
export function copyBuffer(form: FormSchema, data: RecordData, savedAt: string): TypingBuffer {
  return {
    formId: form.id,
    formVersion: form.version,
    data: copyableData(form, data),
    base: {},
    savedAt,
    fromCopy: true,
  };
}

/**
 * Có hiện nút "Nhân bản phiếu" không. Phiếu xung đột chỉ đọc (ADR 0001 quy tắc 7). Điều tra viên không chép phiếu
 * người khác, để dữ liệu ngoài phạm vi của họ (§5.5) không lọt vào phiếu mới; luật người tạo giống nút Xoá phiếu.
 */
export function canCopyRecord(
  record: Pick<LocalRecord, 'deleted' | 'syncState' | 'createdBy'>,
  role: Role,
  myUserId: string,
): boolean {
  if (record.deleted || record.syncState === 'conflict') return false;
  return canDeleteRecord(role, myUserId, record.createdBy);
}
