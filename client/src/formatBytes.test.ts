import { describe, expect, it } from 'vitest';
import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1,0 KB'],
    [1.2 * 1024 * 1024, '1,2 MB'],
    [2 * 1024 ** 3, '2,0 GB'],
    [5 * 1024 ** 5, '5.120,0 TB'],
  ])('%d byte → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('giá trị lạ %d → ?', (bytes) => {
    expect(formatBytes(bytes)).toBe('?');
  });
});
