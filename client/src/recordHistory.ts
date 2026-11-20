import { valuesEqual, type FieldDef, type FieldValue, type FormSchema, type RecordHistoryEntry } from '@field-survey/shared';
import { formatValue } from './conflictView';
import { isEmpty } from './typingBuffer';

// Lịch sử sửa của phiếu ở màn hình 4 (design §4.1 "Lịch sử sửa", ui.md màn hình 4). Hàm thuần để unit test;
// gọi API ở components/RecordHistory.tsx.

export type HistoryKind = 'created' | 'edited' | 'deleted' | 'restored';

export interface HistoryItemView {
  version: number;
  /** Tên người sửa; tên rỗng (server không tìm thấy tài khoản) thì là userId như màn hình xung đột */
  who: string;
  /** ISO do server gán (bất biến 4), chỉ để hiển thị */
  at: string;
  kind: HistoryKind;
  /** Mỗi trường đổi một dòng, vd. "Tên chủ hộ: An → Bình". Rỗng với tạo phiếu và xoá phiếu */
  changes: string[];
}

export const KIND_LABEL: Record<HistoryKind, string> = {
  created: 'tạo phiếu',
  edited: 'sửa',
  deleted: 'xoá phiếu',
  restored: 'khôi phục phiếu',
};

/** "Chưa nhập" và "xoá trống" là như nhau, để không báo đổi khi chỉ khác cách lưu ô rỗng */
function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  return valuesEqual(a, b);
}

/**
 * Lịch sử không ghi `formVersion`, nên nhãn lấy theo bản form của phiếu; trường không có ở bản đó thì
 * lấy ở bản khác trên máy (mới trước), không có ở đâu thì hiện mã trường.
 */
function findField(form: FormSchema | undefined, forms: readonly FormSchema[], id: string): FieldDef | undefined {
  const own = form?.fields.find((f) => f.id === id);
  if (own) return own;
  const others = [...forms].sort((a, b) => b.version - a.version);
  for (const f of others) {
    const def = f.fields.find((x) => x.id === id);
    if (def) return def;
  }
  return undefined;
}

function changeLine(def: FieldDef | undefined, id: string, before: FieldValue | undefined, after: FieldValue | undefined) {
  const label = def ? `${def.label}${def.hidden ? ' (đã ẩn)' : ''}` : id;
  const type = def?.type;
  // Ảnh chỉ hiện số lượng (như màn hình xung đột); cùng số mà khác ảnh thì "N ảnh → N ảnh" khó hiểu
  if (type === 'photo' && Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    return `${label}: đã thay ảnh (${formatValue(type, after)})`;
  }
  return `${label}: ${formatValue(type, before)} → ${formatValue(type, after)}`;
}

/**
 * `entries` cũ tới mới như server trả. Kết quả mới trước. `form`: bản form của phiếu đang mở;
 * `forms`: mọi bản của form đó trên máy.
 */
export function buildHistoryView(
  entries: readonly RecordHistoryEntry[],
  form: FormSchema | undefined,
  forms: readonly FormSchema[],
): HistoryItemView[] {
  const items = entries.map((e, i): HistoryItemView => {
    const prev = i > 0 ? entries[i - 1] : undefined;
    const base = { version: e.version, who: e.updatedByName || e.updatedBy, at: e.updatedAt };
    // Bản đầu không có gì để so; bản v1 chỉ ghi "tạo phiếu", không liệt kê giá trị (A chốt 2026-11-13)
    if (!prev) return { ...base, kind: 'created', changes: [] };
    if (e.deleted) return { ...base, kind: 'deleted', changes: [] };
    const keys = [...new Set([...Object.keys(prev.data), ...Object.keys(e.data)])];
    const order = (k: string) => {
      const n = form?.fields.findIndex((f) => f.id === k) ?? -1;
      return n < 0 ? Number.MAX_SAFE_INTEGER : n;
    };
    keys.sort((a, b) => order(a) - order(b));
    const changes = keys
      .filter((k) => !sameValue(prev.data[k], e.data[k]))
      .map((k) => changeLine(findField(form, forms, k), k, prev.data[k], e.data[k]));
    return { ...base, kind: prev.deleted ? 'restored' : 'edited', changes };
  });
  return items.reverse();
}

/** Giờ như màn hình xung đột ("14:32 13/11"), theo múi giờ của máy */
export function formatHistoryTime(at: string): string {
  return new Date(at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}
