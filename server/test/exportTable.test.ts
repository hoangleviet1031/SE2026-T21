import { describe, expect, it } from 'vitest';
import type { FormSchema, ServerRecord } from '@field-survey/shared';
import { exportColumns, exportTable } from '../src/lib/exportTable';

// Bảng xuất CSV (design §4.6): cột cố định, rồi trường theo phiên bản form mới nhất, trường chỉ có ở
// bản cũ thêm vào cuối; gps tách 3 cột; ảnh là URL; multiselect nối "; ". Ticket TV3-09.

const v1: FormSchema = {
  id: 'ho',
  version: 1,
  title: 'Hộ',
  fields: [
    { id: 'ten', type: 'text', label: 'Tên' },
    { id: 'cu', type: 'text', label: 'Chỉ ở v1' },
    { id: 'viTri', type: 'gps', label: 'Vị trí' },
  ],
};
const v2: FormSchema = {
  id: 'ho',
  version: 2,
  title: 'Hộ',
  fields: [
    { id: 'ten', type: 'text', label: 'Tên chủ hộ' },
    { id: 'soNguoi', type: 'number', label: 'Số người' },
    { id: 'taiSan', type: 'multiselect', label: 'Tài sản', options: ['Tivi', 'Xe máy'] },
    { id: 'anh', type: 'photo', label: 'Ảnh' },
    { id: 'an', type: 'text', label: 'Trường ẩn', hidden: true },
  ],
};

const FIXED = ['id', 'version', 'updatedAt', 'updatedBy', 'updatedByName', 'formVersion', 'deleted'];

function rec(over: Partial<ServerRecord>): ServerRecord {
  return {
    id: 'r',
    formId: 'ho',
    formVersion: 2,
    data: {},
    version: 1,
    deleted: false,
    updatedAt: '2026-10-18T03:00:00.000Z',
    updatedBy: 'u_lan',
    updatedByName: 'Lan',
    createdBy: 'u_lan',
    createdByName: 'Lan',
    ...over,
  };
}

const photoUrl = (id: string) => `https://vd.test/api/projects/p1/attachments/${id}`;

describe('exportColumns', () => {
  it('cột cố định, trường của bản mới nhất theo thứ tự (kể cả trường ẩn), rồi trường chỉ có ở bản cũ; gps 3 cột', () => {
    // Thứ tự truyền vào không quan trọng: hàm tự xếp theo version
    expect(exportColumns([v1, v2]).map((c) => c.header)).toEqual([
      ...FIXED,
      'ten',
      'soNguoi',
      'taiSan',
      'anh',
      'an',
      'cu',
      'viTri_lat',
      'viTri_lng',
      'viTri_accuracy',
    ]);
    expect(exportColumns([v2, v1]).map((c) => c.header)).toEqual(exportColumns([v1, v2]).map((c) => c.header));
  });
});

describe('exportTable', () => {
  it('dòng đầu là tên cột; phiếu v1 và v2 cùng bảng, ô trường không có thì trống', () => {
    const table = exportTable(
      [v1, v2],
      [
        rec({ id: 'r1', formVersion: 1, data: { ten: 'An', cu: 'cũ', viTri: { lat: 10.5, lng: 106.25, accuracy: 12 } } }),
        rec({
          id: 'r2',
          version: 3,
          data: { ten: 'Bình', soNguoi: -2, taiSan: ['Tivi', 'Xe máy'], anh: ['a1', 'a2'], an: 'x' },
        }),
      ],
      photoUrl,
    );
    expect(table[0]).toEqual(exportColumns([v1, v2]).map((c) => c.header));
    expect(table[1]).toEqual([
      'r1', 1, '2026-10-18T03:00:00.000Z', 'u_lan', 'Lan', 1, false,
      'An', null, null, null, null, 'cũ', 10.5, 106.25, 12,
    ]);
    expect(table[2]).toEqual([
      'r2', 3, '2026-10-18T03:00:00.000Z', 'u_lan', 'Lan', 2, false,
      'Bình', -2, 'Tivi; Xe máy',
      'https://vd.test/api/projects/p1/attachments/a1; https://vd.test/api/projects/p1/attachments/a2',
      'x', null, null, null, null,
    ]);
  });

  it('gps thiếu accuracy, ảnh rỗng, giá trị sai kiểu vẫn xuất được', () => {
    const [, row] = exportTable(
      [v1, v2],
      [rec({ data: { viTri: { lat: 1, lng: 2 }, anh: [], soNguoi: '5' } })],
      photoUrl,
    );
    const headers = exportColumns([v1, v2]).map((c) => c.header);
    const cell = (h: string) => row?.[headers.indexOf(h)];
    expect(cell('viTri_accuracy')).toBeNull();
    expect(cell('anh')).toBeNull();
    expect(cell('soNguoi')).toBe('5');
  });

  it('server không có tên người sửa (tên rỗng) thì để trống', () => {
    const [, row] = exportTable([v2], [rec({ updatedByName: '' })], photoUrl);
    expect(row?.[4]).toBeNull();
  });
});
