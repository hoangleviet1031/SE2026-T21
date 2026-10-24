import { describe, expect, it } from 'vitest';
import { formatBytes, usagePercent } from './formatBytes';

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

describe('usagePercent', () => {
  it.each([
    [0, 1000, 0],
    [250, 1000, 25],
    [1500, 1000, 100],
    [-5, 1000, 0],
  ])('usage %d / quota %d → %d', (usage, quota, percent) => {
    expect(usagePercent(usage, quota)).toBe(percent);
  });

  it.each([0, undefined, -1, Number.NaN])('quota %s → không vẽ thanh', (quota) => {
    expect(usagePercent(100, quota)).toBeNull();
  });
});
