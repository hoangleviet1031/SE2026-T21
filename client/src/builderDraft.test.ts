import { describe, expect, it } from 'vitest';
import type { FormSchema } from '@field-survey/shared';
import { addField, emptyBuilder, fromForm, moveField, setTitle, toSaveRequest, updateField } from './builder';
import { draftIsStale, needsDraft, rebaseDraft, rebasedNote, restoreDraft, type BuilderDraft } from './builderDraft';

const v1: FormSchema = {
  id: 'household',
  version: 1,
  title: 'Hộ gia đình',
  fields: [
    { id: 'name', type: 'text', label: 'Tên', required: true },
    { id: 'members', type: 'number', label: 'Số người' },
  ],
};

// Bản 2 do người khác lưu: thêm "phone", đổi nhãn "name"
const v2: FormSchema = {
  ...v1,
  version: 2,
  fields: [
    { id: 'name', type: 'text', label: 'Tên chủ hộ', required: true },
    { id: 'members', type: 'number', label: 'Số người' },
    { id: 'phone', type: 'text', label: 'Điện thoại' },
  ],
};

const draftOf = (state = fromForm(v1), baseVersion: number | null = 1): BuilderDraft => ({
  formId: baseVersion === null ? null : 'household',
  baseVersion,
  state,
  savedAt: '2026-11-12T07:00:00.000Z',
});

describe('needsDraft', () => {
  it('không đổi gì thì không cần tự lưu', () => {
    expect(needsDraft(fromForm(v1), fromForm(v1))).toBe(false);
    expect(needsDraft(emptyBuilder(), emptyBuilder())).toBe(false);
  });

  it('đổi tiêu đề, thêm trường (kể cả chưa có nhãn), đổi thứ tự thì cần', () => {
    const base = fromForm(v1);
    expect(needsDraft(setTitle(base, 'Hộ mới'), base)).toBe(true);
    expect(needsDraft(addField(base, 'text'), base)).toBe(true);
    expect(needsDraft(moveField(base, 0, 1), base)).toBe(true);
    expect(needsDraft(addField(emptyBuilder(), 'date'), emptyBuilder())).toBe(true);
  });

  it('khoảng trắng hai đầu tiêu đề không tính (không gửi đi)', () => {
    const base = fromForm(v1);
    expect(needsDraft(setTitle(base, ' Hộ gia đình '), base)).toBe(false);
  });

  it('sửa rồi sửa ngược về như cũ thì không cần', () => {
    const base = fromForm(v1);
    const back = updateField(updateField(base, 1, { label: 'Khác' }), 1, { label: 'Số người' });
    expect(needsDraft(back, base)).toBe(false);
  });
});

describe('rebaseDraft', () => {
  it('thêm vào cuối trường của bản mới mà bản tự lưu chưa có, đã lưu; giữ phần đã sửa', () => {
    const edited = addField(updateField(fromForm(v1), 1, { hidden: true }), 'text');
    const { state, added } = rebaseDraft(edited, v2);
    expect(added).toBe(1);
    expect(state.fields.map((f) => [f.id, f.saved])).toEqual([
      ['name', true],
      ['members', true],
      ['', false],
      ['phone', true],
    ]);
    // Nhãn "name" giữ bản tự lưu; hộp tóm tắt khi lưu so với bản 2 sẽ nêu
    expect(state.fields[0]?.label).toBe('Tên');
    expect(state.fields[1]?.hidden).toBe(true);
  });

  it('trường chưa lưu trùng mã trường mới: để nguyên chưa lưu, không đổi mã hộ', () => {
    const edited = updateField(addField(fromForm(v1), 'text'), 2, { id: 'phone', label: 'SĐT' });
    const { state } = rebaseDraft(edited, v2);
    expect(state.fields.filter((f) => f.id === 'phone').map((f) => f.saved)).toEqual([false, true]);
  });

  it('bản mới không thêm trường thì không thêm gì', () => {
    const { state, added } = rebaseDraft(fromForm(v1), { ...v1, version: 2, title: 'Đổi tên' });
    expect(added).toBe(0);
    expect(state.fields).toHaveLength(2);
  });
});

describe('restoreDraft', () => {
  it('cùng bản: nạp nguyên, uid mới, giữ cờ khoá mã', () => {
    const state = addField(fromForm(v1), 'number');
    const r = restoreDraft(draftOf(state), v1);
    expect(r.newer).toBeUndefined();
    expect(toSaveRequest(r.state)).toEqual(toSaveRequest(state));
    expect(r.state.idLocked).toBe(true);
    expect(r.state.fields.map((f) => f.saved)).toEqual([true, true, false]);
    const oldUids = new Set(state.fields.map((f) => f.uid));
    expect(r.state.fields.some((f) => oldUids.has(f.uid))).toBe(false);
    expect(new Set(r.state.fields.map((f) => f.uid)).size).toBe(3);
  });

  it('form đã lên bản mới: đưa lên bản mới, báo số bản và số trường thêm', () => {
    const r = restoreDraft(draftOf(addField(fromForm(v1), 'text')), v2);
    expect(r.newer).toEqual({ version: 2, added: 1 });
    expect(r.state.fields.map((f) => f.id)).toEqual(['name', 'members', '', 'phone']);
  });

  it('form mới: không có bản gốc nên không đưa lên bản nào', () => {
    const state = setTitle(emptyBuilder(), 'Trường học');
    const r = restoreDraft(draftOf(state, null), undefined);
    expect(r.newer).toBeUndefined();
    expect(r.state.id).toBe('truongHoc');
  });
});

describe('draftIsStale', () => {
  it('bản tự lưu trùng bản mới nhất (máy tắt giữa lúc Lưu và lúc xoá) thì bỏ', () => {
    // Đã sửa từ bản 1 thành đúng bản 2 rồi Lưu, chưa kịp xoá bản tự lưu
    expect(draftIsStale(draftOf(fromForm(v2)), v2)).toBe(true);
    expect(draftIsStale(draftOf(emptyBuilder(), null), undefined)).toBe(true);
  });

  it('còn khác bản mới nhất thì giữ để hỏi', () => {
    expect(draftIsStale(draftOf(setTitle(fromForm(v1), 'Khác')), v1)).toBe(false);
    // Bản tự lưu không sửa gì của bản 1 nhưng thiếu "phone" của bản 2: đưa lên rồi so, vẫn khác vì giữ nhãn cũ
    expect(draftIsStale(draftOf(fromForm(v1)), v2)).toBe(false);
  });
});

describe('rebasedNote', () => {
  it('có trường thêm và không có trường thêm', () => {
    expect(rebasedNote({ version: 3, added: 2 })).toBe(
      'Đã khôi phục. Trong lúc bạn sửa, biểu mẫu đã lên bản 3; 2 trường mới của bản đó được thêm vào cuối. Kiểm lại trước khi lưu.',
    );
    expect(rebasedNote({ version: 3, added: 0 })).toBe(
      'Đã khôi phục. Trong lúc bạn sửa, biểu mẫu đã lên bản 3. Kiểm lại trước khi lưu.',
    );
  });
});
