import { describe, expect, it } from 'vitest';
import type { FieldDef } from '@field-survey/shared';
import { fieldMode } from './formDisplay';

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
});
