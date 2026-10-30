import { threeWayMerge, valuesEqual, type FieldValue, type FormSchema, type RecordData } from '@field-survey/shared';

// Bộ đệm chữ đang gõ ở màn hình 4 (design §4.1 "Bộ đệm đang nhập", ui.md màn hình 4). Hàm thuần, không I/O;
// đọc ghi CSDL ở db/typingBuffer.ts. Bộ đệm không phải phiếu: không đổi syncState, không tạo op (bất biến 2, 3).

export interface TypingBuffer {
  formId: string;
  formVersion: number;
  /** Chữ đang gõ */
  data: RecordData;
  /** Bản phiếu lúc nạp vào form (phiếu mới là {}): gốc để gộp khi phiếu bị đổi trong lúc chưa Lưu */
  base: RecordData;
  /** Lúc ghi (ISO, giờ thiết bị), chỉ để hiện cho người dùng */
  savedAt: string;
}

/** Ô rỗng: chưa nhập, xoá trống ô số hay ô chọn (null), chuỗi rỗng, chưa chọn ảnh nào */
function isEmpty(v: FieldValue | undefined): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Bỏ các ô rỗng, để "chưa nhập" và "xoá trống" so ra bằng nhau */
export function withoutEmpty(data: RecordData): RecordData {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => !isEmpty(v)));
}

export function sameData(a: RecordData, b: RecordData): boolean {
  const x = withoutEmpty(a);
  const y = withoutEmpty(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if (!valuesEqual(x[k], y[k])) return false;
  return true;
}

/** Có gì cần giữ: chữ đang gõ khác bản đã nạp. Xoá một giá trị cũ cũng là thay đổi. */
export function needsBuffer(data: RecordData, base: RecordData): boolean {
  return !sameData(data, base);
}

/** Một trường cả bộ đệm lẫn phiếu đều đổi khác nhau: giữ bản phiếu, báo người dùng đã nhập gì */
export interface KeptField {
  field: string;
  typed: FieldValue | undefined;
}

export type RestorePlan =
  /** Bộ đệm trùng phiếu (vd. máy tắt giữa lúc Lưu và lúc xoá bộ đệm): bỏ đi, không hỏi */
  | { kind: 'same' }
  /** Phiếu đã bị xoá: không có gì để khôi phục vào */
  | { kind: 'gone' }
  | { kind: 'restore'; data: RecordData; kept: KeptField[] };

/**
 * Khôi phục bộ đệm vào phiếu hiện tại. Phiếu chưa đổi từ lúc gõ thì lấy nguyên chữ đã gõ. Phiếu đã đổi
 * (đồng bộ từ máy khác) thì gộp theo trường như ADR 0001 quy tắc 5: trường chỉ mình sửa lấy chữ đã gõ,
 * trường chỉ nơi khác sửa giữ bản mới; trường cả hai cùng sửa giữ bản mới và trả về để báo, không tự
 * chọn chữ đã gõ đè lên (bất biến 1).
 */
export function restorePlan(
  buffer: TypingBuffer,
  record: { data: RecordData; deleted: boolean } | undefined,
): RestorePlan {
  if (record?.deleted || (!record && Object.keys(withoutEmpty(buffer.base)).length > 0)) return { kind: 'gone' };
  const current = record?.data ?? {};
  if (sameData(buffer.data, current)) return { kind: 'same' };
  if (sameData(buffer.base, current)) return { kind: 'restore', data: buffer.data, kept: [] };
  const { merged, conflicts } = threeWayMerge(withoutEmpty(buffer.base), withoutEmpty(buffer.data), withoutEmpty(current));
  return { kind: 'restore', data: merged, kept: conflicts.map((c) => ({ field: c.field, typed: c.local })) };
}

/** Một dòng báo trường giữ bản mới (ui.md màn hình 4) */
export function keptFieldLine(form: FormSchema, kept: KeptField): string {
  const field = form.fields.find((f) => f.id === kept.field);
  const label = field?.label ?? kept.field;
  if (field?.type === 'photo') return `${label}: bạn đã chọn ảnh khác`;
  if (field?.type === 'gps') return `${label}: bạn đã lấy vị trí khác`;
  if (isEmpty(kept.typed)) return `${label}: bạn đã để trống`;
  const text = Array.isArray(kept.typed) ? kept.typed.join(', ') : String(kept.typed);
  return `${label}: bạn đã nhập "${text}"`;
}
