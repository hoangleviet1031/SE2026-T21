import { describe, expect, it } from 'vitest';
import type { AccountProject } from '../db/accountDb';
import { decideSignIn, mergeMeIntoProjects, needsRescope, projectsToSync, pullStateAfterPage } from './accountSync';

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

  it('chưa có dự án đang chọn thì giữ thứ tự', () => {
    expect(projectsToSync(list, null)).toEqual(['a', 'b', 'd']);
  });
});

describe('pullStateAfterPage', () => {
  it('lần pull đầu (chưa có phạm vi): nhận phạm vi của server, đi tiếp', () => {
    expect(pullStateAfterPage({ cursor: 0, scope: null }, 'own')).toEqual({ restart: false, scope: 'own' });
  });

  it('cùng phạm vi: đi tiếp', () => {
    expect(pullStateAfterPage({ cursor: 50, scope: 'all' }, 'all')).toEqual({ restart: false, scope: 'all' });
  });

  it('phạm vi rộng ra (own → all) khi cursor > 0: pull lại từ 0', () => {
    expect(pullStateAfterPage({ cursor: 50, scope: 'own' }, 'all')).toEqual({ restart: true, scope: 'all' });
  });

  it('phạm vi rộng ra khi cursor đã là 0: trang này đã từ đầu, không cần pull lại', () => {
    expect(pullStateAfterPage({ cursor: 0, scope: 'own' }, 'all')).toEqual({ restart: false, scope: 'all' });
  });

  it('phạm vi hẹp lại (all → own): giữ "all" để vòng sau còn biết máy đang có phiếu ngoài phạm vi', () => {
    expect(pullStateAfterPage({ cursor: 50, scope: 'all' }, 'own')).toEqual({ restart: false, scope: 'all' });
  });
});

describe('needsRescope', () => {
  it('chỉ khi máy đang có dữ liệu phạm vi "all" mà vai trò giờ là surveyor', () => {
    expect(needsRescope('all', 'surveyor')).toBe(true);
    expect(needsRescope('all', 'supervisor')).toBe(false);
    expect(needsRescope('own', 'surveyor')).toBe(false);
    expect(needsRescope(null, 'surveyor')).toBe(false);
  });
});

describe('needsRescope với vai trò owner (ADR 0003 §2: phạm vi pull của owner là "all")', () => {
  it('owner giữ phiếu phạm vi "all" thì không cần thu hẹp', () => {
    expect(needsRescope('all', 'owner')).toBe(false);
    expect(needsRescope('own', 'owner')).toBe(false);
    expect(needsRescope(null, 'owner')).toBe(false);
  });

  it('owner bị hạ xuống surveyor khi máy đang có phiếu phạm vi "all" thì cần thu hẹp', () => {
    expect(needsRescope('all', 'surveyor')).toBe(true);
  });
});

describe('mergeMeIntoProjects với vai trò owner', () => {
  it('nâng từ supervisor lên owner thì cập nhật vai trò, giữ số đếm', () => {
    const result = mergeMeIntoProjects(
      [saved({ id: 'a', role: 'supervisor', unsynced: 2 })],
      [{ id: 'a', name: 'A', role: 'owner' }],
    );
    expect(result).toEqual([{ id: 'a', name: 'A', role: 'owner', status: 'active', needsAttention: 0, unsynced: 2 }]);
  });
});

describe('decideSignIn (design §4.7, ADR 0003 §1, §8)', () => {
  const lan = { id: 'u_lan', isAdmin: false };
  const minh = { id: 'u_minh', isAdmin: false };
  const admin = { id: 'u_admin', isAdmin: true };

  it('tài khoản admin luôn bị chặn, kể cả máy trống hay cùng người', () => {
    expect(decideSignIn(null, admin, false)).toBe('admin');
    expect(decideSignIn({ id: 'u_admin' }, admin, false)).toBe('admin');
    expect(decideSignIn({ id: 'u_lan' }, admin, true)).toBe('admin');
  });

  it('cùng người: chỉ thay token, giữ dữ liệu dù còn phiếu chưa gửi', () => {
    expect(decideSignIn({ id: 'u_lan' }, lan, true)).toBe('same');
    expect(decideSignIn({ id: 'u_lan' }, lan, false)).toBe('same');
  });

  it('khác người, máy không còn gì chưa gửi: xoá dữ liệu người cũ rồi vào', () => {
    expect(decideSignIn({ id: 'u_lan' }, minh, false)).toBe('switch');
  });

  it('khác người, máy còn dữ liệu chưa gửi: từ chối, không xoá gì (bất biến 1, 6)', () => {
    expect(decideSignIn({ id: 'u_lan' }, minh, true)).toBe('blocked');
  });

  it('máy chưa từng biết người dùng nào: còn dữ liệu chưa gửi thì vẫn từ chối', () => {
    expect(decideSignIn(null, minh, false)).toBe('switch');
    expect(decideSignIn(null, minh, true)).toBe('blocked');
  });
});
