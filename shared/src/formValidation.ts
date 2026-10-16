import type { FieldDef, FieldType, FormSchema, SaveFormRequest } from './types';

// Luật lưu form ở server và builder. Xem docs/design.md §4.1 ("Validate ở server khi lưu form",
// "Quy tắc đổi form an toàn"). `validateFormSchema` chỉ kiểm luật; kiểu dữ liệu sai (thiếu `fields`,
// `type` lạ) do `parseSaveFormRequest` cuối file kiểm, dùng chung cho thân request ở server và file
// nhập form ở builder.

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

const FIELD_TYPES: readonly FieldType[] = ['text', 'number', 'select', 'multiselect', 'date', 'photo', 'gps'];

const isOptional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const isBoolean = (v: unknown) => typeof v === 'boolean';
const isStringArray = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Kiểm kiểu thân request lưu form (hoặc file nhập form ở builder) và chỉ giữ các khoá đã biết,
 * để form lưu vào DB đúng `FormSchema`. Sai kiểu → `undefined` (server trả `invalid_body`);
 * luật nội dung (id trùng, option...) để `validateFormSchema` báo. `version` (nếu có) bị bỏ qua:
 * server tự đặt.
 */
export function parseSaveFormRequest(body: unknown): SaveFormRequest | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || typeof b.title !== 'string' || !Array.isArray(b.fields)) return undefined;

  const fields: FieldDef[] = [];
  for (const raw of b.fields as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const f = raw as Record<string, unknown>;
    const type = FIELD_TYPES.find((t) => t === f.type);
    if (
      typeof f.id !== 'string' ||
      !type ||
      typeof f.label !== 'string' ||
      !isOptional(f.required, isBoolean) ||
      !isOptional(f.hidden, isBoolean) ||
      !isOptional(f.options, isStringArray)
    ) {
      return undefined;
    }
    fields.push({
      id: f.id,
      type,
      label: f.label,
      ...(f.required !== undefined && { required: f.required as boolean }),
      ...(f.options !== undefined && { options: f.options as string[] }),
      ...(f.hidden !== undefined && { hidden: f.hidden as boolean }),
    });
  }
  return { id: b.id, title: b.title, fields };
}
