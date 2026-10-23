import { Icon } from './Icon';

// Hiện thay cho app khi trình duyệt thiếu API bắt buộc (design §11.1, ui.md "Trình duyệt không được hỗ trợ").
// Dòng "Thiếu: ..." để người dùng chụp màn hình gửi nhóm là biết ngay lỗi ở đâu.
export function UnsupportedBrowser({ missing }: { missing: string[] }) {
  return (
    <main className="unsup" data-testid="unsupported-browser">
      <span className="logo">
        <Icon name="logo" />
      </span>
      <div className="app-name">Khảo sát thực địa</div>
      <h2>Trình duyệt không được hỗ trợ</h2>
      <p>Dùng Chrome 120 trở lên trên Android hoặc máy tính, hoặc Safari 16.4 trở lên trên iPhone.</p>
      <small>Thiếu: {missing.join(', ')}</small>
    </main>
  );
}
