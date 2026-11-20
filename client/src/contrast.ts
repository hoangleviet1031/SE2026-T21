// Tính độ tương phản theo WCAG 2.1 và đọc token màu từ styles.css, để unit test giữ mọi cặp chữ/nền
// ≥ 4,5:1 (design §11.3) khi đổi màu, kể cả bảng màu tối sau này. Hàm thuần, không phụ thuộc trình duyệt.

/** "#rgb" hoặc "#rrggbb" → [r, g, b] 0–255; không phải màu hex đặc thì trả null (vd. rgba, url) */
export function parseHex(value: string): [number, number, number] | null {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
  if (digits === undefined) return null;
  const hex = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Tỉ lệ tương phản 1–21 giữa hai màu hex; thứ tự hai màu không quan trọng */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) throw new Error(`Không phải màu hex: ${a}, ${b}`);
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Token `--tên: giá trị` trong khối `:root { … }` đầu tiên của CSS (bỏ comment), tức bảng màu sáng */
export function rootTokens(css: string): Record<string, string> {
  return parseTokens(/:root\s*\{([^}]*)\}/.exec(stripComments(css))?.[1]);
}

/** Chỉ các token khai lại trong khối `:root[data-theme="dark"] { … }` */
export function darkOverrides(css: string): Record<string, string> {
  return parseTokens(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(stripComments(css))?.[1]);
}

/** Bảng màu tối như trình duyệt thấy: token sáng, khai lại thì lấy bản tối (var() tính theo bảng đã gộp) */
export function darkTokens(css: string): Record<string, string> {
  return { ...rootTokens(css), ...darkOverrides(css) };
}

function parseTokens(block: string | undefined): Record<string, string> {
  if (block === undefined) return {};
  const tokens: Record<string, string> = {};
  // Giá trị có thể chứa ";" trong url("…"), nên cắt theo khai báo chứ không theo dấu ";"
  for (const [, name, value] of block.matchAll(/--([\w-]+)\s*:\s*((?:url\("[^"]*"\)|[^;])+);/g)) {
    if (name !== undefined && value !== undefined) tokens[name] = value.trim();
  }
  return tokens;
}

/** Giá trị cuối của token, đi theo var(--…) lồng nhau; không có token thì ném lỗi */
export function resolveToken(tokens: Record<string, string>, name: string): string {
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current)) throw new Error(`Token vòng lặp: --${name}`);
    seen.add(current);
    const value = tokens[current];
    if (value === undefined) throw new Error(`Không có token --${current}`);
    const ref = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
    if (ref === undefined) return value;
    current = ref;
  }
}
