import type { FieldDef, FieldValue, FormSchema, ServerRecord } from '@field-survey/shared';
import type { Cell } from './csv';

// Bảng xuất CSV của một form (design §4.6). Hàm thuần: nhận mọi phiên bản form và phiếu, trả dòng
// tên cột rồi mỗi phiếu một dòng. Cách ghép URL ảnh do nơi gọi truyền vào (PUBLIC_BASE_URL, §12).

const FIXED = ['id', 'version', 'updatedAt', 'updatedBy', 'updatedByName', 'formVersion', 'deleted'] as const;

export interface ExportColumn {
  header: string;
  cell: (record: ServerRecord, photoUrl: (attachmentId: string) => string) => Cell;
}

function fixedColumn(name: (typeof FIXED)[number]): ExportColumn {
  return {
    header: name,
    // Tên người sửa rỗng (tài khoản không còn, hoặc phiếu từ trước khi server trả tên): để trống
    cell: (r) => (name === 'updatedByName' ? r.updatedByName || null : r[name]),
  };
}

function valueCell(field: FieldDef, value: FieldValue | undefined, photoUrl: (id: string) => string): Cell {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (field.type === 'photo' ? value.map(photoUrl) : value).join('; ');
  }
  if (typeof value === 'object') return JSON.stringify(value); // gps rơi vào cột thường: không xảy ra khi đúng kiểu
  return value;
}

function fieldColumns(field: FieldDef): ExportColumn[] {
  if (field.type !== 'gps') {
    return [{ header: field.id, cell: (r, photoUrl) => valueCell(field, r.data[field.id], photoUrl) }];
  }
  const part = (key: 'lat' | 'lng' | 'accuracy'): ExportColumn => ({
    header: `${field.id}_${key}`,
    cell: (r) => {
      const v = r.data[field.id];
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
      return v[key] ?? null;
    },
  });
  return [part('lat'), part('lng'), part('accuracy')];
}

/**
 * Cột: cố định, rồi trường theo thứ tự của phiên bản form mới nhất (kể cả trường `hidden`), rồi trường
 * chỉ có ở bản cũ (bản mới hơn trước), theo thứ tự trong bản đó. Đổi form không đổi `id` hay `type`
 * của trường đã có (design §4.1), nên lấy định nghĩa ở bản mới nhất có trường đó là đủ.
 */
export function exportColumns(forms: FormSchema[]): ExportColumn[] {
  const seen = new Set<string>();
  const fields: FieldDef[] = [];
  for (const form of [...forms].sort((a, b) => b.version - a.version)) {
    for (const f of form.fields) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      fields.push(f);
    }
  }
  return [...FIXED.map(fixedColumn), ...fields.flatMap(fieldColumns)];
}

export function exportTable(
  forms: FormSchema[],
  records: ServerRecord[],
  photoUrl: (attachmentId: string) => string,
): Cell[][] {
  const columns = exportColumns(forms);
  return [columns.map((c) => c.header), ...records.map((r) => columns.map((c) => c.cell(r, photoUrl)))];
}
