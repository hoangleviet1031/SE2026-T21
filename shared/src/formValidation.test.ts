import { describe, expect, it } from 'vitest';
import { validateFormSchema } from './formValidation';
import type { FieldDef, FormSchema } from './types';

const form = (...fields: FieldDef[]): FormSchema => ({ id: 'household', version: 1, title: 'Hộ gia đình', fields });

const name: FieldDef = { id: 'householdName', type: 'text', label: 'Tên chủ hộ', required: true };
const water: FieldDef = { id: 'water', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng'] };
const assets: FieldDef = { id: 'assets', type: 'multiselect', label: 'Tài sản', options: ['Xe', 'Tivi'] };

describe('validateFormSchema: một phiên bản (design §4.1)', () => {
  it('form hợp lệ đủ 7 loại trường: không lỗi', () => {
    const f = form(
      name,
      { id: 'members', type: 'number', label: 'Số người' },
      water,
      assets,
      { id: 'visit_date', type: 'date', label: 'Ngày' },
      { id: 'loc', type: 'gps', label: 'Vị trí' },
      { id: 'pic1', type: 'photo', label: 'Ảnh' },
    );
    expect(validateFormSchema(f)).toEqual([]);
  });

  it.each(['1abc', 'a-b', 'có_dấu', '', '_a', 'a b'])('mã trường sai mẫu "%s": lỗi', (id) => {
    expect(validateFormSchema(form({ ...name, id }))).toEqual([expect.stringContaining('không hợp lệ')]);
  });

  it('mã trường trùng: lỗi', () => {
    expect(validateFormSchema(form(name, { ...name, label: 'Khác' }))).toEqual([
      'Mã trường "householdName" bị trùng',
    ]);
  });

  it.each([
    ['select', water],
    ['multiselect', assets],
  ])('%s không có lựa chọn: lỗi', (_t, field) => {
    expect(validateFormSchema(form({ ...field, options: [] }))).toEqual([
      `Trường "${field.id}" phải có ít nhất một lựa chọn`,
    ]);
    const { options: _omit, ...noOptions } = field;
    expect(validateFormSchema(form(noOptions))).toHaveLength(1);
  });

  it('lựa chọn trùng: lỗi, mỗi giá trị trùng báo một lần', () => {
    expect(validateFormSchema(form({ ...water, options: ['Máy', 'Giếng', 'Máy', 'Máy'] }))).toEqual([
      'Trường "water" có lựa chọn "Máy" bị trùng',
    ]);
  });

  it('lựa chọn để trống: lỗi', () => {
    expect(validateFormSchema(form({ ...water, options: ['Máy', ' '] }))).toEqual([
      'Trường "water" có lựa chọn để trống',
    ]);
  });

  it('options ở trường không phải select: bỏ qua', () => {
    expect(validateFormSchema(form({ ...name, options: [] }))).toEqual([]);
  });

  it('mã biểu mẫu sai mẫu hoặc tên để trống: lỗi', () => {
    expect(validateFormSchema({ ...form(name), id: 'hộ-1' })).toEqual([expect.stringContaining('Mã biểu mẫu')]);
    expect(validateFormSchema({ ...form(name), title: '  ' })).toEqual(['Tên biểu mẫu không được để trống']);
  });
});

describe('validateFormSchema: so với phiên bản trước', () => {
  const prev = form(name, water);

  it('thêm trường, đổi nhãn, thêm lựa chọn, ẩn trường: hợp lệ', () => {
    const next = form(
      { ...name, label: 'Họ tên chủ hộ', hidden: true },
      { ...water, options: ['Máy', 'Giếng', 'Sông'] },
      assets,
    );
    expect(validateFormSchema(next, prev)).toEqual([]);
  });

  it('đổi thứ tự trường: hợp lệ', () => {
    expect(validateFormSchema(form(water, name), prev)).toEqual([]);
  });

  it('thiếu trường cũ: lỗi', () => {
    expect(validateFormSchema(form(water), prev)).toEqual([
      'Thiếu trường "householdName" của phiên bản trước (muốn bỏ thì đặt ẩn)',
    ]);
  });

  it('đổi loại trường cũ: lỗi', () => {
    expect(validateFormSchema(form({ ...name, type: 'number' }, water), prev)).toEqual([
      'Không được đổi loại trường "householdName" (tạo trường mới thay vì sửa)',
    ]);
  });

  it('bỏ lựa chọn cũ: lỗi', () => {
    expect(validateFormSchema(form(name, { ...water, options: ['Máy'] }), prev)).toEqual([
      'Không được bỏ lựa chọn "Giếng" của trường "water"',
    ]);
  });

  it('nhiều lỗi cùng lúc: trả đủ', () => {
    expect(validateFormSchema(form({ ...water, options: [] }), prev)).toEqual([
      'Trường "water" phải có ít nhất một lựa chọn',
      'Thiếu trường "householdName" của phiên bản trước (muốn bỏ thì đặt ẩn)',
      'Không được bỏ lựa chọn "Máy" của trường "water"',
      'Không được bỏ lựa chọn "Giếng" của trường "water"',
    ]);
  });
});
