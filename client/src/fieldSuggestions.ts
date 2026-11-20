import type { FormSchema, RecordData } from '@field-survey/shared';

/** Số giá trị gợi ý tối đa mỗi trường: đủ để gõ vài chữ là lọc trúng, danh sách không quá dài trên điện thoại */
export const SUGGESTION_LIMIT = 50;

/** Phần của phiếu trên máy mà gợi ý cần đọc */
export interface SuggestionSource {
  id: string;
  data: RecordData;
  deleted: boolean;
  updatedAt: string;
}

// Bàn phím tiếng Việt khác nhau có thể gõ ra dấu dựng sẵn hoặc dấu tổ hợp: so theo NFC để không hiện hai dòng giống nhau
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
const sameKey = (s: string) => tidy(s).normalize('NFC').toLocaleLowerCase('vi');

/**
 * Gợi ý cho ô chữ ở màn hình 4 (design §4.1 "Gợi ý giá trị đã nhập"): giá trị đã nhập ở các phiếu khác cùng form
 * trên máy, ghép theo mã trường qua mọi phiên bản. Chỉ trường `text` không ẩn của bản form đang hiển thị.
 * Mới trước theo `updatedAt` (giờ máy, chỉ để hiển thị), trùng thì giữ cách viết của phiếu sửa gần nhất.
 */
export function fieldSuggestions(
  form: FormSchema,
  records: readonly SuggestionSource[],
  currentId: string,
  limit = SUGGESTION_LIMIT,
): Record<string, string[]> {
  const fieldIds = form.fields.filter((f) => f.type === 'text' && !f.hidden).map((f) => f.id);
  const result: Record<string, string[]> = {};
  if (fieldIds.length === 0) return result;
  // Phiếu đang mở: giá trị đã nằm sẵn trong ô. Phiếu đã xoá: người dùng đã bỏ, không gợi ý lại.
  const sources = records
    .filter((r) => !r.deleted && r.id !== currentId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  for (const fieldId of fieldIds) {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const r of sources) {
      if (values.length >= limit) break;
      const raw = r.data[fieldId];
      if (typeof raw !== 'string') continue;
      const value = tidy(raw);
      const key = sameKey(value);
      if (value === '' || seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
    if (values.length > 0) result[fieldId] = values;
  }
  return result;
}
