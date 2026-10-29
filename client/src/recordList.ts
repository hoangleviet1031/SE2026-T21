import type { FormSchema } from '@field-survey/shared';
import type { LocalRecord } from './db/projectDb';
import { latestForms } from './formDisplay';

// Tiêu đề, giờ sửa và cách nhóm phiếu trên trang chủ (design §4.8). Tách khỏi HomePage để unit test được.

export const UNTITLED = 'Phiếu chưa có tên';
export const MISSING_FORM_TITLE = 'Biểu mẫu chưa có trên máy';

type FormRef = Pick<FormSchema, 'id' | 'version' | 'title' | 'fields'>;

/**
 * Giá trị trường `text` đầu tiên không ẩn, theo đúng bản form của phiếu (design §4.1: "ẩn" thuộc từng bản).
 * Máy thiếu bản đó thì lấy bản mới nhất cùng form: id trường không đổi giữa các bản nên vẫn đúng giá trị.
 */
export function recordTitle(record: Pick<LocalRecord, 'formId' | 'formVersion' | 'data'>, forms: readonly FormRef[]): string {
  const sameForm = forms.filter((f) => f.id === record.formId);
  const form = sameForm.find((f) => f.version === record.formVersion) ?? latestForms(sameForm)[0];
  const field = form?.fields.find((f) => f.type === 'text' && !f.hidden);
  const value = field ? record.data[field.id] : undefined;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : UNTITLED;
}

/**
 * Giờ sửa cuối trên dòng phiếu: hôm nay "14:32", hôm qua "hôm qua", cũ hơn "24/10", khác năm "24/10/2025"
 * (ui.md màn hình 2). Giờ máy chỉ để hiển thị, không dùng để so thứ tự (CLAUDE.md bất biến 4).
 */
export function formatEditedAt(updatedAt: string, now: Date): string {
  return editedAtFormatter(now)(updatedAt);
}

/**
 * Như formatEditedAt nhưng tính mốc ngày một lần cho cả danh sách: tạo Date theo giờ địa phương chậm,
 * 2.000 dòng mỗi dòng vài cái thì danh sách chậm gấp đôi (đo bằng test:perf, design §11.2).
 */
export function editedAtFormatter(now: Date): (updatedAt: string) => string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const pad = (n: number) => String(n).padStart(2, '0');
  const cache = new Map<string, string>();
  return (updatedAt) => {
    const hit = cache.get(updatedAt);
    if (hit !== undefined) return hit;
    const label = format(updatedAt);
    cache.set(updatedAt, label);
    return label;
  };
  function format(updatedAt: string): string {
    const at = new Date(updatedAt);
    const t = at.getTime();
    if (t >= today && t < tomorrow) return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    if (t >= yesterday && t < today) return 'hôm qua';
    const date = `${pad(at.getDate())}/${pad(at.getMonth() + 1)}`;
    return at.getFullYear() === now.getFullYear() ? date : `${date}/${at.getFullYear()}`;
  }
}

export interface RecordGroup<T> {
  /** Mã form; `null` là mục cuối gom phiếu có form không còn trên máy */
  formId: string | null;
  title: string;
  /** Vị trí thẻ form trên trang chủ, để nhóm cùng màu với thẻ; -1 với mục cuối */
  formIndex: number;
  rows: T[];
}

/**
 * Nhóm phiếu theo form, theo thứ tự thẻ form trên trang chủ; trong nhóm, phiếu sửa sau lên trước
 * (`updatedAt` cục bộ). Form không có phiếu nào không thành nhóm, nên khi lọc thì nhóm rỗng tự ẩn.
 */
export function groupRecordsByForm<T extends { r: Pick<LocalRecord, 'formId' | 'updatedAt'> }>(
  rows: readonly T[],
  forms: readonly Pick<FormSchema, 'id' | 'version' | 'title'>[],
): RecordGroup<T>[] {
  const shownForms = latestForms(forms);
  const byForm = new Map<string, T[]>();
  for (const row of rows) {
    const list = byForm.get(row.r.formId);
    if (list) list.push(row);
    else byForm.set(row.r.formId, [row]);
  }
  // So chuỗi ISO là đủ: cùng định dạng toISOString ở mọi nơi ghi updatedAt
  const newestFirst = (list: T[]) =>
    [...list].sort((a, b) => (a.r.updatedAt < b.r.updatedAt ? 1 : a.r.updatedAt > b.r.updatedAt ? -1 : 0));

  const groups: RecordGroup<T>[] = [];
  shownForms.forEach((f, i) => {
    const list = byForm.get(f.id);
    if (list) groups.push({ formId: f.id, title: f.title, formIndex: i, rows: newestFirst(list) });
    byForm.delete(f.id);
  });
  const missing = [...byForm.values()].flat();
  if (missing.length > 0) groups.push({ formId: null, title: MISSING_FORM_TITLE, formIndex: -1, rows: newestFirst(missing) });
  return groups;
}
