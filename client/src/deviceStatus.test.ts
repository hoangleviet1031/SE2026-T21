import { describe, expect, it } from 'vitest';
import { deviceStatus } from './deviceStatus';

describe('deviceStatus', () => {
  it('nhiều phiên bản của một form chỉ tính một biểu mẫu', () => {
    const forms = [
      { id: 'household', version: 1 },
      { id: 'household', version: 2 },
      { id: 'farm', version: 1 },
    ];
    expect(deviceStatus(forms, 0).formCount).toBe(2);
  });

  it('chưa có form nào thì 0 biểu mẫu', () => {
    expect(deviceStatus([], 0)).toEqual({ formCount: 0, pendingOps: 0 });
  });

  it('số thay đổi chờ gửi là số op trong outbox', () => {
    expect(deviceStatus([{ id: 'household', version: 1 }], 3).pendingOps).toBe(3);
  });
});
