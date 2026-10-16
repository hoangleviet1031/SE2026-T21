import { describe, expect, it } from 'vitest';
import type { FormSchema } from '@field-survey/shared';
import { FORM_FILE_MESSAGES, formFileName, formFileText, parseFormFile } from './formFile';

const form: FormSchema = {
  id: 'household-survey',
  version: 3,
  title: 'Khảo sát hộ',
  fields: [
    { id: 'ten', type: 'text', label: 'Tên', required: true },
    { id: 'nuoc', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng'] },
    { id: 'cu', type: 'text', label: 'Trường cũ', hidden: true },
  ],
};

describe('xuất form', () => {
  it('tên file có mã và phiên bản', () => {
    expect(formFileName(form)).toBe('household-survey-v3.json');
  });

  it('xuất rồi đọc lại được đúng form, bỏ version', () => {
    const { version: _version, ...rest } = form;
    expect(parseFormFile(formFileText(form))).toEqual({ ok: true, form: rest });
  });
});

describe('parseFormFile', () => {
  it('không phải JSON', () => {
    expect(parseFormFile('{ hỏng')).toEqual({ ok: false, errors: [FORM_FILE_MESSAGES.notJson] });
  });

  it('JSON nhưng sai cấu trúc biểu mẫu', () => {
    expect(parseFormFile('[1, 2]')).toEqual({ ok: false, errors: [FORM_FILE_MESSAGES.notForm] });
    expect(parseFormFile(JSON.stringify({ id: 'a', title: 'A', fields: [{ id: 'x', type: 'lạ', label: 'X' }] }))).toEqual({
      ok: false,
      errors: [FORM_FILE_MESSAGES.notForm],
    });
  });

  it('đúng cấu trúc nhưng sai luật lưu form thì trả lỗi của validateFormSchema', () => {
    const result = parseFormFile(JSON.stringify({ id: 'a', title: 'A', fields: [{ id: 'chon', type: 'select', label: 'Chọn' }] }));
    expect(result).toEqual({ ok: false, errors: ['Trường "chon" phải có ít nhất một lựa chọn'] });
  });

  it('bỏ khoá lạ', () => {
    const result = parseFormFile(JSON.stringify({ ...form, createdAt: 'x', fields: [{ ...form.fields[0], note: 'y' }] }));
    expect(result).toEqual({ ok: true, form: { id: form.id, title: form.title, fields: [form.fields[0]] } });
  });
});
