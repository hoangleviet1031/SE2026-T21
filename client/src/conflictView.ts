import type { FieldType, FieldValue, FormSchema, MergeResult, RecordData, RecordLevelConflict } from '@field-survey/shared';

// Dữ liệu cho màn hình xung đột (design §4.5, ui.md màn hình 3), tách khỏi React để unit test được.

/** Bên người dùng chọn cho một trường xung đột. `both` chỉ có ở multiselect và ảnh. */
export type Choice = 'local' | 'remote' | 'both';

export interface ConflictFieldView {
  id: string;
  label: string;
  type: FieldType | undefined;
  base: string;
  local: string;
  remote: string;
  /** "Gộp cả hai" (multiselect, ảnh); undefined với loại trường khác */
  union: string | undefined;
}

export interface AutoMergedView {
  id: string;
  label: string;
  source: string;
  value: string;
}

const SOURCE_LABEL = { local: 'lấy bản của bạn', remote: 'lấy bản trên máy chủ', both: 'hai bên giống nhau' } as const;

const canUnion = (type: FieldType | undefined) => type === 'multiselect' || type === 'photo';

export function formatValue(type: FieldType | undefined, value: FieldValue | undefined): string {
  // Ảnh chỉ hiện số lượng; so sánh thumbnail để sau MVP (design §4.5).
  if (type === 'photo') {
    const n = Array.isArray(value) ? value.length : 0;
    return n === 0 ? 'Không có ảnh' : `${n} ảnh`;
  }
  if (value == null || value === '') return '(trống)';
  if (Array.isArray(value)) return value.length === 0 ? '(trống)' : value.join('; ');
  if (typeof value === 'object') return `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`;
  return String(value);
}

/** Hợp hai tập, giữ thứ tự bên mình trước rồi phần mới của máy chủ. */
function union(local: FieldValue | undefined, remote: FieldValue | undefined): string[] {
  const a = Array.isArray(local) ? local : [];
  const b = Array.isArray(remote) ? remote : [];
  return [...a, ...b.filter((x) => !a.includes(x))];
}

function fieldInfo(form: FormSchema | undefined, id: string) {
  const def = form?.fields.find((f) => f.id === id);
  // Form của phiếu chưa có trên máy, hoặc trường đã bị bỏ khỏi form: vẫn hiện được bằng id.
  return { label: def?.label ?? id, type: def?.type };
}

export function buildConflictView(
  merge: MergeResult,
  form: FormSchema | undefined,
): { fields: ConflictFieldView[]; auto: AutoMergedView[] } {
  const fields = merge.conflicts.map((c): ConflictFieldView => {
    const { label, type } = fieldInfo(form, c.field);
    return {
      id: c.field,
      label,
      type,
      base: formatValue(type, c.base),
      local: formatValue(type, c.local),
      remote: formatValue(type, c.remote),
      union: canUnion(type) ? formatValue(type, union(c.local, c.remote)) : undefined,
    };
  });
  const auto = merge.autoResolved.map((a): AutoMergedView => {
    const { label, type } = fieldInfo(form, a.field);
    return { id: a.field, label, source: SOURCE_LABEL[a.takenFrom], value: formatValue(type, merge.merged[a.field]) };
  });
  return { fields, auto };
}

/**
 * Bản dữ liệu sau khi người dùng chọn: bản gộp tự động cộng lựa chọn từng trường xung đột.
 * Thiếu lựa chọn là lỗi lập trình: nút Áp dụng phải khoá tới khi chọn hết (ADR 0001 quy tắc 7).
 */
export function resolveChoices(merge: MergeResult, form: FormSchema | undefined, choices: Record<string, Choice>): RecordData {
  const resolved: RecordData = { ...merge.merged };
  for (const c of merge.conflicts) {
    const choice = choices[c.field];
    if (!choice) throw new Error(`chưa chọn giá trị cho trường ${c.field}`);
    const value =
      choice === 'both' && canUnion(fieldInfo(form, c.field).type)
        ? union(c.local, c.remote)
        : choice === 'remote'
          ? c.remote
          : c.local;
    if (value === undefined) delete resolved[c.field];
    else resolved[c.field] = value;
  }
  return resolved;
}

// ---- Xoá vs sửa (design §4.5, ADR 0001 quy tắc 6). Không có lựa chọn mặc định. ----

export type DeleteConflict = Exclude<RecordLevelConflict, 'none'>;
/** `keep`: phiếu còn (Giữ phiếu / Khôi phục); `delete`: phiếu bị xoá (Vẫn xoá / Bỏ). */
export type RecordLevelChoice = 'keep' | 'delete';

/** Câu hỏi và nhãn hai lựa chọn, đúng câu chữ design §4.5. `editor`: tên người sửa/xoá ở máy chủ. */
export function recordLevelPrompt(
  level: DeleteConflict,
  editor: string,
): { question: string; keepLabel: string; deleteLabel: string } {
  if (level === 'local-deleted-remote-edited') {
    return {
      question: `Bạn đã xoá phiếu này nhưng ${editor} vừa sửa nó. Giữ phiếu (với bản của ${editor}) hay vẫn xoá?`,
      keepLabel: `Giữ phiếu (với bản của ${editor})`,
      deleteLabel: 'Vẫn xoá',
    };
  }
  return {
    question: `${editor} đã xoá phiếu này nhưng bạn vừa sửa. Khôi phục với bản của bạn hay bỏ?`,
    keepLabel: 'Khôi phục với bản của bạn',
    deleteLabel: 'Bỏ',
  };
}

/**
 * Dữ liệu gửi lên sau khi người dùng trả lời. Câu hỏi đã nói rõ giữ bản nào ("với bản của Lan" /
 * "với bản của bạn") nên không ghép thêm lựa chọn từng trường. Xoá thì mang bản mới nhất của máy chủ
 * để tombstone không ghi đè phần người kia vừa sửa.
 */
export function resolveRecordLevel(
  level: DeleteConflict,
  choice: RecordLevelChoice,
  local: RecordData,
  server: RecordData,
): { data: RecordData; deleted: boolean } {
  if (choice === 'delete') return { data: server, deleted: true };
  return { data: level === 'local-deleted-remote-edited' ? server : local, deleted: false };
}
