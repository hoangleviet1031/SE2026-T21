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
