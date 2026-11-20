import { formatBytes } from './formatBytes';

// Chữ và phép cộng của nút "Dọn ảnh đã tải lên" ở Cài đặt (design §4.2, §5.6; ui.md màn hình 8).
// Hàm thuần, không đụng Dexie, để unit test được; phần đọc/xoá nằm ở db/attachments.ts.

/** Số ảnh và tổng dung lượng blob, tính trên các ảnh server đã có. */
export interface PhotoTotals {
  count: number;
  bytes: number;
}

export const NO_PHOTOS: PhotoTotals = { count: 0, bytes: 0 };

export const CLEANUP_BUTTON = 'Dọn ảnh đã tải lên';
export const CLEANUP_CONFIRM_LABEL = 'Dọn ảnh';
export const CLEANUP_EMPTY_MSG = 'Chưa có ảnh đã tải lên nào trên máy.';
export const CLEANUP_FAILED_MSG = 'Không dọn được ảnh. Thử lại sau.';

export function sumPhotos(rows: readonly { blob: { size: number } }[]): PhotoTotals {
  return { count: rows.length, bytes: rows.reduce((sum, row) => sum + row.blob.size, 0) };
}

export function addTotals(a: PhotoTotals, b: PhotoTotals): PhotoTotals {
  return { count: a.count + b.count, bytes: a.bytes + b.bytes };
}

/** Nói rõ ảnh còn trên máy chủ và ảnh chưa gửi không bị đụng: người dùng xác nhận khi biết mình mất gì (bất biến 1). */
export function cleanupConfirmText(totals: PhotoTotals): string {
  return `Xoá ${totals.count} ảnh đã tải lên khỏi máy này (${formatBytes(totals.bytes)})? Ảnh vẫn còn trên máy chủ, mở lại phiếu khi có mạng thì tự tải về. Ảnh chưa gửi được giữ nguyên.`;
}

/** Dung lượng tính từ blob đã xoá: số "Đã dùng" của trình duyệt có thể chưa giảm ngay. */
export function cleanupDoneText(totals: PhotoTotals): string {
  return `Đã dọn ${totals.count} ảnh (${formatBytes(totals.bytes)}).`;
}
