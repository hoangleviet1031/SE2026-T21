// Chữ của nút "Xoá dữ liệu trên máy" và dòng khoá dùng chung với Đăng xuất ở Cài đặt (design §4.2, §9;
// ui.md màn hình 8). Hàm thuần, không đụng Dexie, để unit test được; phần kiểm và xoá nằm ở logout.ts.

export const WIPE_BUTTON = 'Xoá dữ liệu trên máy';
export const WIPE_CONFIRM_LABEL = 'Xoá dữ liệu';
// Nói rõ cả phần không chặn nút (bộ đệm đang nhập, bản tự lưu builder) cũng mất: người dùng xác nhận khi biết
// mình mất gì (CLAUDE.md bất biến 1)
export const WIPE_CONFIRM_MSG =
  'Xoá biểu mẫu, phiếu và ảnh của mọi tổ chức khỏi máy này? Dữ liệu vẫn còn trên máy chủ, có mạng thì app tải lại. Phần đang nhập dở chưa lưu cũng bị xoá. Bạn vẫn đăng nhập.';
export const WIPE_DONE_MSG = 'Đã xoá dữ liệu trên máy. Biểu mẫu và phiếu sẽ tải lại từ máy chủ khi có mạng.';
export const WIPE_FAILED_MSG = 'Không xoá được dữ liệu trên máy. Thử lại sau.';

/** Lý do nút Xoá dữ liệu và Đăng xuất bị khoá, hoặc bị chặn lúc bấm xác nhận: cùng một điều kiện. */
export function blockedMessage(blocked: readonly { name: string }[]): string {
  const names = blocked.map((p) => `"${p.name}"`).join(', ');
  return `Còn dữ liệu chưa gửi ở dự án ${names}. Đồng bộ xong mới xoá dữ liệu hoặc đăng xuất được.`;
}
