import type { FieldDef, FormSchema } from './types';

// Luật lưu form ở server và builder. Xem docs/design.md §4.1 ("Validate ở server khi lưu form",
// "Quy tắc đổi form an toàn"). Hàm chỉ kiểm luật; kiểu dữ liệu sai (thiếu `fields`, `type` lạ) là
// việc của nơi đọc request (400 invalid_body), không phải ở đây.

/** Mẫu cho id trường: dùng làm khoá trong `data` của phiếu và tên cột khi export. */
export const FIELD_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Mẫu cho id form: thêm được dấu `-` (vd. form mẫu `household-survey`), vì id form chỉ nằm trong
 * đường dẫn và `formId` của phiếu, không thành tên cột (design §4.1).
 */
export const FORM_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Trả danh sách lỗi tiếng Việt; mảng rỗng nghĩa là hợp lệ.
 * `prev` là phiên bản mới nhất đang có của form này (nếu có): bản mới không được làm hỏng
 * phiếu cũ, nên không xoá trường, không đổi `type`, không bỏ option.
 */
export function validateFormSchema(next: FormSchema, prev?: FormSchema): string[] {
  const errors: string[] = [];

  if (!FORM_ID_PATTERN.test(next.id)) errors.push(`Mã biểu mẫu "${next.id}" không hợp lệ (chữ cái đầu, chỉ chữ, số, _, -)`);
  if (next.title.trim() === '') errors.push('Tên biểu mẫu không được để trống');

  const seen = new Set<string>();
  for (const field of next.fields) {
    if (!FIELD_ID_PATTERN.test(field.id)) {
      errors.push(`Mã trường "${field.id}" không hợp lệ (chữ cái đầu, chỉ chữ, số, _)`);
    }
    if (seen.has(field.id)) errors.push(`Mã trường "${field.id}" bị trùng`);
    seen.add(field.id);
    errors.push(...optionErrors(field));
  }

  if (prev) errors.push(...compatibilityErrors(next, prev));
  return errors;
}

function optionErrors(field: FieldDef): string[] {
  // options ở trường không phải select thì bỏ qua (không dùng tới)
  if (field.type !== 'select' && field.type !== 'multiselect') return [];
  const options = field.options ?? [];
  if (options.length === 0) return [`Trường "${field.id}" phải có ít nhất một lựa chọn`];

  const errors: string[] = [];
  // Lựa chọn rỗng thì người điền không phân biệt được với "chưa chọn"
  if (options.some((o) => o.trim() === '')) errors.push(`Trường "${field.id}" có lựa chọn để trống`);
  const dup = options.filter((o, i) => options.indexOf(o) !== i);
  for (const o of new Set(dup)) errors.push(`Trường "${field.id}" có lựa chọn "${o}" bị trùng`);
  return errors;
}

function compatibilityErrors(next: FormSchema, prev: FormSchema): string[] {
  const errors: string[] = [];
  const byId = new Map(next.fields.map((f) => [f.id, f]));
  for (const old of prev.fields) {
    const field = byId.get(old.id);
    if (!field) {
      errors.push(`Thiếu trường "${old.id}" của phiên bản trước (muốn bỏ thì đặt ẩn)`);
      continue;
    }
    if (field.type !== old.type) {
      errors.push(`Không được đổi loại trường "${old.id}" (tạo trường mới thay vì sửa)`);
      continue;
    }
    // Option bị bỏ thì phiếu cũ chọn option đó không hiển thị được nữa
    const kept = new Set(field.options ?? []);
    for (const o of old.options ?? []) {
      if (!kept.has(o)) errors.push(`Không được bỏ lựa chọn "${o}" của trường "${old.id}"`);
    }
  }
  return errors;
}
