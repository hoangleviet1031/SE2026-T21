import { describe, expect, it } from 'vitest';
import type { AccountProject } from '../db/accountDb';
import { mergeMeIntoProjects, projectsToSync } from './accountSync';

const saved = (p: Partial<AccountProject> & { id: string }): AccountProject => ({
  name: p.id,
  role: 'surveyor',
  status: 'active',
  needsAttention: 0,
  unsynced: 0,
  ...p,
});

describe('mergeMeIntoProjects', () => {
  it('thêm dự án mới từ /me với số đếm 0', () => {
    expect(mergeMeIntoProjects([], [{ id: 'a', name: 'A', role: 'supervisor' }])).toEqual([
      { id: 'a', name: 'A', role: 'supervisor', status: 'active', needsAttention: 0, unsynced: 0 },
    ]);
  });

  it('cập nhật tên và vai trò, giữ số đếm đã lưu', () => {
    const result = mergeMeIntoProjects(
      [saved({ id: 'a', name: 'Cũ', role: 'surveyor', needsAttention: 2, unsynced: 5 })],
      [{ id: 'a', name: 'Mới', role: 'supervisor' }],
    );
    expect(result).toEqual([
      { id: 'a', name: 'Mới', role: 'supervisor', status: 'active', needsAttention: 2, unsynced: 5 },
    ]);
  });

  it('dự án không còn trong /me thành removed, giữ nguyên thông tin và số đếm', () => {
    const old = saved({ id: 'b', name: 'B', unsynced: 3 });
    expect(mergeMeIntoProjects([old], [])).toEqual([{ ...old, status: 'removed' }]);
  });

  it('dự án đã removed quay lại /me thì active lại', () => {
    const result = mergeMeIntoProjects([saved({ id: 'b', status: 'removed' })], [{ id: 'b', name: 'B', role: 'surveyor' }]);
    expect(result[0]?.status).toBe('active');
  });
});

describe('projectsToSync', () => {
  const list = [saved({ id: 'a' }), saved({ id: 'b' }), saved({ id: 'c', status: 'removed' }), saved({ id: 'd' })];

  it('chỉ dự án active, dự án đang chọn đứng đầu, còn lại giữ thứ tự', () => {
    expect(projectsToSync(list, 'd')).toEqual(['d', 'a', 'b']);
  });

  it('dự án đang chọn không active thì không đồng bộ nó', () => {
    expect(projectsToSync(list, 'c')).toEqual(['a', 'b', 'd']);
  });
});
