import { describe, expect, it } from 'vitest';
import type { FormSchema, MergeResult } from '@field-survey/shared';
import { buildConflictView, formatValue, resolveChoices } from './conflictView';

// Màn hình xung đột (design §4.5, ui.md màn hình 3): nhãn trường theo form, "Gộp cả hai" cho
// multiselect/ảnh, mục "Đã gộp tự động".

const form: FormSchema = {
  id: 'household-survey',
  version: 1,
  title: 'Khảo sát hộ gia đình',
  fields: [
    { id: 'householdName', type: 'text', label: 'Tên chủ hộ', required: true },
    { id: 'members', type: 'number', label: 'Số thành viên' },
    { id: 'assets', type: 'multiselect', label: 'Tài sản', options: ['Xe máy', 'Tivi', 'Tủ lạnh'] },
    { id: 'housePhoto', type: 'photo', label: 'Ảnh nhà' },
    { id: 'location', type: 'gps', label: 'Vị trí' },
  ],
};

const merge: MergeResult = {
  merged: { householdName: 'A', members: 5, waterSource: 'Giếng', assets: ['Xe máy'], housePhoto: ['p1'] },
  conflicts: [
    { field: 'householdName', base: 'Gốc', local: 'Máy A', remote: 'Máy B' },
    { field: 'assets', base: ['Xe máy'], local: ['Xe máy', 'Tivi'], remote: ['Xe máy', 'Tủ lạnh'] },
    { field: 'housePhoto', base: [], local: ['p1', 'p2'], remote: ['p3'] },
  ],
  autoResolved: [
    { field: 'members', takenFrom: 'local' },
    { field: 'waterSource', takenFrom: 'remote' },
  ],
};

describe('formatValue', () => {
  it('hiển thị theo loại trường', () => {
    expect(formatValue('text', 'An')).toBe('An');
    expect(formatValue('number', 0)).toBe('0');
    expect(formatValue('multiselect', ['Xe máy', 'Tivi'])).toBe('Xe máy; Tivi');
    expect(formatValue('photo', ['p1', 'p2', 'p3'])).toBe('3 ảnh');
    expect(formatValue('photo', [])).toBe('Không có ảnh');
    expect(formatValue('gps', { lat: 10.776912, lng: 106.700912 })).toBe('10.77691, 106.70091');
  });

  it('giá trị trống hiện "(trống)", trường không còn trong form vẫn hiện được', () => {
    expect(formatValue('text', '')).toBe('(trống)');
    expect(formatValue('number', null)).toBe('(trống)');
    expect(formatValue(undefined, undefined)).toBe('(trống)');
    expect(formatValue(undefined, ['a', 'b'])).toBe('a; b');
  });
});

describe('buildConflictView', () => {
  const view = buildConflictView(merge, form);

  it('dùng nhãn trường của form thay cho id, giữ thứ tự xung đột', () => {
    expect(view.fields.map((f) => [f.id, f.label])).toEqual([
      ['householdName', 'Tên chủ hộ'],
      ['assets', 'Tài sản'],
      ['housePhoto', 'Ảnh nhà'],
    ]);
    expect(view.fields[0]).toMatchObject({ base: 'Gốc', local: 'Máy A', remote: 'Máy B', union: undefined });
  });

  it('multiselect và ảnh có thêm "Gộp cả hai" (hợp hai tập, không trùng)', () => {
    expect(view.fields[1]?.union).toBe('Xe máy; Tivi; Tủ lạnh');
    expect(view.fields[2]?.union).toBe('3 ảnh');
    expect(view.fields[2]).toMatchObject({ local: '2 ảnh', remote: '1 ảnh' });
  });

  it('mục tự gộp: nhãn, lấy từ bên nào, giá trị đã gộp; trường không có trong form dùng id', () => {
    expect(view.auto).toEqual([
      { id: 'members', label: 'Số thành viên', source: 'lấy bản của bạn', value: '5' },
      { id: 'waterSource', label: 'waterSource', source: 'lấy bản trên máy chủ', value: 'Giếng' },
    ]);
  });

  it('không có form (chưa tải bản đó về máy) thì vẫn dựng được bằng id', () => {
    expect(buildConflictView(merge, undefined).fields.map((f) => f.label)).toEqual(['householdName', 'assets', 'housePhoto']);
  });
});

describe('resolveChoices', () => {
  it('lấy bản gộp tự động rồi áp lựa chọn từng trường', () => {
    const resolved = resolveChoices(merge, form, { householdName: 'local', assets: 'remote', housePhoto: 'local' });
    expect(resolved).toEqual({
      householdName: 'Máy A',
      members: 5,
      waterSource: 'Giếng',
      assets: ['Xe máy', 'Tủ lạnh'],
      housePhoto: ['p1', 'p2'],
    });
  });

  it('"Gộp cả hai" là hợp hai tập, giữ thứ tự bên mình trước', () => {
    const resolved = resolveChoices(merge, form, { householdName: 'remote', assets: 'both', housePhoto: 'both' });
    expect(resolved.assets).toEqual(['Xe máy', 'Tivi', 'Tủ lạnh']);
    expect(resolved.housePhoto).toEqual(['p1', 'p2', 'p3']);
    expect(resolved.householdName).toBe('Máy B');
  });

  it('bên được chọn không có giá trị thì bỏ trường khỏi bản gộp', () => {
    const m: MergeResult = { merged: { members: 1, note: 'x' }, conflicts: [{ field: 'note', base: 'x', local: undefined, remote: 'y' }], autoResolved: [] };
    expect(resolveChoices(m, form, { note: 'local' })).toEqual({ members: 1 });
  });

  it('thiếu lựa chọn cho một trường xung đột thì ném lỗi (nút Áp dụng phải khoá trước đó)', () => {
    expect(() => resolveChoices(merge, form, { householdName: 'local' })).toThrow();
  });
});
