import { describe, expect, it } from 'vitest';
import { isQuotaError } from './attachments';

// IndexedDB đầy (design §8): Dexie bọc lỗi gốc, nên phải nhận ra cả lỗi bọc lẫn lỗi gốc.
describe('isQuotaError', () => {
  const quota = Object.assign(new Error('đầy'), { name: 'QuotaExceededError' });

  it('nhận lỗi gốc của trình duyệt', () => {
    expect(isQuotaError(quota)).toBe(true);
  });

  it('nhận lỗi Dexie bọc lỗi gốc trong inner', () => {
    const wrapped = Object.assign(new Error('AbortError'), { name: 'AbortError', inner: quota });
    expect(isQuotaError(wrapped)).toBe(true);
  });

  it('nhận lỗi bọc qua cause', () => {
    expect(isQuotaError(new Error('lỗi ghi', { cause: quota }))).toBe(true);
  });

  it('lỗi khác hoặc giá trị không phải lỗi thì không phải', () => {
    expect(isQuotaError(new Error('khác'))).toBe(false);
    expect(isQuotaError(Object.assign(new Error('x'), { name: 'ConstraintError' }))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
    expect(isQuotaError('QuotaExceededError')).toBe(false);
  });
});
