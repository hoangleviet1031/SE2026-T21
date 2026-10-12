import type { OutboxOp } from '../db/projectDb';

// Cảnh báo op tồn lâu ở đầu trang chủ (design §5.2, §8). Hàm thuần, nhận `now` qua tham số.
// Giờ thiết bị chỉ dùng để hiển thị, không quyết định thứ tự (CLAUDE.md bất biến 4).

const SERVER_FAILING_ATTEMPTS = 5;
const STALE_MS = 24 * 60 * 60 * 1000;

export interface StaleWarnings {
  /** Có op đang chờ retry đã thử từ 5 lần trở lên: "Máy chủ đang lỗi, sẽ thử lại" */
  serverFailing: boolean;
  /** Số phiếu có thay đổi chưa lên server từ 24 giờ trở lên: "Có n phiếu chưa đồng bộ hơn 1 ngày" */
  staleRecords: number;
}

export function staleWarnings(ops: OutboxOp[], now: number): StaleWarnings {
  // Op failed là lỗi dữ liệu (phiếu đã hiện "Lỗi"), không phải máy chủ lỗi
  const serverFailing = ops.some((op) => op.status === 'queued' && op.attempts >= SERVER_FAILING_ATTEMPTS);
  const stale = new Set(
    ops.filter((op) => op.createdAt !== undefined && now - op.createdAt >= STALE_MS).map((op) => op.recordId),
  );
  return { serverFailing, staleRecords: stale.size };
}
