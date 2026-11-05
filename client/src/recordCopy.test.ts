import { describe, expect, it } from 'vitest';
import type { FormSchema } from '@field-survey/shared';
import { canCopyRecord, copyBuffer, copyableData } from './recordCopy';
import { restorePlan } from './typingBuffer';

const form: FormSchema = {
  id: 'ho',
  version: 2,
  title: 'Hộ dân',
  fields: [
    { id: 'name', type: 'text', label: 'Tên', required: true },
    { id: 'members', type: 'number', label: 'Số người' },
    { id: 'water', type: 'select', label: 'Nguồn nước', options: ['Máy', 'Giếng'] },
    { id: 'assets', type: 'multiselect', label: 'Tài sản', options: ['Xe', 'Tivi'] },
    { id: 'visit', type: 'date', label: 'Ngày' },
    { id: 'photo', type: 'photo', label: 'Ảnh', required: true },
    { id: 'place', type: 'gps', label: 'Vị trí', required: true },
    { id: 'old', type: 'text', label: 'Cũ', hidden: true },
    { id: 'added', type: 'text', label: 'Mới thêm', required: true },
  ],
};

describe('copyableData', () => {
  it('chép các trường chữ, số, chọn, ngày', () => {
    const data = { name: 'An', members: 0, water: 'Giếng', assets: ['Xe'], visit: '2026-11-04' };
    expect(copyableData(form, data)).toEqual(data);
  });

  it('không chép ảnh và vị trí, kể cả khi bắt buộc', () => {
    expect(copyableData(form, { name: 'An', photo: ['a1'], place: { lat: 10, lng: 106 } })).toEqual({ name: 'An' });
  });

  it('không chép trường đã ẩn ở bản mới nhất và id không có trong form', () => {
    expect(copyableData(form, { name: 'An', old: 'giá trị cũ', gone: 'x' })).toEqual({ name: 'An' });
  });

  it('bỏ ô rỗng', () => {
    expect(copyableData(form, { name: '   ', members: null, water: '', assets: [] })).toEqual({});
  });

  it('bỏ giá trị sai định dạng, giữ giá trị đúng', () => {
    const data = { name: 'An', water: 'Sông', assets: ['Xe', 'Thuyền'], visit: '2026-02-30', members: 3 };
    expect(copyableData(form, data)).toEqual({ name: 'An', members: 3 });
  });

  it('trường mới thêm thì để trống, không báo lỗi ở đây', () => {
    expect(copyableData(form, { name: 'An' })).not.toHaveProperty('added');
  });

  it('không chép được gì thì trả rỗng', () => {
    expect(copyableData(form, { photo: ['a1'] })).toEqual({});
  });
});

describe('copyBuffer', () => {
  const savedAt = '2026-11-04T07:00:00.000Z';

  it('theo bản form truyền vào, gốc rỗng, có đánh dấu bản sao', () => {
    expect(copyBuffer(form, { name: 'An', photo: ['a1'] }, savedAt)).toEqual({
      formId: 'ho',
      formVersion: 2,
      data: { name: 'An' },
      base: {},
      savedAt,
      fromCopy: true,
    });
  });

  it('đi đúng nhánh phiếu mới của restorePlan: có dữ liệu thì khôi phục, không có thì bỏ', () => {
    expect(restorePlan(copyBuffer(form, { name: 'An' }, savedAt), undefined)).toEqual({
      kind: 'restore',
      data: { name: 'An' },
      kept: [],
    });
    expect(restorePlan(copyBuffer(form, { photo: ['a1'] }, savedAt), undefined)).toEqual({ kind: 'same' });
  });
});

describe('canCopyRecord', () => {
  const mine = { deleted: false, syncState: 'synced', createdBy: 'me' } as const;

  it('hiện ở phiếu đã lưu của mình, mọi trạng thái sửa được', () => {
    for (const syncState of ['synced', 'pending', 'draft', 'error'] as const) {
      expect(canCopyRecord({ ...mine, syncState }, 'surveyor', 'me')).toBe(true);
    }
  });

  it('không hiện ở phiếu xung đột hay đã xoá, kể cả owner', () => {
    expect(canCopyRecord({ ...mine, syncState: 'conflict' }, 'owner', 'me')).toBe(false);
    expect(canCopyRecord({ ...mine, deleted: true }, 'owner', 'me')).toBe(false);
  });

  it('điều tra viên: phiếu người khác thì không; chưa biết người tạo thì có', () => {
    expect(canCopyRecord({ ...mine, createdBy: 'other' }, 'surveyor', 'me')).toBe(false);
    expect(canCopyRecord({ ...mine, createdBy: undefined }, 'surveyor', 'me')).toBe(true);
  });

  it('giám sát viên và owner nhân bản được phiếu người khác', () => {
    expect(canCopyRecord({ ...mine, createdBy: 'other' }, 'supervisor', 'me')).toBe(true);
    expect(canCopyRecord({ ...mine, createdBy: 'other' }, 'owner', 'me')).toBe(true);
  });
});
