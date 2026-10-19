import { describe, expect, it } from 'vitest';
import type { ProjectRequest } from '@field-survey/shared';
import { orgRequestBody, requestStatusText, sortRequests } from './orgs';

const req = (over: Partial<ProjectRequest>): ProjectRequest => ({
  id: 'r1',
  name: 'HTX Rau sạch',
  status: 'pending',
  createdAt: '2026-10-19T00:00:00.000Z',
  ...over,
});

describe('orgRequestBody', () => {
  it('cắt khoảng trắng; ghi chú rỗng thì không gửi', () => {
    expect(orgRequestBody('  HTX Rau sạch ', '  ')).toEqual({ body: { name: 'HTX Rau sạch' } });
    expect(orgRequestBody('HTX', ' cho xã Tân Lập ')).toEqual({ body: { name: 'HTX', note: 'cho xã Tân Lập' } });
  });

  it('tên rỗng hoặc quá 100 ký tự', () => {
    expect(orgRequestBody('   ', '')).toEqual({ error: 'Nhập tên tổ chức' });
    expect(orgRequestBody('a'.repeat(101), '')).toEqual({ error: 'Tên tổ chức tối đa 100 ký tự' });
    expect(orgRequestBody('a'.repeat(100), '')).toEqual({ body: { name: 'a'.repeat(100) } });
  });

  it('ghi chú quá 500 ký tự (sau khi cắt khoảng trắng)', () => {
    expect(orgRequestBody('HTX', 'a'.repeat(501))).toEqual({ error: 'Ghi chú tối đa 500 ký tự' });
    expect(orgRequestBody('HTX', ` ${'a'.repeat(500)} `)).toEqual({ body: { name: 'HTX', note: 'a'.repeat(500) } });
  });
});

describe('requestStatusText', () => {
  it('chữ theo từng trạng thái', () => {
    expect(requestStatusText(req({ status: 'pending' }))).toBe('Đang chờ duyệt');
    expect(requestStatusText(req({ status: 'approved', projectId: 'p-abc' }))).toBe('Đã duyệt');
    expect(requestStatusText(req({ status: 'rejected', reason: 'Trùng tên' }))).toBe('Bị từ chối: Trùng tên');
    expect(requestStatusText(req({ status: 'rejected' }))).toBe('Bị từ chối');
    expect(requestStatusText(req({ status: 'cancelled' }))).toBe('Đã huỷ');
  });
});

describe('sortRequests', () => {
  it('mới nhất trước, không đổi mảng gốc', () => {
    const list = [req({ id: 'a', createdAt: '2026-10-18T00:00:00.000Z' }), req({ id: 'b' })];
    expect(sortRequests(list).map((r) => r.id)).toEqual(['b', 'a']);
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
