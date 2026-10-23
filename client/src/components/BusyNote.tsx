// Chữ phụ cạnh nút trong lúc đang gửi (ui.md "trạng thái dùng chung"). Không đổi chữ trên nút: tên nút
// là thứ người dùng và E2E dùng để tìm nút, đổi giữa chừng thì trình đọc màn hình đọc sai nút.
export function BusyNote({ busy, text }: { busy: boolean; text: string }) {
  if (!busy) return null;
  return (
    <small role="status" data-testid="busy-note">
      {text}
    </small>
  );
}
