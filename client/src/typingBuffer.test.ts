import { describe, expect, it } from 'vitest';
import type { FormSchema } from '@field-survey/shared';
import { keptFieldLine, needsBuffer, restorePlan, type TypingBuffer } from './typingBuffer';

const buffer = (data: TypingBuffer['data'], base: TypingBuffer['base'] = {}): TypingBuffer => ({
  formId: 'household-survey',
  formVersion: 1,
  data,
  base,
  savedAt: '2026-10-30T07:32:00.000Z',
});

describe('needsBuffer', () => {
  it('chưa gõ gì, hoặc chỉ có ô rỗng ("", [], null, thiếu) thì không cần lưu', () => {
    expect(needsBuffer({}, {})).toBe(false);
    expect(needsBuffer({ name: '', photos: [], members: null }, {})).toBe(false);
    expect(needsBuffer({ name: 'An' }, { name: 'An' })).toBe(false);
  });

  it('gõ khác bản đã nạp thì cần lưu', () => {
    expect(needsBuffer({ name: 'An' }, {})).toBe(true);
    expect(needsBuffer({ name: 'Bình' }, { name: 'An' })).toBe(true);
  });

  it('xoá trống giá trị cũ vẫn là thay đổi', () => {
    expect(needsBuffer({ name: '' }, { name: 'An' })).toBe(true);
    expect(needsBuffer({ members: null }, { members: 3 })).toBe(true);
    expect(needsBuffer({}, { name: 'An' })).toBe(true);
  });

  it('chọn nhiều so như tập hợp, thứ tự không quan trọng', () => {
    expect(needsBuffer({ tags: ['b', 'a'] }, { tags: ['a', 'b'] })).toBe(false);
  });
});

describe('restorePlan', () => {
  it('phiếu mới chưa lưu lần nào thì lấy nguyên chữ đã gõ', () => {
    expect(restorePlan(buffer({ name: 'An' }), undefined)).toEqual({ kind: 'restore', data: { name: 'An' }, kept: [] });
  });

  it('bộ đệm trùng phiếu thì bỏ, không hỏi', () => {
    expect(restorePlan(buffer({ name: 'An' }, { name: 'Cũ' }), { data: { name: 'An' }, deleted: false })).toEqual({
      kind: 'same',
    });
  });

  it('phiếu đã bị xoá (xoá mềm hoặc xoá hẳn khỏi máy) thì không khôi phục được', () => {
    expect(restorePlan(buffer({ name: 'An' }, { name: 'Cũ' }), { data: { name: 'Cũ' }, deleted: true })).toEqual({
      kind: 'gone',
    });
    expect(restorePlan(buffer({ name: 'An' }, { name: 'Cũ' }), undefined)).toEqual({ kind: 'gone' });
  });

  it('phiếu chưa đổi từ lúc gõ thì lấy nguyên chữ đã gõ, kể cả ô đã xoá trống', () => {
    const plan = restorePlan(buffer({ name: 'An', members: null }, { name: 'Cũ', members: 3 }), {
      data: { name: 'Cũ', members: 3 },
      deleted: false,
    });
    expect(plan).toEqual({ kind: 'restore', data: { name: 'An', members: null }, kept: [] });
  });

  it('phiếu bị đổi ở trường khác thì giữ cả hai thay đổi', () => {
    const plan = restorePlan(buffer({ name: 'An', members: 3 }, { name: 'Cũ', members: 3 }), {
      data: { name: 'Cũ', members: 5 },
      deleted: false,
    });
    expect(plan).toEqual({ kind: 'restore', data: { name: 'An', members: 5 }, kept: [] });
  });

  it('cùng trường bị sửa ở nơi khác thì giữ bản mới và báo chữ đã gõ, không tự chọn chữ đã gõ', () => {
    const plan = restorePlan(buffer({ name: 'An', members: 4 }, { name: 'Cũ', members: 3 }), {
      data: { name: 'Bình', members: 3 },
      deleted: false,
    });
    expect(plan).toEqual({ kind: 'restore', data: { name: 'Bình', members: 4 }, kept: [{ field: 'name', typed: 'An' }] });
  });
});

describe('keptFieldLine', () => {
  const form: FormSchema = {
    id: 'f',
    version: 1,
    title: 'F',
    fields: [
      { id: 'name', type: 'text', label: 'Tên hộ' },
      { id: 'tags', type: 'multiselect', label: 'Nguồn nước', options: ['Giếng', 'Mưa'] },
      { id: 'photo', type: 'photo', label: 'Ảnh nhà' },
      { id: 'gps', type: 'gps', label: 'Vị trí' },
    ],
  };

  it('chữ theo ui.md màn hình 4', () => {
    expect(keptFieldLine(form, { field: 'name', typed: 'An' })).toBe('Tên hộ: bạn đã nhập "An"');
    expect(keptFieldLine(form, { field: 'tags', typed: ['Giếng', 'Mưa'] })).toBe('Nguồn nước: bạn đã nhập "Giếng, Mưa"');
    expect(keptFieldLine(form, { field: 'photo', typed: ['a'] })).toBe('Ảnh nhà: bạn đã chọn ảnh khác');
    expect(keptFieldLine(form, { field: 'gps', typed: { lat: 1, lng: 2 } })).toBe('Vị trí: bạn đã lấy vị trí khác');
    expect(keptFieldLine(form, { field: 'name', typed: undefined })).toBe('Tên hộ: bạn đã để trống');
  });
});
