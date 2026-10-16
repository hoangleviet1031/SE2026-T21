import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/rateLimit';

const MIN = 60_000;

describe('createRateLimiter (ADR 0003 §1)', () => {
  it('chặn khi đã đủ số lần trong cửa sổ, chưa đủ thì không', () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 15 * MIN });
    const t0 = 1_000_000;
    expect(rl.isBlocked('lan', t0)).toBe(false);
    rl.hit('lan', t0);
    rl.hit('lan', t0 + 1);
    expect(rl.isBlocked('lan', t0 + 2)).toBe(false);
    rl.hit('lan', t0 + 2);
    expect(rl.isBlocked('lan', t0 + 3)).toBe(true);
  });

  it('mỗi khoá đếm riêng', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: MIN });
    rl.hit('lan', 0);
    expect(rl.isBlocked('lan', 1)).toBe(true);
    expect(rl.isBlocked('minh', 1)).toBe(false);
  });

  it('hết cửa sổ tính từ lần cũ nhất thì mở lại', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 15 * MIN });
    rl.hit('ip', 0);
    rl.hit('ip', 5 * MIN);
    expect(rl.isBlocked('ip', 15 * MIN - 1)).toBe(true);
    // lần ở 0 đã ra khỏi cửa sổ, còn một lần ở phút 5
    expect(rl.isBlocked('ip', 15 * MIN)).toBe(false);
    rl.hit('ip', 15 * MIN);
    expect(rl.isBlocked('ip', 15 * MIN)).toBe(true);
    expect(rl.isBlocked('ip', 20 * MIN)).toBe(false);
  });

  it('khoá không còn lần nào trong cửa sổ thì bị dọn khỏi bộ nhớ', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: MIN });
    rl.hit('a', 0);
    rl.hit('b', 0);
    expect(rl.size()).toBe(2);
    rl.sweep(MIN);
    expect(rl.size()).toBe(0);
  });
});
