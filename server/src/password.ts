import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Băm mật khẩu bằng scrypt có sẵn trong node:crypto, không thêm thư viện (ADR 0003 §1).
// Dạng lưu: scrypt$<N>$<muối base64>$<hash base64>. Ghi N vào chuỗi để sau này tăng N mà
// mật khẩu cũ vẫn kiểm được.

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Bản bất đồng bộ: scrypt tốn vài chục ms, bản Sync sẽ chặn mọi request khác trong lúc đó.
function derive(password: string, salt: Buffer, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem phải đủ cho 128 * N * r byte, mặc định 32 MB vừa đủ với N = 16384 nên đặt rộng ra.
    scrypt(password, salt, KEY_LENGTH, { N: n, r: R, p: P, maxmem: 256 * n * R }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, N);
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** So bằng hàm hằng thời gian. Chuỗi lưu hỏng hay lạ thì coi như sai mật khẩu. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  // N của scrypt phải là luỹ thừa của 2 lớn hơn 1; chặn luôn N quá lớn để chuỗi hỏng không ăn hết RAM.
  if (!Number.isInteger(n) || n < 2 || n > 1 << 17 || (n & (n - 1)) !== 0) return false;
  const salt = Buffer.from(parts[2] ?? '', 'base64');
  const expected = Buffer.from(parts[3] ?? '', 'base64');
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, salt, n);
  return timingSafeEqual(actual, expected);
}

/**
 * Chuỗi băm của một mật khẩu không ai biết. Đăng nhập bằng tên không tồn tại vẫn chạy scrypt trên
 * chuỗi này, để thời gian trả lời không lộ tên nào đã có (ADR 0003 §1).
 */
export const DUMMY_PASSWORD_HASH: Promise<string> = hashPassword(randomBytes(16).toString('hex'));
