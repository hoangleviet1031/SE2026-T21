// Chữ phụ trong lúc đang gửi (ui.md "Đang gửi"). Không đổi chữ trên nút: tên nút là thứ người dùng và
// E2E dùng để tìm nút, đổi giữa chừng thì trình đọc màn hình đọc sai nút. Trên màn hình nút đã có vòng
// xoay (CSS theo aria-busy) nên chữ chỉ để trình đọc màn hình đọc; `visible` cho việc có thể chờ lâu
// (lấy GPS tới 30 s) để người dùng biết vẫn đang chạy.
export function BusyNote({ busy, text, visible = false }: { busy: boolean; text: string; visible?: boolean }) {
  if (!busy) return null;
  return (
    <small role="status" className={visible ? 'busy-note' : 'visually-hidden'} data-testid="busy-note">
      {text}
    </small>
  );
}
