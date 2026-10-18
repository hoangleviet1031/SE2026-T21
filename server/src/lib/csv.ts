// CSV cho Excel (design §4.6, §9). Hàm thuần, không I/O.
// - RFC 4180: ô có dấu phẩy, ngoặc kép hoặc xuống dòng thì bọc ngoặc kép, ngoặc kép bên trong nhân đôi;
//   dòng kết thúc bằng CRLF.
// - Chống CSV injection: ô chữ bắt đầu bằng = + - @ (thêm tab, CR theo khuyến nghị OWASP) có tiền tố '
//   để Excel không chạy như công thức. Giá trị số giữ nguyên (kể cả số âm) để Excel còn tính được.
// - BOM UTF-8 ở đầu file để Excel đọc đúng tiếng Việt.

export const BOM = '﻿';

export type Cell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Cell[][]): string {
  return BOM + rows.map((row) => `${row.map(escapeCell).join(',')}\r\n`).join('');
}
