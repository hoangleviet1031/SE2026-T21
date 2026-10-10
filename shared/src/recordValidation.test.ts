import { describe, expect, it } from 'vitest';
import { VALIDATION_MESSAGES as M, validateRecord } from './recordValidation';
import type { FieldDef, FieldValue, FormSchema, RecordData } from './types';

const form = (...fields: FieldDef[]): FormSchema => ({ id: 'f', version: 1, title: 'Form', fields });

const text: FieldDef = { id: 'name', type: 'text', label: 'Tên', required: true };
const num: FieldDef = { id: 'members', type: 'number', label: 'Số người', required: true };
const sel: FieldDef = { id: 'water', type: 'select', label: 'Nguồn nước', required: true, options: ['Máy', 'Giếng'] };
const multi: FieldDef = { id: 'assets', type: 'multiselect', label: 'Tài sản', required: true, options: ['Xe', 'Tivi'] };
const date: FieldDef = { id: 'visit', type: 'date', label: 'Ngày', required: true };
const gps: FieldDef = { id: 'loc', type: 'gps', label: 'Vị trí', required: true };
const photo: FieldDef = { id: 'pic', type: 'photo', label: 'Ảnh', required: true };
const all = form(text, num, sel, multi, date, gps, photo);

const valid: RecordData = {
  name: 'Nguyễn Văn A',
  members: 4,
  water: 'Giếng',
  assets: ['Xe'],
  visit: '2026-02-28',
  loc: { lat: 21.03, lng: 105.85, accuracy: 10 },
  pic: ['att-1'],
};

const errorsFor = (field: FieldDef, value: FieldValue | undefined) =>
  validateRecord(form(field), value === undefined ? {} : { [field.id]: value });

describe('validateRecord', () => {
  it('phiếu đủ và đúng mọi loại trường: không lỗi', () => {
    expect(validateRecord(all, valid)).toEqual({});
  });

  describe('required: "có giá trị" theo từng loại (design §4.1)', () => {
    it.each([
      ['text thiếu', text, undefined],
      ['text null', text, null],
      ['text chỉ có khoảng trắng', text, '   '],
      ['number null', num, null],
      ['select rỗng', sel, ''],
      ['select null', sel, null],
      ['multiselect mảng rỗng', multi, []],
      ['date rỗng', date, ''],
      ['gps null', gps, null],
      ['photo mảng rỗng', photo, []],
    ] as Array<[string, FieldDef, FieldValue | undefined]>)('%s → bắt buộc', (_name, field, value) => {
      expect(errorsFor(field, value)).toEqual({ [field.id]: M.required });
    });

    it('number 0 là có giá trị', () => {
      expect(errorsFor(num, 0)).toEqual({});
    });

    it('trường không bắt buộc để trống thì không lỗi', () => {
      const optional = form(...all.fields.map((f) => ({ ...f, required: false })));
      expect(validateRecord(optional, {})).toEqual({});
      expect(validateRecord(optional, { name: '', water: '', visit: '', assets: [], pic: [], members: null })).toEqual({});
    });

    it('trường hidden bắt buộc nhưng để trống: bỏ qua', () => {
      expect(errorsFor({ ...text, hidden: true }, undefined)).toEqual({});
    });
  });

  describe('định dạng', () => {
    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('number %s → không phải số', (v) => {
      expect(errorsFor(num, v)).toEqual({ members: M.number });
    });

    it('select không có trong options → lỗi lựa chọn', () => {
      expect(errorsFor(sel, 'Sông')).toEqual({ water: M.option });
    });

    it('multiselect có phần tử lạ → lỗi lựa chọn', () => {
      expect(errorsFor(multi, ['Xe', 'Máy bay'])).toEqual({ assets: M.option });
    });

    it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2025-02-29', '26-01-01', '2026/01/01', '2026-1-5'])(
      'date %s → ngày không hợp lệ',
      (v) => {
        expect(errorsFor(date, v)).toEqual({ visit: M.date });
      },
    );

    it('date 2024-02-29 (năm nhuận) hợp lệ', () => {
      expect(errorsFor(date, '2024-02-29')).toEqual({});
    });

    it.each([
      { lat: 90.1, lng: 0 },
      { lat: -90.1, lng: 0 },
      { lat: 0, lng: 180.1 },
      { lat: 0, lng: -180.1 },
      { lat: Number.NaN, lng: 0 },
    ])('gps %o → toạ độ ngoài phạm vi', (v) => {
      expect(errorsFor(gps, v)).toEqual({ loc: M.gps });
    });

    it('gps ở biên [-90, 90] và [-180, 180] hợp lệ', () => {
      expect(errorsFor(gps, { lat: -90, lng: 180 })).toEqual({});
    });

    it('trường hidden có giá trị sai định dạng vẫn báo lỗi', () => {
      expect(errorsFor({ ...num, hidden: true }, Number.NaN)).toEqual({ members: M.number });
    });

    it('trường không bắt buộc có giá trị sai định dạng vẫn báo lỗi', () => {
      expect(errorsFor({ ...date, required: false }, '2026-02-30')).toEqual({ visit: M.date });
    });
  });

  describe('sai kiểu dữ liệu → giá trị không hợp lệ', () => {
    it.each([
      ['text nhận số', text, 5],
      ['number nhận chuỗi', num, '5'],
      ['select nhận mảng', sel, ['Máy']],
      ['multiselect nhận chuỗi', multi, 'Xe'],
      ['date nhận số', date, 20260101],
      ['gps nhận chuỗi', gps, '21,105'],
      ['photo nhận chuỗi', photo, 'att-1'],
      ['text nhận gps', text, { lat: 1, lng: 1 }],
    ] as Array<[string, FieldDef, FieldValue]>)('%s', (_name, field, value) => {
      expect(errorsFor(field, value)).toEqual({ [field.id]: M.invalid });
    });
  });

  it('khoá trong data không có trong form thì bỏ qua', () => {
    expect(validateRecord(all, { ...valid, extra: 'x' })).toEqual({});
  });

  it('nhiều lỗi cùng lúc: mỗi trường một lỗi', () => {
    expect(validateRecord(all, { ...valid, name: ' ', members: Number.NaN, water: 'Sông' })).toEqual({
      name: M.required,
      members: M.number,
      water: M.option,
    });
  });
});
