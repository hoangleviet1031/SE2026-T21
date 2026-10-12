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
