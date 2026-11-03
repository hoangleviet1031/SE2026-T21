import { describe, expect, it } from 'vitest';
import type { Member, Role } from '@field-survey/shared';
import {
  addInOrder,
  addLineText,
  addManyConfirmText,
  addSummaryText,
  assignableRoles,
  confirmText,
  memberActions,
  namesToKeep,
  parseUsernameList,
  tooManyNamesText,
  type AddLine,
  type MemberErrorCode,
} from './members';
import type { MemberResult } from './sync/api';

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

describe('parseUsernameList', () => {
  it('tách theo xuống dòng, phẩy, chấm phẩy, tab; bỏ dòng trống; chuẩn hoá như server', () => {
    expect(parseUsernameList(' Lan\r\n\nMINH,hoa;  tuan\tan.nguyen\n').names).toEqual([
      'lan',
      'minh',
      'hoa',
      'tuan',
      'an.nguyen',
    ]);
  });

  it('không tách theo khoảng trắng: họ tên đầy đủ là một mục, không thành ba tên', () => {
    expect(parseUsernameList('Nguyen Van An').names).toEqual(['nguyen van an']);
  });

  it('tên trùng (kể cả khác hoa thường) gửi một lần và đếm số bị bỏ', () => {
    expect(parseUsernameList('lan\nLAN, lan\nminh')).toEqual({ names: ['lan', 'minh'], duplicates: 2 });
  });

  it('bóc câu của tin chia sẻ ở từng mục, không kể hoa thường', () => {
    expect(parseUsernameList('Tên đăng nhập của tôi: lan\nTÊN ĐĂNG NHẬP CỦA TÔI: minh\nhoa').names).toEqual([
      'lan',
      'minh',
      'hoa',
    ]);
  });

  it('chỉ có dấu phân cách hoặc chỉ có câu chia sẻ: không có tên nào', () => {
    expect(parseUsernameList(' ,;\n\t ').names).toEqual([]);
    expect(parseUsernameList('Tên đăng nhập của tôi:').names).toEqual([]);
    expect(parseUsernameList('Tên đăng nhập của tôi:   ').names).toEqual([]);
  });
});

describe('addInOrder', () => {
  const fail = (error: MemberErrorCode): MemberResult<unknown> => ({ ok: false, error });
  const ok: MemberResult<unknown> = { ok: true, value: undefined };
  const failureText = (err: unknown) => {
    if (err instanceof Error && err.message === 'mạng') return 'câu mất mạng';
    throw err;
  };

  it('gửi lần lượt, chờ tên trước xong mới gửi tên sau', async () => {
    const order: string[] = [];
    let running = 0;
    const { lines, stopReason } = await addInOrder(
      ['a', 'b', 'c'],
      async (u) => {
        expect(running).toBe(0);
        running += 1;
        order.push(u);
        await Promise.resolve();
        running -= 1;
        return ok;
      },
      failureText,
    );
    expect(order).toEqual(['a', 'b', 'c']);
    expect(stopReason).toBeNull();
    expect(lines.every((l) => l.kind === 'added')).toBe(true);
  });

  it.each<MemberErrorCode>(['not_found', 'already_member', 'admin_account', 'invalid_body'])(
    'lỗi riêng một tên (%s): ghi lỗi, đi tiếp',
    async (code) => {
      const sent: string[] = [];
      const { lines, stopReason } = await addInOrder(
        ['a', 'b'],
        async (u) => {
          sent.push(u);
          return u === 'a' ? fail(code) : ok;
        },
        failureText,
      );
      expect(sent).toEqual(['a', 'b']);
      expect(stopReason).toBeNull();
      expect(lines).toEqual([
        { username: 'a', kind: 'failed', error: code },
        { username: 'b', kind: 'added' },
      ]);
    },
  );

  it('forbidden: dừng, tên đó và các tên sau là chưa gửi', async () => {
    const sent: string[] = [];
    const { lines, stopReason } = await addInOrder(
      ['a', 'b', 'c'],
      async (u) => {
        sent.push(u);
        return u === 'b' ? fail('forbidden') : ok;
      },
      failureText,
    );
    expect(sent).toEqual(['a', 'b']);
    expect(stopReason).toBe('Bạn không có quyền làm việc này');
    expect(lines.map((l) => l.kind)).toEqual(['added', 'unsent', 'unsent']);
  });

  it('lỗi chung (mạng, máy chủ, hết phiên, không còn thành viên) ném từ API: dừng, không gửi tiếp', async () => {
    const sent: string[] = [];
    const { lines, stopReason } = await addInOrder(
      ['a', 'b', 'c'],
      async (u) => {
        sent.push(u);
        if (u === 'b') throw new Error('mạng');
        return ok;
      },
      failureText,
    );
    expect(sent).toEqual(['a', 'b']);
    expect(stopReason).toBe('câu mất mạng');
    expect(lines.map((l) => l.kind)).toEqual(['added', 'unsent', 'unsent']);
  });

  it('lỗi lập trình: ném tiếp, không biến thành câu báo', async () => {
    const bug = new TypeError('lỗi lập trình');
    await expect(
      addInOrder(
        ['a'],
        async () => {
          throw bug;
        },
        failureText,
      ),
    ).rejects.toBe(bug);
  });
});

describe('kết quả thêm nhiều người', () => {
  const lines: AddLine[] = [
    { username: 'ok', kind: 'added' },
    { username: 'sai', kind: 'failed', error: 'not_found' },
    { username: 'co.roi', kind: 'failed', error: 'already_member' },
    { username: 'admin', kind: 'failed', error: 'admin_account' },
    { username: 'sau', kind: 'unsent' },
  ];

  it('trong ô chỉ còn tên thử lại có ích', () => {
    expect(namesToKeep(lines)).toEqual(['sai', 'sau']);
  });

  it('chữ từng dòng', () => {
    expect(lines.map(addLineText)).toEqual([
      'Đã thêm',
      'Không có tên đăng nhập này',
      'Người này đã là thành viên',
      'Không thêm được tài khoản quản trị',
      'Chưa gửi',
    ]);
  });

  it('dòng tổng kết: chỉ nói tên trùng khi có', () => {
    expect(addSummaryText(lines, 0)).toBe('Đã thêm 1/5 tên.');
    expect(addSummaryText(lines, 2)).toBe('Đã thêm 1/5 tên. Bỏ 2 tên trùng.');
  });

  it('câu vượt giới hạn', () => {
    expect(tooManyNamesText(51)).toBe('Tối đa 50 tên mỗi lần, danh sách đang có 51 tên');
  });

  it('chỉ hỏi lại khi Owner và nhiều tên', () => {
    expect(addManyConfirmText(2, 'owner')).toBe('Thêm 2 người với vai trò Owner?');
    expect(addManyConfirmText(1, 'owner')).toBeNull();
    expect(addManyConfirmText(30, 'supervisor')).toBeNull();
    expect(addManyConfirmText(30, 'surveyor')).toBeNull();
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
