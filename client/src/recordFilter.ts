import type { DisplayKind } from './sync/displayState';

// Bộ lọc trạng thái của danh sách phiếu (design §4.8). Lọc theo nhãn hiển thị (sync/displayState.ts),
// không theo syncState thô: phiếu đã đồng bộ mà còn ảnh lỗi vẫn là "Cần xử lý".

export const RECORD_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'attention', label: 'Cần xử lý' },
  { id: 'unsynced', label: 'Chưa đồng bộ' },
  { id: 'draft', label: 'Nháp' },
  { id: 'error', label: 'Lỗi' },
] as const;

export type RecordFilter = (typeof RECORD_FILTERS)[number]['id'];

const KINDS: Record<Exclude<RecordFilter, 'all'>, DisplayKind[]> = {
  // Người dùng phải làm gì đó: chọn giá trị xung đột, thử lại hoặc bỏ thứ máy chủ từ chối.
  attention: ['conflict', 'error', 'photo-error'],
  unsynced: ['pending', 'uploading'],
  draft: ['draft'],
  error: ['error', 'photo-error'],
};

export function matchesFilter(kind: DisplayKind, filter: RecordFilter): boolean {
  return filter === 'all' || KINDS[filter].includes(kind);
}

/** Số "Cần xử lý" ở đầu trang (§4.8) đếm đúng những phiếu bộ lọc "Cần xử lý" hiện ra. */
export function needsAttention(kind: DisplayKind): boolean {
  return matchesFilter(kind, 'attention');
}
