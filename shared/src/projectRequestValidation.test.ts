import { describe, expect, it } from 'vitest';
import {
  parseCreateProjectRequest,
  parseDecideProjectRequest,
  parseProjectRequestStatus,
} from './projectRequestValidation';

describe('parseCreateProjectRequest', () => {
  it('cắt khoảng trắng tên và ghi chú', () => {
    expect(parseCreateProjectRequest({ name: '  HTX Rau sạch ', note: ' 200 hộ ' })).toEqual({
      name: 'HTX Rau sạch',
      note: '200 hộ',
    });
  });

  it('ghi chú không bắt buộc; chỉ có khoảng trắng hoặc null thì bỏ', () => {
    expect(parseCreateProjectRequest({ name: 'A' })).toEqual({ name: 'A' });
    expect(parseCreateProjectRequest({ name: 'A', note: '   ' })).toEqual({ name: 'A' });
    expect(parseCreateProjectRequest({ name: 'A', note: null })).toEqual({ name: 'A' });
  });

  it('giới hạn độ dài: tên 100, ghi chú 500', () => {
    expect(parseCreateProjectRequest({ name: 'x'.repeat(100), note: 'y'.repeat(500) })).toBeDefined();
    expect(parseCreateProjectRequest({ name: 'x'.repeat(101) })).toBeUndefined();
    expect(parseCreateProjectRequest({ name: 'A', note: 'y'.repeat(501) })).toBeUndefined();
  });

  it('thân sai trả undefined', () => {
    for (const body of [undefined, null, [], 'A', {}, { name: '' }, { name: '   ' }, { name: 5 }, { name: 'A', note: 5 }]) {
      expect(parseCreateProjectRequest(body), JSON.stringify(body)).toBeUndefined();
    }
  });
});

describe('parseDecideProjectRequest', () => {
  it('duyệt không cần lý do, có gửi cũng bỏ qua', () => {
    expect(parseDecideProjectRequest({ decision: 'approve' })).toEqual({ decision: 'approve' });
    expect(parseDecideProjectRequest({ decision: 'approve', reason: 'ok' })).toEqual({ decision: 'approve' });
  });

  it('từ chối cần lý do đã cắt khoảng trắng, 1–500 ký tự', () => {
    expect(parseDecideProjectRequest({ decision: 'reject', reason: ' Trùng tổ chức ' })).toEqual({
      decision: 'reject',
      reason: 'Trùng tổ chức',
    });
    expect(parseDecideProjectRequest({ decision: 'reject', reason: 'x'.repeat(500) })).toBeDefined();
    for (const reason of [undefined, '', '   ', 5, 'x'.repeat(501)]) {
      expect(parseDecideProjectRequest({ decision: 'reject', reason }), String(reason)).toBeUndefined();
    }
  });

  it('decision lạ hoặc thân sai trả undefined', () => {
    for (const body of [undefined, {}, { decision: 'yes' }, [], 'approve']) {
      expect(parseDecideProjectRequest(body), JSON.stringify(body)).toBeUndefined();
    }
  });
});

describe('parseProjectRequestStatus', () => {
  it('không có thì pending; nhận đúng bốn trạng thái', () => {
    expect(parseProjectRequestStatus(undefined)).toBe('pending');
    for (const s of ['pending', 'approved', 'rejected', 'cancelled']) expect(parseProjectRequestStatus(s)).toBe(s);
  });

  it('giá trị lạ trả undefined', () => {
    for (const v of ['', 'PENDING', 'all', ['pending'], 1]) expect(parseProjectRequestStatus(v)).toBeUndefined();
  });
});
