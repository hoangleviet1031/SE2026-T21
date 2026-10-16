import { parseSaveFormRequest, validateFormSchema, type FormSchema, type SaveFormRequest } from '@field-survey/shared';

// Xuất/nhập form dạng file JSON để dùng lại form ở dự án khác (design §4.1). Hàm thuần, tách khỏi
// BuilderPage để unit test được.

export const FORM_FILE_MESSAGES = {
  notJson: 'File không phải JSON',
  notForm: 'File không đúng định dạng biểu mẫu',
} as const;

export function formFileName(form: FormSchema): string {
  return `${form.id}-v${form.version}.json`;
}

/** Chỉ chép các khoá của `FormSchema`: bản ghi trong IndexedDB còn khoá nội bộ (`key`) không được lọt ra file. */
export function formFileText(form: FormSchema): string {
  const { id, version, title, fields } = form;
  return JSON.stringify({ id, version, title, fields }, null, 2);
}

export type ParsedFormFile = { ok: true; form: SaveFormRequest } | { ok: false; errors: string[] };

/**
 * Đọc file nhập: cùng cách kiểm kiểu với thân `POST P/forms`, rồi luật lưu form như một form mới
 * (không so với bản trước, vì nhập luôn tạo form mới). `version` trong file bị bỏ qua.
 */
export function parseFormFile(text: string): ParsedFormFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Lỗi cú pháp JSON là lỗi của file người dùng chọn, báo lại cho họ (design §8)
    return { ok: false, errors: [FORM_FILE_MESSAGES.notJson] };
  }
  const form = parseSaveFormRequest(json);
  if (!form) return { ok: false, errors: [FORM_FILE_MESSAGES.notForm] };
  const errors = validateFormSchema({ ...form, version: 1 });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, form };
}
