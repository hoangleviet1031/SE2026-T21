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

// Bổ sung sau khi thử đột biến (docs/mutation.md): mỗi ca bắt một đột biến còn sống ở lần chạy đầu.
// Ca kiểm hành vi hiện có của threeWayMerge, không đổi ngữ nghĩa (CLAUDE.md bất biến 8).
describe('threeWayMerge: ca bổ sung sau thử đột biến', () => {
  const base = { name: 'An', age: 30, tags: ['a', 'b'] };

  it('M1: null và trường không có coi là như nhau (trường bị xoá trắng)', () => {
    const r = threeWayMerge(base, { ...base, note: null }, base);
    expect(r.conflicts).toEqual([]);
    expect(r.autoResolved).toEqual([]);
  });

  it('M2: bỏ bớt một lựa chọn là sửa, dù phần còn lại trùng', () => {
    const r = threeWayMerge(base, { ...base, tags: ['a'] }, base);
    expect(r.merged.tags).toEqual(['a']);
    expect(r.autoResolved).toEqual([{ field: 'tags', takenFrom: 'local' }]);
  });

  it('M4: hai toạ độ GPS khác nhau ở cùng trường là xung đột', () => {
    const gps = { lat: 21.0, lng: 105.8, accuracy: 10 };
    const r = threeWayMerge(
      { ...base, gps },
      { ...base, gps: { ...gps, lat: 21.1 } },
      { ...base, gps: { ...gps, lat: 21.2 } },
    );
    expect(r.conflicts.map((c) => c.field)).toEqual(['gps']);
  });

  it('M8: trường xung đột tạm giữ giá trị server cho tới khi người dùng chọn', () => {
    const r = threeWayMerge(base, { ...base, age: 32 }, { ...base, age: 33 });
    expect(r.merged.age).toBe(33);
  });

  it('M9: client xoá trường, server không đổi: trường không còn trong merged', () => {
    const { age: _age, ...withoutAge } = base;
    const r = threeWayMerge(base, withoutAge, base);
    expect('age' in r.merged).toBe(false);
    expect(r.autoResolved).toEqual([{ field: 'age', takenFrom: 'local' }]);
  });
});

describe('detectDeleteConflict: ca bổ sung sau thử đột biến', () => {
  it('M13: hai bên cùng xoá thì không xung đột, kể cả khi server đã sửa trước khi xoá', () => {
    const base = { name: 'An' };
    expect(detectDeleteConflict(base, { data: base, deleted: true }, { data: { name: 'B' }, deleted: true })).toBe('none');
  });
});

describe('nextRetryDelay', () => {
  it('tăng theo luỹ thừa và có trần', () => {
    expect(nextRetryDelay(0, () => 1)).toBe(1000);
    expect(nextRetryDelay(3, () => 1)).toBe(8000);
    expect(nextRetryDelay(20, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(nextRetryDelay(3, () => 0)).toBe(4000);
  });

  it('M17: trần là 5 phút như design §5.4', () => {
    // Ghi số thẳng thay vì BACKOFF_MAX_MS: so với hằng thì đổi hằng sai test vẫn xanh
    expect(nextRetryDelay(30, () => 1)).toBe(5 * 60_000);
    expect(nextRetryDelay(30, () => 0)).toBe(150_000);
  });
});
