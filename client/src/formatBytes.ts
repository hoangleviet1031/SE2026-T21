// Hiện dung lượng ở trang Cài đặt (design §4.2): kiểu Việt Nam, dấu phẩy thập phân.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '?';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${UNITS[unit]}`;
}

// Độ dài thanh dung lượng ở Cài đặt. Trình duyệt không báo hạn mức (quota 0 hoặc không có) thì không có
// gì để so nên không vẽ thanh; chữ "Đã dùng … / …" vẫn hiện. Kẹp 0–100 vì usage có thể vượt quota báo về.
export function usagePercent(usage: number, quota: number | undefined): number | null {
  if (quota === undefined || !Number.isFinite(quota) || quota <= 0) return null;
  if (!Number.isFinite(usage) || usage <= 0) return 0;
  return Math.min(100, (usage / quota) * 100);
}

// Cảnh báo "Bộ nhớ gần đầy" ở Cài đặt (design §4.2): hết hạn mức thì mọi lần ghi IndexedDB đều lỗi, nên báo
// trước khi tới đó. Không có hạn mức thì không biết gần đầy hay chưa, không cảnh báo (cùng lý do không vẽ thanh).
export const STORAGE_WARN_PERCENT = 80;

export function storageNearlyFull(usage: number, quota: number | undefined): boolean {
  const percent = usagePercent(usage, quota);
  return percent !== null && percent >= STORAGE_WARN_PERCENT;
}
