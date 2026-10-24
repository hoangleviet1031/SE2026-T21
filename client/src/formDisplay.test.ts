import { describe, expect, it } from 'vitest';
import type { FieldDef } from '@field-survey/shared';
import { fieldMode, formTone, latestForms } from './formDisplay';

const text: FieldDef = { id: 'ten', type: 'text', label: 'Tên' };
const hidden: FieldDef = { ...text, hidden: true };

describe('fieldMode', () => {
  it('trường thường luôn sửa được, kể cả khi rỗng', () => {
    expect(fieldMode(text, undefined)).toBe('edit');
    expect(fieldMode(text, 'An')).toBe('edit');
  });

  it('trường ẩn không có giá trị thì không hiện (phiếu mới)', () => {
    expect(fieldMode(hidden, undefined)).toBe('hidden');
    expect(fieldMode(hidden, null)).toBe('hidden');
    expect(fieldMode(hidden, '  ')).toBe('hidden');
    expect(fieldMode({ ...hidden, type: 'photo' }, [])).toBe('hidden');
  });

  it('trường ẩn đã có giá trị thì hiện chỉ đọc', () => {
    expect(fieldMode(hidden, 'An')).toBe('readonly');
    expect(fieldMode({ ...hidden, type: 'number' }, 0)).toBe('readonly');
    expect(fieldMode({ ...hidden, type: 'multiselect' }, ['A'])).toBe('readonly');
  });

  it('trường ẩn có giá trị đang báo lỗi thì cho sửa để phiếu ra khỏi nháp', () => {
    expect(fieldMode({ ...hidden, type: 'number' }, 'abc', true)).toBe('edit');
    expect(fieldMode(hidden, undefined, true)).toBe('hidden');
    expect(fieldMode(text, 'An', true)).toBe('edit');
  });
});

describe('latestForms', () => {
  it('mỗi form một bản, lấy version cao nhất, giữ thứ tự xuất hiện lần đầu', () => {
    const forms = [
      { id: 'b', version: 2 },
      { id: 'a', version: 1 },
      { id: 'b', version: 1 },
      { id: 'c', version: 1 },
      { id: 'a', version: 3 },
    ];
    expect(latestForms(forms)).toEqual([
      { id: 'a', version: 3 },
      { id: 'b', version: 2 },
      { id: 'c', version: 1 },
    ]);
  });

  it('không sửa mảng đầu vào', () => {
    const forms = [{ id: 'b', version: 2 }, { id: 'a', version: 1 }];
    latestForms(forms);
    expect(forms.map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('formTone', () => {
  it('5 màu theo thứ tự rồi vòng lại', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(formTone)).toEqual([1, 2, 3, 4, 5, 1, 2, 1]);
  });

  it('form không có trong danh sách thì màu 1', () => {
    expect(formTone(-1)).toBe(1);
  });
});
