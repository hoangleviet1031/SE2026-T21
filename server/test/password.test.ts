import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password';

describe('hashPassword / verifyPassword (ADR 0003 §1)', () => {
  it('đúng mật khẩu: true; sai: false', async () => {
    const stored = await hashPassword('mat-khau-dai');
    expect(await verifyPassword('mat-khau-dai', stored)).toBe(true);
    expect(await verifyPassword('mat-khau-dai!', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('định dạng scrypt$<N>$<salt>$<hash>, không chứa mật khẩu gốc', async () => {
    const stored = await hashPassword('mat-khau-dai');
    expect(stored).toMatch(/^scrypt\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain('mat-khau-dai');
    // muối 16 byte
    const salt = stored.split('$')[2] ?? '';
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
  });

  it('cùng mật khẩu băm hai lần ra hai chuỗi khác nhau (muối ngẫu nhiên)', async () => {
    expect(await hashPassword('mat-khau-dai')).not.toBe(await hashPassword('mat-khau-dai'));
  });

  it('mật khẩu Unicode', async () => {
    const stored = await hashPassword('mật khẩu có dấu');
    expect(await verifyPassword('mật khẩu có dấu', stored)).toBe(true);
    expect(await verifyPassword('mat khau co dau', stored)).toBe(false);
  });

  it.each(['', 'scrypt', 'bcrypt$16384$abc$def', 'scrypt$abc$c2FsdA==$aGFzaA==', 'scrypt$16384$c2FsdA==', 'scrypt$3$c2FsdA==$aGFzaA=='])(
    'chuỗi lưu hỏng %j: false, không ném',
    async (stored) => {
      expect(await verifyPassword('mat-khau-dai', stored)).toBe(false);
    },
  );
});
