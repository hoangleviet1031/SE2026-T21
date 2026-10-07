import { describe, expect, it } from 'vitest';
import { detectDeleteConflict, threeWayMerge } from './merge';
import { nextRetryDelay, BACKOFF_MAX_MS } from './backoff';

describe('threeWayMerge', () => {
  const base = { name: 'An', age: 30, tags: ['a', 'b'] };

  it('khác trường: tự gộp, không conflict', () => {
    const r = threeWayMerge(base, { ...base, name: 'Bình' }, { ...base, age: 31 });
    expect(r.conflicts).toEqual([]);
    expect(r.merged).toEqual({ name: 'Bình', age: 31, tags: ['a', 'b'] });
    expect(r.autoResolved).toEqual(
      expect.arrayContaining([
        { field: 'name', takenFrom: 'local' },
        { field: 'age', takenFrom: 'remote' },
      ]),
    );
  });

  it('cùng trường, giá trị khác: báo conflict', () => {
    const r = threeWayMerge(base, { ...base, age: 32 }, { ...base, age: 33 });
    expect(r.conflicts).toEqual([{ field: 'age', base: 30, local: 32, remote: 33 }]);
  });

  it('cùng trường, cùng giá trị: không conflict', () => {
    const r = threeWayMerge(base, { ...base, age: 40 }, { ...base, age: 40 });
    expect(r.conflicts).toEqual([]);
    expect(r.merged.age).toBe(40);
  });

  it('mảng khác thứ tự được coi là bằng nhau', () => {
    const r = threeWayMerge(base, { ...base, tags: ['b', 'a'] }, base);
    expect(r.conflicts).toEqual([]);
    expect(r.autoResolved).toEqual([]);
  });

  it('trường mới chỉ có ở một bên', () => {
    const r = threeWayMerge(base, { ...base, note: 'x' }, base);
    expect(r.merged.note).toBe('x');
  });
});

describe('detectDeleteConflict', () => {
  const base = { name: 'An' };
  it('client xoá, server đã sửa: conflict', () => {
    expect(
      detectDeleteConflict(base, { data: base, deleted: true }, { data: { name: 'B' }, deleted: false }),
    ).toBe('local-deleted-remote-edited');
  });
  it('client xoá, server không đổi: không conflict', () => {
    expect(detectDeleteConflict(base, { data: base, deleted: true }, { data: base, deleted: false })).toBe('none');
  });
  it('client sửa, server đã xoá: conflict', () => {
    expect(
      detectDeleteConflict(base, { data: { name: 'C' }, deleted: false }, { data: base, deleted: true }),
    ).toBe('local-edited-remote-deleted');
  });
});

describe('nextRetryDelay', () => {
  it('tăng theo luỹ thừa và có trần', () => {
    expect(nextRetryDelay(0, () => 1)).toBe(1000);
    expect(nextRetryDelay(3, () => 1)).toBe(8000);
    expect(nextRetryDelay(20, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(nextRetryDelay(3, () => 0)).toBe(4000);
  });
});
