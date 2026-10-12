// JSON với khoá object sắp theo thứ tự chữ ở mọi tầng: cùng nội dung thì cùng chuỗi, bất kể
// client gửi khoá theo thứ tự nào. Dùng cho request_hash (ADR 0001 quy tắc 3).
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    out[k] = sortKeys(v);
  }
  return out;
}
