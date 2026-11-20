import { describe, expect, it } from 'vitest';
import { blockedMessage } from './wipeData';

// Dòng khoá dùng chung cho nút Xoá dữ liệu trên máy và Đăng xuất ở Cài đặt (design §4.2, §9; ui.md màn hình 8).

describe('blockedMessage', () => {
  it('một dự án: tên trong ngoặc kép, nói cả hai việc bị khoá', () => {
    expect(blockedMessage([{ name: 'Y tế xã' }])).toBe(
      'Còn dữ liệu chưa gửi ở dự án "Y tế xã". Đồng bộ xong mới xoá dữ liệu hoặc đăng xuất được.',
    );
  });

  it('nhiều dự án: liệt kê theo thứ tự, cách nhau bằng dấu phẩy', () => {
    expect(blockedMessage([{ name: 'A' }, { name: 'B' }])).toBe(
      'Còn dữ liệu chưa gửi ở dự án "A", "B". Đồng bộ xong mới xoá dữ liệu hoặc đăng xuất được.',
    );
  });
});
