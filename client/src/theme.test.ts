import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrastRatio, darkOverrides, darkTokens, parseHex, resolveToken, rootTokens } from './contrast';

// Đọc thẳng file: vitest không nạp nội dung CSS qua ?raw (trả chuỗi rỗng)
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const adminStyles = readFileSync(new URL('./admin/admin.css', import.meta.url), 'utf8');

describe('contrastRatio', () => {
  it('đen trên trắng 21:1, cùng màu 1:1, không phụ thuộc thứ tự', () => {
    expect(contrastRatio('#000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('khớp giá trị đã ghi trong ui.md: chữ phụ #625f58 trên trắng 6,4:1', () => {
    expect(contrastRatio('#625f58', '#ffffff')).toBeCloseTo(6.37, 2);
  });

  it('màu không phải hex thì không đọc được', () => {
    expect(parseHex('rgba(0, 0, 0, .2)')).toBeNull();
    expect(() => contrastRatio('red', '#fff')).toThrow();
  });
});

describe('rootTokens', () => {
  it('đọc nhiều token trên một dòng, bỏ comment, giữ url() có dấu ";"', () => {
    const tokens = rootTokens(`/* x */ :root { --a: #fff; --b: var(--a); /* --c: #000; */
      --d: url("data:image/svg+xml;utf8,x"); }`);
    expect(tokens).toEqual({ a: '#fff', b: 'var(--a)', d: 'url("data:image/svg+xml;utf8,x")' });
    expect(resolveToken(tokens, 'b')).toBe('#fff');
    expect(() => resolveToken(tokens, 'c')).toThrow();
  });

  it('bảng tối lấy token sáng, khai lại thì lấy bản tối; var() tính theo bảng đã gộp', () => {
    const css = `:root { --a: #fff; --b: #000; --c: var(--b); }
      @media (prefers-color-scheme: dark) { :root { --b: #111; } }`;
    expect(rootTokens(css)).toEqual({ a: '#fff', b: '#000', c: 'var(--b)' });
    expect(darkOverrides(css)).toEqual({ b: '#111' });
    expect(resolveToken(darkTokens(css), 'c')).toBe('#111');
  });
});

// Cặp chữ (hoặc nét) / nền đang dùng trong styles.css và admin.css. Thêm màu mới thì thêm cặp ở đây.
// Ngưỡng 4,5:1 cho chữ thường (design §11.3); viền ô nhập 3:1 (thành phần giao diện, WCAG 1.4.11).
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'paper'], ['ink', 'surface'], ['ink', 'sunken'], ['ink', 'chip'], ['ink', 'hl-soft'], ['ink', 'ro-bg'],
  ['ink', 'on-fill'], // nút "Tải lại" trên dải cập nhật
  ['muted', 'paper'], ['muted', 'surface'], ['muted', 'sunken'], ['muted', 'chip'], ['muted', 'hl-soft'], ['muted', 'warn-bg'],
  ['on-fill', 'btn'], ['on-fill', 'red'],
  ['on-fill', 'd1'], ['on-fill', 'd2'], ['on-fill', 'd3'], ['on-fill', 'd4'], ['on-fill', 'd5'],
  ['on-hl', 'hl'],
  ['ink', 'f1'], ['ink', 'f2'], ['ink', 'f3'], ['ink', 'f4'], ['ink', 'f5'],
  ['red', 'surface'], ['red', 'paper'], ['red', 'red-soft'],
  ['warn-ink', 'warn-bg'], ['warn-ink', 'blocked-bg'],
  ['ok', 'surface'], ['ok', 'ok-soft'],
  ['st-draft', 'surface'], ['st-up', 'surface'],
  ['info-ink', 'info-bg'], ['owner-ink', 'owner-bg'], ['sup-ink', 'sup-bg'],
];
// Thành phần giao diện, không phải chữ (WCAG 1.4.11): viền ô nhập, vạch trái mục menu đang ở trên nền vàng
const CONTROL_PAIRS: [string, string][] = [['field', 'surface'], ['hl-bar', 'hl']];

describe.each([
  ['sáng', rootTokens(styles)],
  ['tối', darkTokens(styles)],
])('token màu %s', (_theme, tokens) => {
  const hex = (name: string) => resolveToken(tokens, name);

  it.each(TEXT_PAIRS)('--%s trên --%s ≥ 4,5:1', (fg, bg) => {
    expect(contrastRatio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CONTROL_PAIRS)('--%s trên --%s ≥ 3:1', (fg, bg) => {
    expect(contrastRatio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(3);
  });
});

// Token màu nào ở bản sáng cũng phải khai lại ở bản tối, để không còn mảng sáng giữa nền tối. Ngoại lệ có chủ ý:
// chữ trên vàng nhấn giữ tối ở cả hai chế độ (vàng giữ sáng)
describe('bảng màu tối đủ token', () => {
  const SAME_IN_DARK = new Set(['on-hl']);
  const isColor = (value: string) => /^(#|rgba?\(|url\()/.test(value);

  it('mọi token màu sáng đều có bản tối', () => {
    const light = rootTokens(styles);
    const dark = darkOverrides(styles);
    const missing = Object.keys(light).filter((name) => isColor(light[name] ?? '') && !SAME_IN_DARK.has(name) && !(name in dark));
    expect(missing).toEqual([]);
  });
});

// Màu chỉ khai ở :root (sáng và tối), nơi khác dùng var(): bảng màu tối đổi token là đủ, không sót mảng sáng
describe('không có màu hex ngoài :root', () => {
  const outsideRoot = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:root\s*\{[^}]*\}/g, '');

  it.each([
    ['styles.css', styles],
    ['admin.css', adminStyles],
  ])('%s', (_name, css) => {
    expect(outsideRoot(css).match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
});
