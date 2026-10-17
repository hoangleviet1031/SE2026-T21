import { describe, expect, it } from 'vitest';
import type { AccountProject } from './db/accountDb';
import { canManageProject, projectSubtitle, resolveCurrentProjectId } from './projects';

function project(id: string, over: Partial<AccountProject> = {}): AccountProject {
  return { id, name: id, role: 'surveyor', status: 'active', needsAttention: 0, unsynced: 0, ...over };
}

describe('resolveCurrentProjectId', () => {
  const a = project('a');
  const b = project('b');

  it('giữ dự án đã chọn nếu còn active', () => {
    expect(resolveCurrentProjectId([a, b], 'b')).toBe('b');
  });

  it('chưa chọn lần nào thì lấy dự án active đầu tiên', () => {
    expect(resolveCurrentProjectId([a, b], null)).toBe('a');
  });

  it('dự án đã chọn không còn trong danh sách thì lấy dự án active đầu tiên', () => {
    expect(resolveCurrentProjectId([a, b], 'x')).toBe('a');
  });

  it('dự án đã chọn đã rời thì chuyển sang dự án active, bỏ qua dự án đã rời đứng trước', () => {
    const removed = project('r', { status: 'removed' });
    expect(resolveCurrentProjectId([removed, a], 'r')).toBe('a');
  });

  it('không còn dự án active nào thì null', () => {
    expect(resolveCurrentProjectId([], null)).toBeNull();
    expect(resolveCurrentProjectId([project('r', { status: 'removed' })], 'r')).toBeNull();
  });
});

describe('projectSubtitle', () => {
  it('chỉ có vai trò khi không có gì cần làm', () => {
    expect(projectSubtitle(project('a', { role: 'supervisor' }))).toBe('Giám sát viên');
  });

  it('kèm số cần xử lý và chưa đồng bộ khi khác 0', () => {
    expect(projectSubtitle(project('a', { needsAttention: 1, unsynced: 4 }))).toBe(
      'Điều tra viên · 1 cần xử lý · 4 chưa đồng bộ',
    );
    expect(projectSubtitle(project('a', { unsynced: 4 }))).toBe('Điều tra viên · 4 chưa đồng bộ');
  });
});

describe('canManageProject', () => {
  it('giám sát viên và Owner; điều tra viên thì không (ADR 0003 §2)', () => {
    expect(canManageProject('supervisor')).toBe(true);
    expect(canManageProject('owner')).toBe(true);
    expect(canManageProject('surveyor')).toBe(false);
  });
});
