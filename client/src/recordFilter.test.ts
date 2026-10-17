import { describe, expect, it } from 'vitest';
import { RECORD_FILTERS, matchesFilter, needsAttention } from './recordFilter';
import type { DisplayKind } from './sync/displayState';

// Bộ lọc trạng thái của danh sách phiếu (design §4.8): Tất cả, Cần xử lý, Chưa đồng bộ, Nháp, Lỗi.

const ALL_KINDS: DisplayKind[] = ['draft', 'pending', 'synced', 'conflict', 'error', 'uploading', 'photo-error'];
const pick = (filter: (typeof RECORD_FILTERS)[number]['id']) => ALL_KINDS.filter((k) => matchesFilter(k, filter));

describe('matchesFilter', () => {
  it('đủ năm lựa chọn theo đúng thứ tự §4.8', () => {
    expect(RECORD_FILTERS.map((f) => f.label)).toEqual(['Tất cả', 'Cần xử lý', 'Chưa đồng bộ', 'Nháp', 'Lỗi']);
  });

  it('Tất cả: mọi trạng thái', () => {
    expect(pick('all')).toEqual(ALL_KINDS);
  });

  it('Cần xử lý: xung đột và lỗi (kể cả lỗi ảnh), những gì người dùng phải làm gì đó', () => {
    expect(pick('attention')).toEqual(['conflict', 'error', 'photo-error']);
  });

  it('Chưa đồng bộ: chờ đồng bộ và còn ảnh đang tải', () => {
    expect(pick('unsynced')).toEqual(['pending', 'uploading']);
  });

  it('Nháp, Lỗi', () => {
    expect(pick('draft')).toEqual(['draft']);
    expect(pick('error')).toEqual(['error', 'photo-error']);
  });
});

describe('needsAttention', () => {
  it('khớp với bộ lọc Cần xử lý', () => {
    for (const k of ALL_KINDS) expect(needsAttention(k)).toBe(matchesFilter(k, 'attention'));
  });
});
