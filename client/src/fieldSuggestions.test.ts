import { describe, expect, it } from 'vitest';
import type { FormSchema, RecordData } from '@field-survey/shared';
import { SUGGESTION_LIMIT, fieldSuggestions, type SuggestionSource } from './fieldSuggestions';

const form: FormSchema = {
  id: 'ho',
  version: 2,
  title: 'Hộ dân',
  fields: [
    { id: 'name', type: 'text', label: 'Tên' },
    { id: 'village', type: 'text', label: 'Thôn' },
    { id: 'members', type: 'number', label: 'Số người' },
    { id: 'water', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng'] },
    { id: 'visit', type: 'date', label: 'Ngày' },
    { id: 'old', type: 'text', label: 'Cũ', hidden: true },
  ],
};

let n = 0;
// Mỗi phiếu tạo sau thì sửa sau: giờ tăng dần
const rec = (data: RecordData, extra: Partial<SuggestionSource> = {}): SuggestionSource => {
  n += 1;
  return { id: `r${n}`, data, deleted: false, updatedAt: `2026-11-12T08:00:${String(n).padStart(2, '0')}.000Z`, ...extra };
};

describe('fieldSuggestions', () => {
  it('chỉ gợi ý trường chữ không ẩn, mới trước', () => {
    const records = [
      rec({ name: 'An', village: 'Thôn 1', members: 3, water: 'Máy', visit: '2026-11-01', old: 'x' }),
      rec({ name: 'Bình', village: 'Thôn 2' }),
    ];
    expect(fieldSuggestions(form, records, 'moi')).toEqual({
      name: ['Bình', 'An'],
      village: ['Thôn 2', 'Thôn 1'],
    });
  });

  it('ghép theo mã trường, kể cả phiếu của phiên bản form cũ', () => {
    // Phiếu bản 1 chỉ có `name`; mã trường giữ nguyên giữa các bản (design §4.1)
    expect(fieldSuggestions(form, [rec({ name: 'Cũ' })], 'moi')).toEqual({ name: ['Cũ'] });
  });

  it('bỏ phiếu đã xoá và phiếu đang mở', () => {
    const open = rec({ name: 'Đang mở' });
    const records = [rec({ name: 'Đã xoá' }, { deleted: true }), open, rec({ name: 'Còn' })];
    expect(fieldSuggestions(form, records, open.id)).toEqual({ name: ['Còn'] });
  });

  it('bỏ rỗng, chỉ khoảng trắng và giá trị không phải chữ', () => {
    const records = [rec({ name: '' }), rec({ name: '   ' }), rec({ name: null }), rec({ name: ['a'] }), rec({})];
    expect(fieldSuggestions(form, records, 'moi')).toEqual({});
  });

  it('bỏ trùng không phân biệt hoa thường, khoảng trắng, cách gõ dấu; giữ cách viết mới nhất', () => {
    const records = [
      rec({ village: 'thôn  đông' }),
      rec({ village: 'Thôn Đông'.normalize('NFD') }),
      rec({ village: '  THÔN ĐÔNG ' }),
    ];
    expect(fieldSuggestions(form, records, 'moi')).toEqual({ village: ['THÔN ĐÔNG'] });
  });

  it('sắp theo giờ sửa, không theo thứ tự đọc ra', () => {
    const records = [
      rec({ name: 'Mới' }, { updatedAt: '2026-11-12T10:00:00.000Z' }),
      rec({ name: 'Cũ' }, { updatedAt: '2026-11-10T10:00:00.000Z' }),
      rec({ name: 'Giữa' }, { updatedAt: '2026-11-11T10:00:00.000Z' }),
    ];
    expect(fieldSuggestions(form, records, 'moi').name).toEqual(['Mới', 'Giữa', 'Cũ']);
  });

  it(`giữ tối đa ${SUGGESTION_LIMIT} giá trị mới nhất`, () => {
    const records = Array.from({ length: SUGGESTION_LIMIT + 5 }, (_, i) =>
      rec({ name: `Hộ ${i}` }, { updatedAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() }),
    );
    const names = fieldSuggestions(form, records, 'moi').name ?? [];
    expect(names).toHaveLength(SUGGESTION_LIMIT);
    expect(names[0]).toBe(`Hộ ${SUGGESTION_LIMIT + 4}`);
    expect(names).not.toContain('Hộ 4');
  });

  it('form không có trường chữ thì không có gợi ý', () => {
    const numbers: FormSchema = { ...form, fields: [{ id: 'members', type: 'number', label: 'Số người' }] };
    expect(fieldSuggestions(numbers, [rec({ members: 2 })], 'moi')).toEqual({});
  });
});
