import { describe, expect, it } from 'vitest';
import { parseSaveFormRequest, validateFormSchema } from '@field-survey/shared';
import { fromTemplate, setTitle, suggestId, toSaveRequest, updateField } from './builder';
import { FORM_TEMPLATES } from './formTemplates';

// Mẫu form có sẵn (design §4.1 "Mẫu có sẵn")
describe('FORM_TEMPLATES', () => {
  it('có đủ ba mẫu Dương chốt, tên không trùng', () => {
    expect(FORM_TEMPLATES.map((t) => t.title)).toEqual([
      'Khảo sát hộ gia đình',
      'Khảo sát y tế hộ gia đình',
      'Khảo sát cây trồng',
    ]);
  });

  it.each(FORM_TEMPLATES.map((t) => [t.title, t] as const))('%s qua luật lưu form như form mới', (_, t) => {
    const req = toSaveRequest(fromTemplate(t));
    expect(parseSaveFormRequest(req)).toEqual(req);
    expect(validateFormSchema({ ...req, version: 1 })).toEqual([]);
  });

  it.each(FORM_TEMPLATES.map((t) => [t.title, t] as const))('%s: mã trường đúng bằng mã gợi ý từ nhãn', (_, t) => {
    const taken = new Set<string>();
    for (const f of t.fields) {
      expect(f.id).toBe(suggestId(f.label, taken));
      taken.add(f.id);
    }
  });
});

describe('fromTemplate', () => {
  const template = FORM_TEMPLATES[0] ?? { title: '', fields: [] };

  it('thành form mới chưa lưu, gửi đi đúng như mẫu', () => {
    const state = fromTemplate(template);
    expect(state).toMatchObject({ id: 'khaoSatHoGiaDinh', idLocked: false, autoId: true, title: template.title });
    expect(state.fields.every((f) => !f.saved && f.autoId)).toBe(true);
    expect(toSaveRequest(state)).toEqual({ id: 'khaoSatHoGiaDinh', title: template.title, fields: template.fields });
  });

  it('mã form trùng form đã có trong dự án thì thêm số', () => {
    expect(fromTemplate(template, new Set(['khaoSatHoGiaDinh'])).id).toBe('khaoSatHoGiaDinh2');
    expect(fromTemplate(template, new Set(['khaoSatHoGiaDinh', 'khaoSatHoGiaDinh2'])).id).toBe('khaoSatHoGiaDinh3');
  });

  it('đổi tiêu đề, nhãn thì mã đi theo như form tạo tay', () => {
    let state = setTitle(fromTemplate(template), 'Hộ dân xã A');
    expect(state.id).toBe('hoDanXaA');
    state = updateField(state, 1, { label: 'Thôn' });
    expect(state.fields[1]?.id).toBe('thon');
  });

  it('sửa lựa chọn trong builder không đổi dữ liệu mẫu', () => {
    const state = fromTemplate(template);
    state.fields[3]?.options?.push('Thêm');
    expect(template.fields[3]?.options).not.toContain('Thêm');
  });
});
