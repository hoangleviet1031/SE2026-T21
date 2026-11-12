import { describe, expect, it } from 'vitest';
import type { FieldDef, FormSchema } from '@field-survey/shared';
import { formChanges, formChangeText } from './formChanges';

const prev: FormSchema = {
  id: 'ho',
  version: 2,
  title: 'Hộ dân',
  fields: [
    { id: 'ten', type: 'text', label: 'Tên', required: true },
    { id: 'nuoc', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng'] },
    { id: 'cu', type: 'text', label: 'Trường cũ', hidden: true },
  ],
};

const next = (fields: FieldDef[], title = prev.title) => ({ id: prev.id, title, fields });

const text = (fields: FieldDef[], title?: string) => formChangeText(prev.version, formChanges(prev, next(fields, title)));

describe('formChanges, formChangeText', () => {
  it('không đổi gì: nói rõ không có gì khác bản đang dùng', () => {
    expect(text(prev.fields)).toBe('Không có gì khác bản 2 đang dùng. Vẫn lưu bản mới?');
  });

  it('thêm trường, kể cả trường mới đặt Ẩn ngay, chỉ tính là thêm', () => {
    const fields = [...prev.fields, { id: 'a', type: 'number' as const, label: 'A' }, { id: 'b', type: 'text' as const, label: 'B', hidden: true }];
    expect(text(fields)).toBe('So với bản 2 đang dùng: thêm 2 trường. Lưu bản mới?');
  });

  it('ẩn một trường, hiện lại một trường', () => {
    const [ten, nuoc, cu] = prev.fields as [FieldDef, FieldDef, FieldDef];
    expect(text([{ ...ten, hidden: true }, nuoc, { ...cu, hidden: false }])).toBe(
      'So với bản 2 đang dùng: ẩn 1 trường, hiện lại 1 trường. Lưu bản mới?',
    );
  });

  it('đổi nhãn; chỉ khác khoảng trắng hai đầu thì không tính', () => {
    const [ten, nuoc, cu] = prev.fields as [FieldDef, FieldDef, FieldDef];
    expect(formChanges(prev, next([{ ...ten, label: ' Tên ' }, nuoc, cu])).relabeled).toBe(0);
    expect(text([{ ...ten, label: 'Họ tên' }, nuoc, cu])).toBe('So với bản 2 đang dùng: đổi nhãn 1 trường. Lưu bản mới?');
  });

  it('đổi Bắt buộc; thiếu và false coi như nhau', () => {
    const [ten, nuoc, cu] = prev.fields as [FieldDef, FieldDef, FieldDef];
    expect(formChanges(prev, next([ten, { ...nuoc, required: false }, cu])).requiredChanged).toBe(0);
    expect(text([{ ...ten, required: false }, { ...nuoc, required: true }, cu])).toBe(
      'So với bản 2 đang dùng: đổi Bắt buộc ở 2 trường. Lưu bản mới?',
    );
  });

  it('thêm lựa chọn: đếm theo trường', () => {
    const [ten, nuoc, cu] = prev.fields as [FieldDef, FieldDef, FieldDef];
    expect(text([ten, { ...nuoc, options: ['Máy', 'Giếng', 'Mưa', 'Sông'] }, cu])).toBe(
      'So với bản 2 đang dùng: thêm lựa chọn ở 1 trường. Lưu bản mới?',
    );
  });

  it('đổi thứ tự trường cũ; trường mới chen vào giữa không tính là đổi thứ tự', () => {
    const [ten, nuoc, cu] = prev.fields as [FieldDef, FieldDef, FieldDef];
    expect(formChanges(prev, next([ten, { id: 'moi', type: 'text', label: 'Mới' }, nuoc, cu])).reordered).toBe(false);
    expect(text([nuoc, ten, cu])).toBe('So với bản 2 đang dùng: đổi thứ tự trường. Lưu bản mới?');
  });

  it('đổi tiêu đề; chỉ khác khoảng trắng hai đầu thì không tính', () => {
    expect(formChanges(prev, next(prev.fields, ' Hộ dân ')).titleChanged).toBe(false);
    expect(text(prev.fields, 'Hộ gia đình')).toBe('So với bản 2 đang dùng: đổi tiêu đề. Lưu bản mới?');
  });

  it('nhiều loại cùng lúc: cụm theo thứ tự cố định, nối bằng dấu phẩy', () => {
    const [ten, nuoc, cu] = prev.fields as [FieldDef, FieldDef, FieldDef];
    const fields: FieldDef[] = [
      { ...nuoc, label: 'Nước', options: ['Máy', 'Giếng', 'Mưa'] },
      { ...ten, hidden: true, required: false },
      { ...cu, hidden: false },
      { id: 'moi', type: 'text', label: 'Mới' },
    ];
    expect(text(fields, 'Hộ')).toBe(
      'So với bản 2 đang dùng: thêm 1 trường, ẩn 1 trường, hiện lại 1 trường, đổi nhãn 1 trường, ' +
        'đổi Bắt buộc ở 1 trường, thêm lựa chọn ở 1 trường, đổi thứ tự trường, đổi tiêu đề. Lưu bản mới?',
    );
  });
});
