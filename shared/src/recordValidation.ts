import type { FieldDef, FieldValue, FormSchema, GpsValue, RecordData } from './types';

// Luật validate phiếu theo loại trường. Xem docs/design.md §4.1 (bảng "Luật validate theo loại trường").
// Phiếu có lỗi vẫn lưu được, ở trạng thái nháp (§5.1); hàm này chỉ trả lỗi, không quyết trạng thái.

export const VALIDATION_MESSAGES = {
  required: 'Bắt buộc nhập',
  invalid: 'Giá trị không hợp lệ',
  number: 'Phải là số',
  option: 'Lựa chọn không có trong biểu mẫu',
  date: 'Ngày không hợp lệ',
  gps: 'Toạ độ ngoài phạm vi',
} as const;

const M = VALIDATION_MESSAGES;

/**
 * Trả lỗi theo `fieldId`; object rỗng nghĩa là hợp lệ.
 * `form` phải là đúng phiên bản `formVersion` của phiếu, vì option bị bỏ ở bản mới
 * không được làm phiếu cũ thành lỗi.
 */
export function validateRecord(form: FormSchema, data: RecordData): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of form.fields) {
    const error = validateField(field, data[field.id] ?? null);
    if (error) errors[field.id] = error;
  }
  return errors;
}

function validateField(field: FieldDef, value: FieldValue): string | undefined {
  if (!hasValue(value)) {
    // Trường ẩn không hiện khi nhập nên không thể bắt người dùng điền
    return field.required && !field.hidden ? M.required : undefined;
  }
  // Trường ẩn hay không bắt buộc mà có giá trị thì vẫn phải đúng định dạng
  return checkFormat(field, value);
}

/** "Có giá trị" cho luật required, chung cho mọi loại; sai kiểu thì coi là có để báo lỗi định dạng. */
function hasValue(value: FieldValue): boolean {
  if (value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function checkFormat(field: FieldDef, value: FieldValue): string | undefined {
  const options = field.options ?? [];
  switch (field.type) {
    case 'text':
      return typeof value === 'string' ? undefined : M.invalid;
    case 'number':
      if (typeof value !== 'number') return M.invalid;
      return Number.isFinite(value) ? undefined : M.number;
    case 'select':
      if (typeof value !== 'string') return M.invalid;
      return options.includes(value) ? undefined : M.option;
    case 'multiselect':
      if (!isStringArray(value)) return M.invalid;
      return value.every((v) => options.includes(v)) ? undefined : M.option;
    case 'date':
      if (typeof value !== 'string') return M.invalid;
      return isValidDate(value) ? undefined : M.date;
    case 'gps':
      if (!isGps(value)) return M.invalid;
      return Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180 ? undefined : M.gps;
    case 'photo':
      return isStringArray(value) ? undefined : M.invalid;
  }
}

function isStringArray(value: FieldValue): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isGps(value: FieldValue): value is GpsValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.lat === 'number' &&
    typeof value.lng === 'number'
  );
}

/** `YYYY-MM-DD` và ngày phải tồn tại (2026-02-30 sai). Dùng UTC để không phụ thuộc múi giờ máy. */
function isValidDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
