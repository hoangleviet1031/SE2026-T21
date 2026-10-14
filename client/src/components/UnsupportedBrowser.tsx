// Hiện thay cho app khi trình duyệt thiếu API bắt buộc (design §11.1, ui.md "Trình duyệt không được hỗ trợ").
// Dòng "Thiếu: ..." để người dùng chụp màn hình gửi nhóm là biết ngay lỗi ở đâu.
export function UnsupportedBrowser({ missing }: { missing: string[] }) {
  return (
    <div className="app">
      <header>
        <span className="brand">Khảo sát thực địa</span>
      </header>
      <main>
        <section data-testid="unsupported-browser">
          <h2>Trình duyệt không được hỗ trợ</h2>
          <p>Dùng Chrome 120 trở lên trên Android hoặc máy tính, hoặc Safari 16.4 trở lên trên iPhone.</p>
          <p>
            <small>Thiếu: {missing.join(', ')}</small>
          </p>
        </section>
      </main>
    </div>
  );
}
