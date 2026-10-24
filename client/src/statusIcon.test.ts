import { describe, expect, it } from 'vitest';
import { statusIcon } from './statusIcon';

describe('statusIcon', () => {
  it('mỗi mức một hình: cần làm, đang chờ, ổn', () => {
    expect(statusIcon('draft')).toBe('draft');
    expect(statusIcon('pending')).toBe('pending');
    expect(statusIcon('uploading')).toBe('upload');
    expect(statusIcon('synced')).toBe('synced');
  });

  it('xung đột, lỗi, lỗi ảnh cùng là chấm than (gấp)', () => {
    expect(statusIcon('conflict')).toBe('alert');
    expect(statusIcon('error')).toBe('alert');
    expect(statusIcon('photo-error')).toBe('alert');
  });
});
