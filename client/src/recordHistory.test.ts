import { describe, expect, it } from 'vitest';
import type { FormSchema, RecordData, RecordHistoryEntry } from '@field-survey/shared';
import { buildHistoryView } from './recordHistory';

const form: FormSchema = {
  id: 'hh',
  version: 2,
  title: 'Hộ',
  fields: [
    { id: 'name', type: 'text', label: 'Tên chủ hộ' },
    { id: 'members', type: 'number', label: 'Số thành viên' },
    { id: 'photos', type: 'photo', label: 'Ảnh' },
    { id: 'pos', type: 'gps', label: 'Vị trí' },
    { id: 'old', type: 'text', label: 'Ghi chú cũ', hidden: true },
  ],
};
const v3: FormSchema = { ...form, version: 3, fields: [...form.fields, { id: 'later', type: 'text', label: 'Trường sau' }] };

let n = 0;
function entry(data: RecordData, extra: Partial<RecordHistoryEntry> = {}): RecordHistoryEntry {
  n += 1;
  return { version: n, data, deleted: false, updatedAt: '2026-11-13T07:32:00.000Z', updatedBy: 'u_lan', updatedByName: 'Lan', ...extra };
}
function build(...datas: RecordData[]) {
  n = 0;
  return buildHistoryView(datas.map((d) => entry(d)), form, [form, v3]);
}

describe('buildHistoryView', () => {
  it('bản đầu là tạo phiếu, không liệt kê giá trị; kết quả mới trước', () => {
    n = 0;
    const view = buildHistoryView([entry({ name: 'An' }), entry({ name: 'Bình' })], form, [form]);
    expect(view.map((v) => [v.version, v.kind])).toEqual([
      [2, 'edited'],
      [1, 'created'],
    ]);
    expect(view[1]?.changes).toEqual([]);
    expect(view[0]).toMatchObject({ who: 'Lan', at: '2026-11-13T07:32:00.000Z', changes: ['Tên chủ hộ: An → Bình'] });
  });

  it('chỉ liệt kê trường đổi, theo thứ tự trong form; ô rỗng coi như nhau', () => {
    const view = build({ name: 'An', members: 3, old: '' }, { members: 4, name: 'An', pos: null, photos: [] });
    expect(view[0]?.changes).toEqual(['Số thành viên: 3 → 4']);
  });

  it('xoá trống một giá trị là thay đổi', () => {
    expect(build({ name: 'An' }, { name: '' })[0]?.changes).toEqual(['Tên chủ hộ: An → (trống)']);
  });

  it('sửa mà không đổi giá trị nào thì không có dòng nào', () => {
    const view = build({ name: 'An' }, { name: 'An' });
    expect(view[0]).toMatchObject({ kind: 'edited', changes: [] });
  });

  it('xoá, xoá lại, khôi phục', () => {
    n = 0;
    const view = buildHistoryView(
      [entry({ name: 'An' }), entry({ name: 'An' }, { deleted: true }), entry({ name: 'An' }, { deleted: true }), entry({ name: 'Ba' })],
      form,
      [form],
    );
    expect(view.map((v) => v.kind)).toEqual(['restored', 'deleted', 'deleted', 'created']);
    expect(view[0]?.changes).toEqual(['Tên chủ hộ: An → Ba']);
    expect(view[1]?.changes).toEqual([]);
  });

  it('ảnh hiện số lượng; cùng số mà khác ảnh thì "đã thay ảnh"', () => {
    expect(build({ photos: ['a'] }, { photos: ['a', 'b'] })[0]?.changes).toEqual(['Ảnh: 1 ảnh → 2 ảnh']);
    expect(build({ photos: ['a', 'b'] }, { photos: ['a', 'c'] })[0]?.changes).toEqual(['Ảnh: đã thay ảnh (2 ảnh)']);
    expect(build({}, { photos: ['a'] })[0]?.changes).toEqual(['Ảnh: Không có ảnh → 1 ảnh']);
    // Cùng tập ảnh khác thứ tự không phải thay đổi
    expect(build({ photos: ['a', 'b'] }, { photos: ['b', 'a'] })[0]?.changes).toEqual([]);
  });

  it('vị trí hiện toạ độ 5 chữ số', () => {
    expect(build({}, { pos: { lat: 10.7769, lng: 106.7009, accuracy: 12 } })[0]?.changes).toEqual([
      'Vị trí: (trống) → 10.77690, 106.70090',
    ]);
  });

  it('trường ẩn kèm "(đã ẩn)"; trường chỉ có ở bản form khác lấy nhãn ở đó; không có ở đâu thì hiện mã', () => {
    const view = build({ old: 'x' }, { old: 'y', later: 'z', ghost: 'q' });
    expect(view[0]?.changes).toEqual(['Ghi chú cũ (đã ẩn): x → y', 'Trường sau: (trống) → z', 'ghost: (trống) → q']);
  });

  it('tên rỗng thì hiện userId', () => {
    n = 0;
    const view = buildHistoryView([entry({}, { updatedByName: '', updatedBy: 'u_x' })], form, [form]);
    expect(view[0]?.who).toBe('u_x');
  });
});
