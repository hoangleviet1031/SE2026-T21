import { describe, expect, it } from 'vitest';
import { dropIndex, shiftFor, slotTop, type RowBox } from './fieldDrag';

// Ba dòng cao 52, kẻ 1 px giữa các dòng: điểm giữa ở 26, 79, 132
const rows: RowBox[] = [
  { top: 0, height: 52 },
  { top: 53, height: 52 },
  { top: 106, height: 52 },
];

describe('dropIndex', () => {
  it('kéo lên trên dòng đầu → 0; kéo xuống dưới dòng cuối → cuối', () => {
    expect(dropIndex(-40, rows, 2)).toBe(0);
    expect(dropIndex(400, rows, 0)).toBe(2);
  });

  it('nằm giữa hai dòng thì chen vào giữa', () => {
    // Kéo dòng cuối lên, tâm ở 60: qua điểm giữa dòng 0 (26), chưa qua dòng 1 (79)
    expect(dropIndex(60, rows, 2)).toBe(1);
    // Kéo dòng đầu xuống, tâm ở 100: qua dòng 1 (79), chưa qua dòng 2 (132)
    expect(dropIndex(100, rows, 0)).toBe(1);
  });

  it('đúng ranh giới nửa dòng thì chưa đổi, qua một chút mới đổi', () => {
    expect(dropIndex(79, rows, 0)).toBe(0);
    expect(dropIndex(79.5, rows, 0)).toBe(1);
  });

  it('không kéo qua dòng nào thì vẫn chỗ cũ', () => {
    expect(dropIndex(80, rows, 1)).toBe(1);
  });
});

describe('shiftFor', () => {
  it('kéo xuống: các dòng giữa dịch lên một dòng (cả đường kẻ), dòng khác đứng yên', () => {
    expect([0, 1, 2].map((i) => shiftFor(i, 0, 2, rows))).toEqual([0, -53, -53]);
  });

  it('kéo lên: các dòng giữa dịch xuống', () => {
    expect([0, 1, 2].map((i) => shiftFor(i, 2, 0, rows))).toEqual([53, 53, 0]);
  });

  it('thả lại chỗ cũ: không dòng nào dịch', () => {
    expect([0, 1, 2].map((i) => shiftFor(i, 1, 1, rows))).toEqual([0, 0, 0]);
  });
});

describe('slotTop', () => {
  it('ô kẻ sọc nằm đúng chỗ dòng sẽ đứng sau khi thả', () => {
    expect(slotTop(2, 0, rows)).toBe(0);
    expect(slotTop(0, 2, rows)).toBe(106);
    expect(slotTop(1, 1, rows)).toBe(53);
  });
});
