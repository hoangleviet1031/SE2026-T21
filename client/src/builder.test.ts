import { describe, expect, it } from 'vitest';
import type { FormSchema } from '@field-survey/shared';
import {
  addField,
  FORM_ID_EMPTY,
  FORM_ID_TAKEN,
  builderErrors,
  formIdInvalid,
  emptyBuilder,
  fromForm,
  fromImport,
  moveField,
  moveFieldTo,
  parseOptions,
  removeField,
  selectionAfterMove,
  setFormId,
  setTitle,
  suggestId,
  toSaveRequest,
  updateField,
} from './builder';

const saved: FormSchema = {
  id: 'household',
  version: 2,
  title: 'Hộ gia đình',
  fields: [
    { id: 'name', type: 'text', label: 'Tên', required: true },
    { id: 'water', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng'] },
  ],
};

describe('suggestId', () => {
  it('bỏ dấu tiếng Việt, ghép camelCase', () => {
    expect(suggestId('Tên chủ hộ')).toBe('tenChuHo');
    expect(suggestId('Đường đi  số 2')).toBe('duongDiSo2');
  });

  it('bắt đầu bằng số thì thêm "f"; không còn chữ nào thì rỗng', () => {
    expect(suggestId('2 tầng')).toBe('f2Tang');
    expect(suggestId('  ?? ')).toBe('');
  });

  it('trùng mã đã có thì thêm số', () => {
    expect(suggestId('Tên', new Set(['ten', 'ten2']))).toBe('ten3');
  });
});

describe('form mới', () => {
  it('mã form đi theo tiêu đề tới khi người dùng tự sửa', () => {
    let s = setTitle(emptyBuilder(), 'Khảo sát nước');
    expect(s.id).toBe('khaoSatNuoc');
    s = setFormId(s, 'water');
    s = setTitle(s, 'Khảo sát nước sạch');
    expect(s.id).toBe('water');
  });

  it('mã trường đi theo nhãn, không trùng trường khác, dừng khi tự sửa mã', () => {
    let s = addField(addField(emptyBuilder(), 'text'), 'text');
    s = updateField(s, 0, { label: 'Tên' });
    s = updateField(s, 1, { label: 'Tên' });
    expect(s.fields.map((f) => f.id)).toEqual(['ten', 'ten2']);
    s = updateField(s, 1, { id: 'alias' });
    s = updateField(s, 1, { label: 'Biệt danh' });
    expect(s.fields[1]?.id).toBe('alias');
  });

  it('select có sẵn mảng lựa chọn rỗng, loại khác không có', () => {
    const s = addField(addField(emptyBuilder(), 'select'), 'date');
    expect(s.fields[0]?.options).toEqual([]);
    expect(s.fields[1]?.options).toBeUndefined();
  });
});

describe('form đã lưu', () => {
  it('khoá mã form và mã trường cũ', () => {
    let s = fromForm(saved);
    s = setFormId(setTitle(s, 'Hộ'), 'other');
    expect(s.id).toBe('household');
    s = updateField(s, 0, { id: 'x', label: 'Họ tên' });
    expect(s.fields[0]).toMatchObject({ id: 'name', label: 'Họ tên' });
  });

  it('không xoá được trường đã lưu, xoá được trường mới', () => {
    let s = addField(fromForm(saved), 'number');
    expect(removeField(s, 0).fields).toHaveLength(3);
    s = removeField(s, 2);
    expect(s.fields.map((f) => f.id)).toEqual(['name', 'water']);
  });
});

describe('moveField', () => {
  it('đổi chỗ với trường kề, ra ngoài mảng thì giữ nguyên', () => {
    const s = fromForm(saved);
    expect(moveField(s, 1, -1).fields.map((f) => f.id)).toEqual(['water', 'name']);
    expect(moveField(s, 0, -1)).toBe(s);
    expect(moveField(s, 1, 1)).toBe(s);
  });
});

describe('parseOptions', () => {
  it('mỗi dòng một lựa chọn, bỏ khoảng trắng và dòng trống', () => {
    expect(parseOptions(' Máy \n\nGiếng\n')).toEqual(['Máy', 'Giếng']);
  });
});

describe('toSaveRequest', () => {
  it('bỏ trạng thái nội bộ, chỉ giữ cờ đang bật, options chỉ ở select', () => {
    let s = updateField(fromForm(saved), 1, { hidden: true });
    s = updateField(addField(s, 'gps'), 2, { label: ' Vị trí ' });
    expect(toSaveRequest(s)).toEqual({
      id: 'household',
      title: 'Hộ gia đình',
      fields: [
        { id: 'name', type: 'text', label: 'Tên', required: true },
        { id: 'water', type: 'select', label: 'Nguồn nước', hidden: true, options: ['Máy', 'Giếng'] },
        { id: 'viTri', type: 'gps', label: 'Vị trí' },
      ],
    });
  });
});

describe('builderErrors', () => {
  it('form hợp lệ thì không lỗi', () => {
    expect(builderErrors(fromForm(saved), saved)).toEqual([]);
  });

  it('trường chưa có nhãn và select chưa có lựa chọn', () => {
    const s = addField(setTitle(emptyBuilder(), 'Mới'), 'select');
    const errors = builderErrors(updateField(s, 0, { id: 'chon' }));
    expect(errors).toContain('Trường thứ 1 chưa có nhãn');
    expect(errors.some((e) => e.includes('ít nhất một lựa chọn'))).toBe(true);
  });

  it('bỏ lựa chọn cũ thì báo lỗi theo luật so với bản trước', () => {
    const s = updateField(fromForm(saved), 1, { options: ['Máy'] });
    expect(builderErrors(s, saved)).not.toEqual([]);
  });
});

describe('mã form trùng trong dự án', () => {
  const existing = new Set(['household']);

  it('form mới trùng mã form đã có thì báo lỗi, đổi mã thì hết', () => {
    const s = setFormId(fromImport(saved), 'household');
    expect(builderErrors(s, undefined, existing)).toEqual([FORM_ID_TAKEN]);
    expect(builderErrors(setFormId(s, 'household2'), undefined, existing)).toEqual([]);
  });

  it('form đã lưu (mã khoá) không tính là trùng với chính nó', () => {
    expect(builderErrors(fromForm(saved), saved, existing)).toEqual([]);
  });
});

// Critique K3 (TV1-12 màn hình 5): bỏ trống mã báo câu ngắn, ô Mã biết khi nào phải tô đỏ
describe('mã biểu mẫu trống hoặc sai', () => {
  const existing = new Set(['household']);

  it('bỏ trống mã chỉ báo "Nhập mã biểu mẫu", không kèm câu "không hợp lệ" của shared', () => {
    const errors = builderErrors(setFormId(fromImport(saved), ''), undefined, existing);
    expect(errors).toEqual([FORM_ID_EMPTY]);
  });

  it('mã sai mẫu vẫn dùng câu của shared', () => {
    const errors = builderErrors(setFormId(fromImport(saved), '1ho'), undefined, existing);
    expect(errors).toEqual([expect.stringContaining('Mã biểu mẫu "1ho" không hợp lệ')]);
  });

  it('formIdInvalid: trống, sai mẫu, trùng thì đúng; mã hợp lệ hoặc đã khoá thì sai', () => {
    const s = fromImport(saved);
    expect(formIdInvalid(setFormId(s, ''), existing)).toBe(true);
    expect(formIdInvalid(setFormId(s, '1ho'), existing)).toBe(true);
    expect(formIdInvalid(setFormId(s, 'household'), existing)).toBe(true);
    expect(formIdInvalid(setFormId(s, 'household2'), existing)).toBe(false);
    expect(formIdInvalid(fromForm(saved), existing)).toBe(false);
  });
});

describe('fromImport', () => {
  it('nạp thành form mới: mã sửa được, trường chưa lưu nên xoá được và sửa được mã', () => {
    const s = fromImport({ id: saved.id, title: saved.title, fields: saved.fields });
    expect(s.idLocked).toBe(false);
    expect(setFormId(s, 'khac').id).toBe('khac');
    expect(updateField(s, 0, { id: 'hoTen' }).fields[0]?.id).toBe('hoTen');
    expect(removeField(s, 0).fields).toHaveLength(1);
    expect(toSaveRequest(s)).toEqual({ id: saved.id, title: saved.title, fields: saved.fields });
  });
});

describe('moveFieldTo', () => {
  const ids = (s: ReturnType<typeof fromForm>) => s.fields.map((f) => f.id);
  const three = fromForm({ ...saved, fields: [...saved.fields, { id: 'note', type: 'text', label: 'Ghi chú' }] });

  it('from = to hoặc chỉ số ngoài mảng thì giữ nguyên state', () => {
    expect(moveFieldTo(three, 1, 1)).toBe(three);
    expect(moveFieldTo(three, -1, 0)).toBe(three);
    expect(moveFieldTo(three, 0, 3)).toBe(three);
    expect(moveFieldTo(three, 3, 0)).toBe(three);
  });

  it('đầu xuống cuối và cuối lên đầu, các trường giữa dồn lại', () => {
    expect(ids(three)).toEqual(['name', 'water', 'note']);
    expect(ids(moveFieldTo(three, 0, 2))).toEqual(['water', 'note', 'name']);
    expect(ids(moveFieldTo(three, 2, 0))).toEqual(['note', 'name', 'water']);
  });
});

describe('selectionAfterMove', () => {
  it('chọn chính dòng di chuyển thì đi theo nó', () => {
    expect(selectionAfterMove(2, 2, 1)).toBe(1);
    expect(selectionAfterMove(0, 0, 4)).toBe(4);
  });

  it('dòng nằm giữa from và to dịch một bậc ngược chiều, kể cả khi chuyển xa', () => {
    // ▲ ở dòng 2 khi đang chọn dòng 1: dòng 1 bị đẩy xuống 2
    expect(selectionAfterMove(1, 2, 1)).toBe(2);
    // Kéo dòng 0 xuống 4: dòng 1–4 dồn lên
    expect([1, 2, 3, 4].map((s) => selectionAfterMove(s, 0, 4))).toEqual([0, 1, 2, 3]);
    // Kéo dòng 4 lên 0: dòng 0–3 dồn xuống
    expect([0, 1, 2, 3].map((s) => selectionAfterMove(s, 4, 0))).toEqual([1, 2, 3, 4]);
  });

  it('dòng ngoài khoảng giữ nguyên', () => {
    expect(selectionAfterMove(0, 2, 3)).toBe(0);
    expect(selectionAfterMove(4, 1, 2)).toBe(4);
  });

  it('không chọn gì thì vẫn không chọn gì', () => {
    expect(selectionAfterMove(null, 0, 1)).toBeNull();
  });
});
