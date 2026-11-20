import type { FormSchema } from '@field-survey/shared';
import { emptyBuilder, fromDraft, fromForm, toSaveRequest, type BuilderState, type DraftField } from './builder';

// Tự lưu bản đang sửa của builder (design §4.1 "Tự lưu bản đang sửa", ui.md màn hình 5). Hàm thuần, không I/O;
// đọc ghi CSDL ở db/builderDraft.ts. Bản tự lưu không phải form: không gửi lên server, chỉ nạp lại vào builder.

export interface BuilderDraft {
  /** Mã form đang sửa; null là "Biểu mẫu mới" */
  formId: string | null;
  /** Bản form mới nhất trên máy lúc mở builder (null với form mới): gốc để biết trong lúc đó form đã lên bản mới chưa */
  baseVersion: number | null;
  state: BuilderState;
  /** Lúc ghi (ISO, giờ thiết bị), chỉ để hiện cho người dùng */
  savedAt: string;
}

/** Bản gốc để so: form mới nhất trên máy, hoặc builder rỗng khi tạo form mới */
export function draftBase(latest: FormSchema | undefined): BuilderState {
  return latest ? fromForm(latest) : emptyBuilder();
}

/** Có gì cần giữ: thứ sẽ gửi khi bấm Lưu khác bản gốc. Cờ nội bộ (uid, autoId) không tính */
export function needsDraft(state: BuilderState, base: BuilderState): boolean {
  return JSON.stringify(toSaveRequest(state)) !== JSON.stringify(toSaveRequest(base));
}

/**
 * Đưa bản tự lưu lên bản form mới hơn: trường của bản mới mà bản tự lưu chưa có thì thêm vào cuối, đã lưu (khoá
 * mã, không xoá được). Thiếu bước này thì lưu bị báo "Thiếu trường … của phiên bản trước" mà người dùng không có
 * cách thêm lại trường đã lưu. Trường đã sửa trong bản tự lưu giữ nguyên phần người dùng sửa; hộp tóm tắt khi lưu
 * so với bản mới nên vẫn thấy mình đổi gì. Trường chưa lưu trùng mã trường mới thì để nguyên cho người dùng tự đổi
 * mã (builder báo khi Lưu), không đổi hộ.
 */
export function rebaseDraft(state: BuilderState, latest: FormSchema): { state: BuilderState; added: number } {
  const have = new Set(state.fields.filter((f) => f.saved).map((f) => f.id));
  // Qua fromForm để trường thêm có uid mới, đã lưu; trường đang có giữ uid để ô đang gõ không bị dựng lại
  const added: DraftField[] = fromForm({ ...latest, fields: latest.fields.filter((f) => !have.has(f.id)) }).fields;
  return { state: { ...state, fields: [...state.fields, ...added] }, added: added.length };
}

/**
 * Đang sửa thì vòng đồng bộ tải bản form mới hơn (tech-debt N25, design §4.1 "Tự lưu bản đang sửa"). Chưa sửa gì
 * thì nạp nguyên bản mới, không báo: không đụng gì của người dùng, và giữ nhãn cũ thì lưu sau sẽ ngầm hoàn tác
 * thay đổi của máy khác. Đã sửa thì đưa lên bản mới như lúc Khôi phục và trả câu báo.
 */
export function onNewerForm(
  state: BuilderState,
  oldBase: FormSchema,
  latest: FormSchema,
): { state: BuilderState; note: string | null } {
  if (!needsDraft(state, draftBase(oldBase))) return { state: fromForm(latest), note: null };
  const { state: next, added } = rebaseDraft(state, latest);
  return { state: next, note: newerNote({ version: latest.version, added }) };
}

export interface RestoredDraft {
  state: BuilderState;
  /** Form đã lên bản mới hơn bản lúc bắt đầu sửa: số bản mới và số trường thêm vào cuối */
  newer?: { version: number; added: number };
}

/** Nạp bản tự lưu theo bản form mới nhất trên máy lúc bấm Khôi phục (vòng đồng bộ có thể vừa tải bản mới) */
export function restoreDraft(draft: BuilderDraft, latest: FormSchema | undefined): RestoredDraft {
  if (!latest || draft.baseVersion === null || draft.baseVersion >= latest.version) {
    return { state: fromDraft(draft.state) };
  }
  const { state, added } = rebaseDraft(draft.state, latest);
  return { state: fromDraft(state), newer: { version: latest.version, added } };
}

/**
 * Bản tự lưu không khác bản mới nhất (vd. máy tắt giữa lúc Lưu và lúc xoá bản tự lưu, hay sửa rồi sửa ngược lại):
 * bỏ luôn, không hỏi, vì không mất gì.
 */
export function draftIsStale(draft: BuilderDraft, latest: FormSchema | undefined): boolean {
  return !needsDraft(restoreDraft(draft, latest).state, draftBase(latest));
}

/** Câu ở dải sau khi khôi phục bản tự lưu cũ hơn bản form trên máy (ui.md màn hình 5) */
export function rebasedNote(newer: { version: number; added: number }): string {
  return `Đã khôi phục. ${newerNote(newer)}`;
}

/** Câu ở dải khi đang sửa mà form lên bản mới (ui.md màn hình 5) */
export function newerNote(newer: { version: number; added: number }): string {
  const middle = newer.added > 0 ? `; ${newer.added} trường mới của bản đó được thêm vào cuối` : '';
  return `Trong lúc bạn sửa, biểu mẫu đã lên bản ${newer.version}${middle}. Kiểm lại trước khi lưu.`;
}
