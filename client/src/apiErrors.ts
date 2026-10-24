// Câu báo lỗi chung cho các màn hình gọi API thẳng (Thành viên, Tổ chức, builder lưu form, Xuất). Xem
// design §8: trang chạy online, không tự thử lại; người dùng đọc câu rồi bấm lại.

/** Loại lỗi màn hình cần online gặp được, ngoài mã lỗi riêng của từng màn hình (design §7.1). */
export type ApiFailure = 'network' | 'server' | 'auth' | 'not_member';

export const SERVER_ERROR_MSG = 'Máy chủ đang lỗi, thử lại sau';
export const SESSION_EXPIRED_MSG = 'Phiên đăng nhập hết hạn, đăng nhập lại';
export const NOT_MEMBER_MSG = 'Bạn không còn thuộc tổ chức này';

/** `offlineMsg`: câu mất mạng riêng của từng màn hình (vd. "Cần kết nối để lưu form"). */
export function apiFailureText(failure: ApiFailure, offlineMsg: string): string {
  switch (failure) {
    case 'network':
      return offlineMsg;
    case 'server':
      return SERVER_ERROR_MSG;
    case 'auth':
      // App cũng tự về màn hình Đăng nhập (token đã bị xoá); câu này chỉ hiện trong lúc chuyển
      return SESSION_EXPIRED_MSG;
    case 'not_member':
      return NOT_MEMBER_MSG;
  }
}
