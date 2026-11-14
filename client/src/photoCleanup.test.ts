import { describe, expect, it } from 'vitest';
import { NO_PHOTOS, addTotals, cleanupConfirmText, cleanupDoneText, sumPhotos } from './photoCleanup';

// Nút "Dọn ảnh đã tải lên" ở Cài đặt (design §4.2, §5.6): con số trong hộp xác nhận và dòng kết quả.

const photo = (size: number) => ({ blob: { size } });

describe('sumPhotos', () => {
  it('không có ảnh thì 0 ảnh, 0 byte', () => {
    expect(sumPhotos([])).toEqual(NO_PHOTOS);
  });

  it('đếm số ảnh và cộng dung lượng blob', () => {
    expect(sumPhotos([photo(1024)])).toEqual({ count: 1, bytes: 1024 });
    expect(sumPhotos([photo(300_000), photo(0), photo(724)])).toEqual({ count: 3, bytes: 300_724 });
  });
});

describe('addTotals', () => {
  it('cộng tổng của nhiều tổ chức, không sửa giá trị đưa vào', () => {
    const a = { count: 2, bytes: 500 };
    const b = { count: 1, bytes: 24 };
    expect(addTotals(a, b)).toEqual({ count: 3, bytes: 524 });
    expect(addTotals(NO_PHOTOS, a)).toEqual(a);
    expect(a).toEqual({ count: 2, bytes: 500 });
    expect(NO_PHOTOS).toEqual({ count: 0, bytes: 0 });
  });
});

describe('chữ hiển thị', () => {
  it('hộp xác nhận ghi số ảnh, dung lượng kiểu Việt Nam, và nói ảnh chưa gửi được giữ', () => {
    expect(cleanupConfirmText({ count: 12, bytes: 3.5 * 1024 * 1024 })).toBe(
      'Xoá 12 ảnh đã tải lên khỏi máy này (3,5 MB)? Ảnh vẫn còn trên máy chủ, mở lại phiếu khi có mạng thì tự tải về. Ảnh chưa gửi được giữ nguyên.',
    );
  });

  it('dòng kết quả ghi số thật đã dọn', () => {
    expect(cleanupDoneText({ count: 1, bytes: 512 })).toBe('Đã dọn 1 ảnh (512 B).');
    expect(cleanupDoneText({ count: 40, bytes: 20 * 1024 * 1024 })).toBe('Đã dọn 40 ảnh (20,0 MB).');
  });
});
