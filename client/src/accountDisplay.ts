/**
 * Tên đăng nhập để người dùng gửi cho giám sát viên hoặc Owner (design §4.7). `account.user` lưu từ
 * trước TV2-14 chưa có `username` cho tới vòng `/me` kế tiếp, nên kiểu nhận `username` có thể thiếu;
 * tài khoản cũ có username = id (migration 4) nên lấy id là đúng tên đăng nhập. Dùng `||` để chuỗi rỗng
 * cũng rơi về id, không bao giờ hiện rỗng.
 */
export function accountUsername(user: { id: string; username?: string }): string {
  return user.username || user.id;
}

/**
 * Chữ cái trong ô vuông trước tên tổ chức, tên người (ui.md "Hệ thống thiết kế"). `Array.from` để không
 * cắt đôi ký tự ngoài BMP; tên rỗng thì không hiện gì.
 */
export function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '').toLocaleUpperCase('vi');
}
