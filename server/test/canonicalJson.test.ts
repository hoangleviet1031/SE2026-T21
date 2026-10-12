import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/canonicalJson';

// JSON chuẩn hoá cho request_hash (ADR 0001 quy tắc 3): cùng nội dung thì cùng chuỗi,
// bất kể thứ tự khoá client gửi.
describe('canonicalJson', () => {
  it('sắp khoá object theo thứ tự chữ, ở mọi tầng', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: null } })).toBe('{"a":{"c":null,"d":[1,2]},"b":1}');
  });

  it('cùng nội dung khác thứ tự khoá cho cùng kết quả', () => {
    expect(canonicalJson({ x: 1, y: { p: 'a', q: 'b' } })).toBe(canonicalJson({ y: { q: 'b', p: 'a' }, x: 1 }));
  });

  it('giữ thứ tự phần tử mảng (mảng khác thứ tự là nội dung khác)', () => {
    expect(canonicalJson(['b', 'a'])).not.toBe(canonicalJson(['a', 'b']));
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('giá trị đơn và khoá undefined giống JSON.stringify', () => {
    expect(canonicalJson('chuỗi')).toBe('"chuỗi"');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});
