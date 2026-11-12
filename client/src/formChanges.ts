import type { FormSchema, SaveFormRequest } from '@field-survey/shared';

// Tóm tắt bản form sắp lưu khác bản đang dùng thế nào, để hỏi lại trước khi gửi (design §4.1 "Lưu bản mới",
// ui.md màn hình 5). Hàm thuần, tách khỏi React để unit test được.

export interface FormChanges {
  added: number;
  hidden: number;
  shown: number;
  relabeled: number;
  requiredChanged: number;
  optionsAdded: number;
  reordered: boolean;
  titleChanged: boolean;
}

/**
 * So theo mã trường: trường đã lưu bị khoá mã nên mã không đổi giữa hai bản. Không đếm bỏ trường, bỏ lựa chọn
 * hay đổi loại vì luật đổi form an toàn đã chặn trước khi tới đây (`builderErrors`).
 */
export function formChanges(prev: FormSchema, next: SaveFormRequest): FormChanges {
  const old = new Map(prev.fields.map((f) => [f.id, f]));
  const changes: FormChanges = {
    added: 0,
    hidden: 0,
    shown: 0,
    relabeled: 0,
    requiredChanged: 0,
    optionsAdded: 0,
    reordered: false,
    titleChanged: prev.title.trim() !== next.title.trim(),
  };
  for (const f of next.fields) {
    const o = old.get(f.id);
    if (!o) {
      // Trường mới thêm mà đặt Ẩn ngay vẫn chỉ tính là "thêm"
      changes.added++;
      continue;
    }
    if (!o.hidden && f.hidden) changes.hidden++;
    if (o.hidden && !f.hidden) changes.shown++;
    if (o.label.trim() !== f.label.trim()) changes.relabeled++;
    if (Boolean(o.required) !== Boolean(f.required)) changes.requiredChanged++;
    const had = new Set(o.options ?? []);
    if ((f.options ?? []).some((opt) => !had.has(opt))) changes.optionsAdded++;
  }
  // Chỉ xét thứ tự giữa các trường cũ: trường mới chen vào giữa không làm trường cũ đổi chỗ với nhau
  const nextIds = new Set(next.fields.map((f) => f.id));
  const before = prev.fields.map((f) => f.id).filter((id) => nextIds.has(id));
  const after = next.fields.map((f) => f.id).filter((id) => old.has(id));
  changes.reordered = after.some((id, i) => before[i] !== id);
  return changes;
}

/** Câu trong hộp hỏi lại. Không nêu số bản sắp tạo: server mới quyết số bản (CLAUDE.md bất biến 4). */
export function formChangeText(prevVersion: number, c: FormChanges): string {
  const parts: string[] = [];
  if (c.added) parts.push(`thêm ${c.added} trường`);
  if (c.hidden) parts.push(`ẩn ${c.hidden} trường`);
  if (c.shown) parts.push(`hiện lại ${c.shown} trường`);
  if (c.relabeled) parts.push(`đổi nhãn ${c.relabeled} trường`);
  if (c.requiredChanged) parts.push(`đổi Bắt buộc ở ${c.requiredChanged} trường`);
  if (c.optionsAdded) parts.push(`thêm lựa chọn ở ${c.optionsAdded} trường`);
  if (c.reordered) parts.push('đổi thứ tự trường');
  if (c.titleChanged) parts.push('đổi tiêu đề');
  if (parts.length === 0) return `Không có gì khác bản ${prevVersion} đang dùng. Vẫn lưu bản mới?`;
  return `So với bản ${prevVersion} đang dùng: ${parts.join(', ')}. Lưu bản mới?`;
}
