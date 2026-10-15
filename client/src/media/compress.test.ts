import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_EDGE } from './compress';

// Kích thước sau nén: cạnh dài tối đa 1600 px, giữ tỉ lệ (design §4.4).
describe('fitWithin', () => {
  it('ảnh ngang lớn: cạnh dài về đúng 1600, giữ tỉ lệ', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it('ảnh dọc lớn: cạnh dài là chiều cao', () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('ảnh đã nhỏ hơn giới hạn thì giữ nguyên, không phóng to', () => {
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(MAX_EDGE, 900)).toEqual({ width: MAX_EDGE, height: 900 });
  });

  it('làm tròn về số nguyên và không bao giờ về 0', () => {
    expect(fitWithin(4001, 3001)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(20000, 3)).toEqual({ width: 1600, height: 1 });
  });

  it('nhận giới hạn khác', () => {
    expect(fitWithin(1000, 500, 100)).toEqual({ width: 100, height: 50 });
  });
});
