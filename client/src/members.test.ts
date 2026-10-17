import { describe, expect, it } from 'vitest';
import type { Member, Role } from '@field-survey/shared';
import { assignableRoles, confirmText, memberActions } from './members';

const member = (userId: string, role: Role): Member => ({
  userId,
  username: userId.replace('u_', ''),
  name: userId.toUpperCase(),
  role,
  addedAt: '2026-10-17T00:00:00.000Z',
});

describe('assignableRoles', () => {
  it('supervisor chỉ chọn được Điều tra viên; Owner chọn được mọi vai trò', () => {
    expect(assignableRoles('supervisor')).toEqual(['surveyor']);
    expect(assignableRoles('owner')).toEqual(['surveyor', 'supervisor', 'owner']);
    expect(assignableRoles('surveyor')).toEqual([]);
  });
});

describe('memberActions (ADR 0003 §2)', () => {
  it('supervisor: chỉ rút được điều tra viên, không đổi vai trò được ai', () => {
    expect(memberActions('supervisor', member('u_minh', 'surveyor'))).toEqual({ changeTo: [], canRemove: true });
    expect(memberActions('supervisor', member('u_chu', 'owner'))).toEqual({ changeTo: [], canRemove: false });
  });

  it('supervisor không có thao tác ở dòng supervisor, kể cả dòng của mình', () => {
    expect(memberActions('supervisor', member('u_lan', 'supervisor'))).toEqual({ changeTo: [], canRemove: false });
  });

  it('Owner: đổi sang mọi vai trò khác vai trò hiện tại, rút được mọi người kể cả mình', () => {
    expect(memberActions('owner', member('u_lan', 'supervisor'))).toEqual({
      changeTo: ['surveyor', 'owner'],
      canRemove: true,
    });
    expect(memberActions('owner', member('u_chu', 'owner'))).toEqual({
      changeTo: ['surveyor', 'supervisor'],
      canRemove: true,
    });
  });
});

describe('confirmText', () => {
  it('rút người khác: hỏi kèm tên và tên đăng nhập', () => {
    expect(confirmText('u_chu', member('u_minh', 'surveyor'), null)).toBe('Rút U_MINH (minh) khỏi tổ chức?');
  });

  it('đổi vai trò người khác: không hỏi', () => {
    expect(confirmText('u_chu', member('u_minh', 'surveyor'), 'supervisor')).toBeNull();
  });

  it('tự rút, tự hạ: nói rõ mất quyền ngay', () => {
    expect(confirmText('u_chu', member('u_chu', 'owner'), null)).toContain('rời tổ chức này ngay');
    expect(confirmText('u_chu', member('u_chu', 'owner'), 'supervisor')).toBe(
      'Bạn sẽ mất quyền Owner ngay, chỉ còn quyền Giám sát viên. Tiếp tục?',
    );
  });
});
