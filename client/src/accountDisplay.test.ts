import { describe, expect, it } from 'vitest';
import { accountUsername, initialOf, shareUsernameText } from './accountDisplay';
import { parseUsernameList } from './members';

describe('accountUsername', () => {
  it('có tên đăng nhập thì dùng tên đó', () => {
    expect(accountUsername({ id: 'u_minh', username: 'minh' })).toBe('minh');
  });

  it('user lưu từ bản cũ chưa có username → id (tài khoản cũ có username = id)', () => {
    expect(accountUsername({ id: 'u_minh' })).toBe('u_minh');
  });

  it('username rỗng → id, không hiện rỗng', () => {
    expect(accountUsername({ id: 'u_minh', username: '' })).toBe('u_minh');
  });
});

describe('shareUsernameText', () => {
  it('kèm một câu ngắn và đúng tên đăng nhập', () => {
    expect(shareUsernameText('minh')).toBe('Tên đăng nhập của tôi: minh');
  });

  it('dán đúng tin chia sẻ vào ô thêm thành viên thì ra đúng tên', () => {
    expect(parseUsernameList(shareUsernameText('Minh')).names).toEqual(['minh']);
  });
});

describe('initialOf', () => {
  it('chữ đầu của tên, viết hoa, bỏ khoảng trắng đầu', () => {
    expect(initialOf('  y tế xã Tân Lập')).toBe('Y');
    expect(initialOf('đội khảo sát')).toBe('Đ');
  });

  it('tên rỗng → chuỗi rỗng', () => {
    expect(initialOf('   ')).toBe('');
  });
});
