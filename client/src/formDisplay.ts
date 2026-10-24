import { hasValue, type FieldDef, type FieldValue } from '@field-survey/shared';

/** Cách hiện một trường trên trang điền phiếu. */
export type FieldMode = 'edit' | 'readonly' | 'hidden';

/**
 * Trường `hidden` thay cho xoá trường (design §4.1): phiếu mới không hiện nó, nhưng phiếu đã có
 * giá trị thì vẫn hiện để không giấu dữ liệu người dùng đã nhập; chỉ đọc vì form không còn dùng trường đó.
 * Giá trị sai định dạng thì vẫn bị validateRecord báo lỗi, nên phải cho sửa, không thì phiếu kẹt ở nháp.
 */
export function fieldMode(field: FieldDef, value: FieldValue | undefined, hasError = false): FieldMode {
  if (!field.hidden) return 'edit';
  if (!hasValue(value ?? null)) return 'hidden';
  return hasError ? 'edit' : 'readonly';
}

/**
 * Bản mới nhất của mỗi form, theo thứ tự trang chủ hiện thẻ: mã form xuất hiện lần đầu ở đâu khi xếp theo
 * version thì đứng ở đó. Trang điền phiếu dùng lại để đầu trang cùng màu với thẻ của form đó.
 */
export function latestForms<T extends { id: string; version: number }>(forms: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const f of [...forms].sort((a, b) => a.version - b.version)) byId.set(f.id, f);
  return [...byId.values()];
}

/** Số màu "Dịu ấm" (1–5) của form ở vị trí `index` trên trang chủ, xoay vòng. Không có trong danh sách thì màu 1. */
export function formTone(index: number): number {
  return index < 0 ? 1 : (index % 5) + 1;
}
