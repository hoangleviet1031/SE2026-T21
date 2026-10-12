import { describe, expect, it } from 'vitest';
import type { OutboxOp } from '../db/projectDb';
import { staleWarnings } from './staleWarnings';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-12T12:00:00Z');

const op = (p: Partial<OutboxOp> & { recordId: string }): OutboxOp => ({
  opId: crypto.randomUUID(),
  data: {},
  deleted: false,
  attempts: 0,
  nextAttemptAt: 0,
  status: 'queued',
  createdAt: NOW,
  ...p,
});

describe('staleWarnings', () => {
  it('không có op thì không cảnh báo', () => {
    expect(staleWarnings([], NOW)).toEqual({ serverFailing: false, staleRecords: 0 });
  });

  it('"máy chủ đang lỗi" khi có op queued thử từ 5 lần trở lên', () => {
    expect(staleWarnings([op({ recordId: 'a', attempts: 4 })], NOW).serverFailing).toBe(false);
    expect(staleWarnings([op({ recordId: 'a', attempts: 5 })], NOW).serverFailing).toBe(true);
  });

  it('op failed không tính là máy chủ lỗi (lỗi dữ liệu, đã có nhãn "Lỗi")', () => {
    expect(staleWarnings([op({ recordId: 'a', attempts: 9, status: 'failed' })], NOW).serverFailing).toBe(false);
  });

  it('đếm phiếu có op cũ nhất quá 24 giờ, mỗi phiếu tính một lần', () => {
    const ops = [
      op({ recordId: 'a', createdAt: NOW - 25 * HOUR }),
      op({ recordId: 'a', createdAt: NOW - 1 * HOUR }),
      op({ recordId: 'b', createdAt: NOW - 24 * HOUR }),
      op({ recordId: 'c', createdAt: NOW - 23 * HOUR }),
      op({ recordId: 'd', createdAt: NOW - 30 * HOUR, status: 'failed' }),
    ];
    // a (25 giờ), b (đúng 24 giờ), d (failed vẫn là chưa lên server); c chưa tới 24 giờ
    expect(staleWarnings(ops, NOW).staleRecords).toBe(3);
  });

  it('op tạo trước khi có createdAt thì bỏ qua khi tính 24 giờ', () => {
    const { createdAt: _createdAt, ...old } = op({ recordId: 'a' });
    expect(staleWarnings([old], NOW).staleRecords).toBe(0);
  });
});
