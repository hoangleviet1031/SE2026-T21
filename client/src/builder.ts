import { validateFormSchema, type FieldDef, type FieldType, type FormSchema, type SaveFormRequest } from '@field-survey/shared';

// Trạng thái và thao tác của form builder (design §4.1, ui.md màn hình 5). Hàm thuần, tách khỏi
// React để unit test được; BuilderPage chỉ giữ state và gọi các hàm này.

export interface DraftField extends FieldDef {
  /** Khoá cục bộ để React giữ đúng ô đang sửa khi mã đổi theo nhãn hoặc trường đổi chỗ; không gửi đi */
  uid: number;
  /** Đã có ở phiên bản đã lưu: khoá mã, không xoá được, chỉ ẩn (design §4.1, đổi form an toàn) */
  saved: boolean;
  /** Mã còn tự đi theo nhãn: tắt khi người dùng tự sửa mã */
  autoId: boolean;
}

export interface BuilderState {
  id: string;
  /** Form đã lưu ít nhất một lần thì mã form bị khoá */
  idLocked: boolean;
  autoId: boolean;
  title: string;
  fields: DraftField[];
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Chữ',
  number: 'Số',
  select: 'Chọn một',
  multiselect: 'Chọn nhiều',
  date: 'Ngày',
  photo: 'Ảnh',
  gps: 'Vị trí GPS',
};

export const FIELD_TYPES: FieldType[] = ['text', 'number', 'select', 'multiselect', 'date', 'photo', 'gps'];

const hasOptions = (type: FieldType) => type === 'select' || type === 'multiselect';

let nextUid = 1;

export function emptyBuilder(): BuilderState {
  return { id: '', idLocked: false, autoId: true, title: '', fields: [] };
}

export function fromForm(form: FormSchema): BuilderState {
  return {
    id: form.id,
    idLocked: true,
    autoId: false,
    title: form.title,
    fields: form.fields.map((f) => ({ ...f, uid: nextUid++, saved: true, autoId: false })),
  };
}

/**
 * Form đọc từ file nhập (design §4.1, Xuất/Nhập form) thành form mới chưa lưu: mã form và mã trường
 * còn sửa được, trường nào cũng xoá được, vì ở dự án này chưa có phiếu nào dùng form đó.
 */
export function fromImport(form: SaveFormRequest): BuilderState {
  return {
    id: form.id,
    idLocked: false,
    autoId: false,
    title: form.title,
    fields: form.fields.map((f) => ({ ...f, uid: nextUid++, saved: false, autoId: false })),
  };
}

/**
 * Mã gợi ý từ nhãn: bỏ dấu tiếng Việt, ghép kiểu camelCase, thêm "f" nếu bắt đầu bằng số, thêm số
 * nếu trùng mã đã có ("Tên chủ hộ" → "tenChuHo"). Kết quả khớp FIELD_ID_PATTERN (nên cũng khớp FORM_ID_PATTERN) hoặc là chuỗi rỗng.
 */
export function suggestId(text: string, taken: ReadonlySet<string> = new Set()): string {
  const words = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  let id = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  if (!/^[a-zA-Z]/.test(id)) id = `f${id}`;
  let candidate = id;
  for (let n = 2; taken.has(candidate); n++) candidate = `${id}${n}`;
  return candidate;
}

function otherIds(fields: DraftField[], index: number): Set<string> {
  return new Set(fields.filter((_, i) => i !== index).map((f) => f.id));
}

export function setTitle(state: BuilderState, title: string): BuilderState {
  const id = state.autoId && !state.idLocked ? suggestId(title) : state.id;
  return { ...state, title, id };
}

export function setFormId(state: BuilderState, id: string): BuilderState {
  if (state.idLocked) return state;
  return { ...state, id, autoId: false };
}

export function addField(state: BuilderState, type: FieldType): BuilderState {
  const field: DraftField = { uid: nextUid++, id: '', type, label: '', saved: false, autoId: true };
  if (hasOptions(type)) field.options = [];
  return { ...state, fields: [...state.fields, field] };
}

/** Sửa một trường. Đổi nhãn thì mã đi theo nếu chưa lưu và chưa tự sửa; trường đã lưu không đổi mã. */
export function updateField(
  state: BuilderState,
  index: number,
  patch: Partial<Pick<FieldDef, 'id' | 'label' | 'required' | 'hidden' | 'options'>>,
): BuilderState {
  const fields = state.fields.map((f, i) => {
    if (i !== index) return f;
    const next: DraftField = { ...f, ...patch };
    if (f.saved) next.id = f.id;
    else if (patch.id !== undefined) next.autoId = false;
    else if (patch.label !== undefined && f.autoId) next.id = suggestId(patch.label, otherIds(state.fields, index));
    return next;
  });
  return { ...state, fields };
}

/** Đổi chỗ với trường kề trên (`-1`) hoặc kề dưới (`+1`); ra ngoài mảng thì giữ nguyên. */
export function moveField(state: BuilderState, index: number, delta: -1 | 1): BuilderState {
  return moveFieldTo(state, index, index + delta);
}

/**
 * Đưa trường ở `from` tới vị trí `to`, các trường ở giữa dồn lại (kéo thả, TV1-12 b2). `from = to` hoặc chỉ
 * số ngoài mảng thì trả lại đúng `state` cũ để màn hình biết không có gì đổi.
 */
export function moveFieldTo(state: BuilderState, from: number, to: number): BuilderState {
  const n = state.fields.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return state;
  const fields = [...state.fields];
  const [moved] = fields.splice(from, 1);
  if (!moved) return state;
  fields.splice(to, 0, moved);
  return { ...state, fields };
}

/** Chỉ xoá được trường chưa lưu lần nào; trường đã lưu phải dùng "Ẩn". */
export function removeField(state: BuilderState, index: number): BuilderState {
  if (state.fields[index]?.saved !== false) return state;
  return { ...state, fields: state.fields.filter((_, i) => i !== index) };
}

/** Ô "Lựa chọn": mỗi dòng một lựa chọn, bỏ khoảng trắng hai đầu và dòng trống. */
export function parseOptions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function toSaveRequest(state: BuilderState): SaveFormRequest {
  return {
    id: state.id,
    title: state.title.trim(),
    fields: state.fields.map((f) => {
      const field: FieldDef = { id: f.id, type: f.type, label: f.label.trim() };
      if (f.required) field.required = true;
      if (f.hidden) field.hidden = true;
      if (hasOptions(f.type)) field.options = f.options ?? [];
      return field;
    }),
  };
}

export const FORM_ID_TAKEN = 'Mã biểu mẫu đã có trong dự án';

/**
 * Lỗi trước khi gửi: cùng luật với server (`validateFormSchema`, so với bản mới nhất trên máy),
 * thêm luật riêng của builder: trường phải có nhãn (trường không nhãn thì điều tra viên không
 * biết nhập gì), và form mới không được trùng mã form đã có trong dự án (`existingFormIds`), vì
 * server sẽ coi đó là bản mới của form cũ. Server vẫn kiểm lại khi lưu.
 */
export function builderErrors(
  state: BuilderState,
  prev?: FormSchema,
  existingFormIds: ReadonlySet<string> = new Set(),
): string[] {
  const req = toSaveRequest(state);
  const errors: string[] = [];
  if (!state.idLocked && existingFormIds.has(req.id)) errors.push(FORM_ID_TAKEN);
  req.fields.forEach((f, i) => {
    if (f.label === '') errors.push(`Trường thứ ${i + 1} chưa có nhãn`);
  });
  return [...errors, ...validateFormSchema({ ...req, version: (prev?.version ?? 0) + 1 }, prev)];
}
