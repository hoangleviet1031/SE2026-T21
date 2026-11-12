import { latestForms } from './formDisplay';

// Khối "Dữ liệu trên máy" ở Cài đặt (ui.md màn hình 8, design §4.2). Chỉ đếm dự án đang chọn.

export interface DeviceStatus {
  /** Số biểu mẫu khác nhau, không tính từng phiên bản: người dùng thấy mỗi form một thẻ ở trang chủ */
  formCount: number;
  /**
   * Số op trong outbox, kể cả op lỗi đang chờ sửa: đúng phần outbox làm khoá Đăng xuất
   * (`hasUnsentData`), nên hai chỗ không nói khác nhau. Nháp không có op nên không tính.
   */
  pendingOps: number;
}

export function deviceStatus(forms: readonly { id: string; version: number }[], pendingOps: number): DeviceStatus {
  return { formCount: latestForms(forms).length, pendingOps };
}
