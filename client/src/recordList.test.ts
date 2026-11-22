import { describe, expect, it } from 'vitest';
import type { FieldDef } from '@field-survey/shared';
import {
  MISSING_FORM_TITLE,
  RECORD_PAGE_SIZE,
  UNTITLED,
  formatEditedAt,
  groupKey,
  groupRecordsByForm,
  pageGroups,
  recordTitle,
  type RecordGroup,
} from './recordList';

// Danh sách phiếu trên trang chủ (design §4.8, tech-debt N10, N11).

const text = (id: string, hidden?: boolean): FieldDef => ({ id, type: 'text', label: id, hidden });
const form = (id: string, version: number, fields: FieldDef[] = [], title = id) => ({ id, version, title, fields });

describe('recordTitle', () => {
  const hh = form('hh', 1, [{ id: 'age', type: 'number', label: 'Tuổi' }, text('name'), text('note')]);

  it('lấy giá trị trường text đầu tiên, bỏ qua trường loại khác đứng trước', () => {
    expect(recordTitle({ formId: 'hh', formVersion: 1, data: { age: 30, name: 'Nguyễn Văn An', note: 'x' } }, [hh])).toBe(
      'Nguyễn Văn An',
    );
  });

  it('trường text đầu tiên rỗng thì "Phiếu chưa có tên", không lấy trường text sau', () => {
    expect(recordTitle({ formId: 'hh', formVersion: 1, data: { name: null, note: 'ghi chú' } }, [hh])).toBe(UNTITLED);
    expect(recordTitle({ formId: 'hh', formVersion: 1, data: {} }, [hh])).toBe(UNTITLED);
  });

  it('chỉ có khoảng trắng coi như rỗng', () => {
    expect(recordTitle({ formId: 'hh', formVersion: 1, data: { name: '   ' } }, [hh])).toBe(UNTITLED);
  });

  it('trường text đầu bị ẩn ở bản form của phiếu thì lấy trường text kế tiếp', () => {
    const v2 = form('hh', 2, [text('name', true), text('note')]);
    expect(recordTitle({ formId: 'hh', formVersion: 2, data: { name: 'Cũ', note: 'Hộ mới' } }, [hh, v2])).toBe('Hộ mới');
    // Phiếu bản 1 vẫn theo bản 1, nơi trường name chưa bị ẩn
    expect(recordTitle({ formId: 'hh', formVersion: 1, data: { name: 'Cũ', note: 'Hộ mới' } }, [hh, v2])).toBe('Cũ');
  });

  it('máy thiếu bản form của phiếu thì theo bản mới nhất cùng form', () => {
    const v3 = form('hh', 3, [text('note'), text('name')]);
    expect(recordTitle({ formId: 'hh', formVersion: 2, data: { name: 'An', note: 'Bình' } }, [hh, v3])).toBe('Bình');
  });

  it('không có form nào trên máy, hoặc form không có trường text, thì "Phiếu chưa có tên"', () => {
    expect(recordTitle({ formId: 'khac', formVersion: 1, data: { name: 'An' } }, [hh])).toBe(UNTITLED);
    const noText = form('n', 1, [{ id: 'age', type: 'number', label: 'Tuổi' }]);
    expect(recordTitle({ formId: 'n', formVersion: 1, data: { age: 3 } }, [noText])).toBe(UNTITLED);
  });
});

describe('formatEditedAt', () => {
  // Giờ địa phương, để test không phụ thuộc múi giờ máy chạy
  const now = new Date(2026, 9, 29, 9, 5);
  const at = (...args: [number, number, number, number?, number?]) => new Date(...args).toISOString();

  it('hôm nay: giờ:phút có số 0 đứng trước', () => {
    expect(formatEditedAt(at(2026, 9, 29, 14, 32), now)).toBe('14:32');
    expect(formatEditedAt(at(2026, 9, 29, 0, 7), now)).toBe('00:07');
  });

  it('hôm qua theo lịch, kể cả lúc nửa đêm và qua đầu tháng', () => {
    expect(formatEditedAt(at(2026, 9, 28, 23, 59), now)).toBe('hôm qua');
    expect(formatEditedAt(at(2026, 9, 31, 8), new Date(2026, 10, 1, 7))).toBe('hôm qua');
  });

  it('cũ hơn trong năm: ngày/tháng; khác năm: thêm năm', () => {
    expect(formatEditedAt(at(2026, 9, 27, 10), now)).toBe('27/10');
    expect(formatEditedAt(at(2026, 0, 3), now)).toBe('03/01');
    expect(formatEditedAt(at(2025, 11, 31, 23), new Date(2026, 0, 2))).toBe('31/12/2025');
  });
});

describe('groupRecordsByForm', () => {
  const row = (id: string, formId: string, updatedAt: string) => ({ id, r: { formId, updatedAt } });
  const forms = [form('a', 1, [], 'Hộ gia đình'), form('b', 1, [], 'Trường học'), form('a', 2, [], 'Hộ gia đình v2')];

  it('nhóm theo thứ tự thẻ form, tên bản mới nhất; trong nhóm phiếu sửa sau lên trước', () => {
    const groups = groupRecordsByForm(
      [
        row('b1', 'b', '2026-10-29T01:00:00.000Z'),
        row('a1', 'a', '2026-10-28T01:00:00.000Z'),
        row('a2', 'a', '2026-10-29T02:00:00.000Z'),
      ],
      forms,
    );
    expect(groups.map((g) => [g.formId, g.title, g.formIndex, g.rows.map((x) => x.id)])).toEqual([
      ['a', 'Hộ gia đình v2', 0, ['a2', 'a1']],
      ['b', 'Trường học', 1, ['b1']],
    ]);
  });

  it('form không có phiếu (hoặc bị lọc hết) không thành nhóm', () => {
    expect(groupRecordsByForm([row('b1', 'b', '2026-10-29T01:00:00.000Z')], forms).map((g) => g.formId)).toEqual(['b']);
    expect(groupRecordsByForm([], forms)).toEqual([]);
  });

  it('phiếu có form không còn trên máy dồn vào mục cuối', () => {
    const groups = groupRecordsByForm(
      [
        row('x1', 'x', '2026-10-27T01:00:00.000Z'),
        row('a1', 'a', '2026-10-28T01:00:00.000Z'),
        row('y1', 'y', '2026-10-29T01:00:00.000Z'),
      ],
      forms,
    );
    expect(groups.map((g) => [g.formId, g.title, g.formIndex, g.rows.map((x) => x.id)])).toEqual([
      ['a', 'Hộ gia đình v2', 0, ['a1']],
      [null, MISSING_FORM_TITLE, -1, ['y1', 'x1']],
    ]);
  });
});

// Vẽ theo trang (tech-debt N33): mỗi nhóm 200 phiếu đầu, bấm "Xem thêm phiếu" thì thêm một trang.
describe('pageGroups', () => {
  const group = (formId: string | null, n: number): RecordGroup<number> => ({
    formId,
    title: formId ?? MISSING_FORM_TITLE,
    formIndex: formId === null ? -1 : 0,
    rows: Array.from({ length: n }, (_, i) => i),
  });

  it('mặc định mỗi nhóm vẽ một trang 200 phiếu đầu, đếm số còn lại, rows giữ đủ', () => {
    const [g] = pageGroups([group('hh', 450)], new Map());
    expect(RECORD_PAGE_SIZE).toBe(200);
    expect(g?.visible).toHaveLength(200);
    expect(g?.visible[0]).toBe(0);
    expect(g?.visible[199]).toBe(199);
    expect(g?.hidden).toBe(250);
    expect(g?.rows).toHaveLength(450);
  });

  it('nhóm ít hơn một trang thì vẽ hết, không còn phiếu ẩn; đúng 200 cũng vậy', () => {
    const [small, exact] = pageGroups([group('a', 3), group('b', 200)], new Map());
    expect(small?.visible).toEqual([0, 1, 2]);
    expect(small?.hidden).toBe(0);
    expect(exact?.hidden).toBe(0);
  });

  it('giới hạn tính riêng từng nhóm: nhóm đầu nhiều phiếu không che nhóm sau', () => {
    const paged = pageGroups([group('a', 500), group('b', 300), group(null, 250)], new Map([['b', 400]]));
    expect(paged.map((g) => [g.formId, g.visible.length, g.hidden])).toEqual([
      ['a', 200, 300],
      ['b', 300, 0],
      [null, 200, 50],
    ]);
  });

  it('mục "Biểu mẫu chưa có trên máy" có khoá riêng', () => {
    expect(groupKey({ formId: null })).toBe('');
    const [g] = pageGroups([group(null, 450)], new Map([['', 400]]));
    expect(g?.visible).toHaveLength(400);
  });

  it('giới hạn nhỏ hơn một trang vẫn vẽ ít nhất một trang', () => {
    const [g] = pageGroups([group('a', 450)], new Map([['a', 5]]));
    expect(g?.visible).toHaveLength(200);
  });

  it('cỡ trang truyền vào được', () => {
    const [g] = pageGroups([group('a', 10)], new Map(), 4);
    expect(g?.visible).toEqual([0, 1, 2, 3]);
    expect(g?.hidden).toBe(6);
  });
});
