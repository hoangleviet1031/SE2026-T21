# Sổ nợ kỹ thuật

Chỗ nhóm đã biết là làm tắt hoặc chưa làm, khiến việc sửa, vận hành hay kiểm chứng sau này tốn hơn. Mỗi dòng có bằng chứng trong repo, lúc phải trả và người giữ, để không thành "dọn sau" chung chung (Lecture 05: technical debt register).

Không ghi vào đây việc vốn đã có ticket từ đầu trong [plan/](plan/README.md) (ví dụ đo hiệu năng là TV2-11) hay rủi ro sản phẩm ([design.md §13](design.md#13-rủi-ro-và-hạn-chế)). Chỉ ghi phần **đã chốt trong spec mà code hoặc vận hành chưa theo**, và chỗ làm tắt có chủ ý.

## Cách dùng

- Thêm dòng khi làm tắt có chủ ý (ghi luôn trong PR đó) hoặc khi review thấy spec và code lệch mà ngoài phạm vi ticket.
- Nợ được giao cho ticket mới thì giữ dòng, "Lúc phải trả" trỏ tới ticket đó.
- Trả xong thì chuyển dòng xuống "Đã trả" kèm PR, không xoá.
- **Ưu tiên** theo hai trục: phần đó có hay bị sửa không, và hỏng thì nặng cỡ nào. Hay sửa + hỏng nặng thì trả trước.

| Ưu tiên | Nghĩa |
|---|---|
| **Cao** | Hỏng thì mất dữ liệu, lộ dữ liệu hoặc không khôi phục được staging; trả trước mốc gần nhất |
| **Vừa** | Người dùng thấy sai hoặc nhóm mất thời gian dò lỗi; trả khi chạm tới phần đó |
| **Thấp** | Chỉ ảnh hưởng dev hoặc tài liệu; trả khi rảnh |

## Đang nợ

| # | Món nợ | Bằng chứng | Ảnh hưởng | Lúc phải trả | Người giữ | Ưu tiên |
|---|---|---|---|---|---|---|
| N1 | Server không ghi log request, log không có cấu trúc | `server/src/index.ts` chỉ có 3 dòng `console.log` lúc khởi động và dọn dữ liệu; `journalctl -u survey-api` không cho biết request nào lỗi, của ai, mất bao lâu ([deploy.md](deploy.md) "Xem log") | Sự cố trên staging phải đoán; không có số liệu sau deploy (tỉ lệ 5xx) | TV2-19 (phần log, Could), tuần 5–6 | Hoàng | Vừa |
| N2 | Chưa sao lưu hằng ngày; ảnh chưa nằm trong bản sao lưu | [deploy.md](deploy.md) "Việc chưa làm": chỉ sao lưu CSDL lúc `deploy.sh` chạy; `UPLOAD_DIR` chưa đưa ra ngoài repo | Hỏng đĩa hoặc lỡ tay giữa hai lần deploy thì mất phiếu và ảnh đã nhận | TV3-13 (script, tuần 4), Dương bật trên staging ở TV1-19 | Đại + Dương | **Cao** |
| N3 | Chưa diễn tập quay lại bản trước | [deploy.md](deploy.md) "Quay lại bản trước" mới viết, chưa chạy thử lần nào | Deploy lỗi lúc gần demo thì không biết mất bao lâu để phục hồi | TV1-19, tuần 5–6 (trước đóng băng giữa tuần 7) | Dương | Vừa |
| N4 | `ui.md` còn nhãn 🆕/🕘 của phần đã có code | `grep -n "🆕\|🕘" docs/ui.md`: 6 chỗ (màn hình 5, 7, trang quản trị) | Đọc spec dễ hiểu nhầm là chưa làm | Lần sửa `ui.md` kế tiếp (TV1-12) | Dương | Thấp |
| N5 | `401` trong PWA không hiện "Phiên đăng nhập hết hạn, đăng nhập lại" | `client/src/sync/api.ts` (gặp `401` thì `clearToken()` rồi ném `AuthError`); app chỉ quay về màn hình Đăng nhập, không có câu nào ([design.md §8](design.md#8-xử-lý-lỗi)) | Người bị thu hồi phiên không hiểu vì sao bị đẩy ra | TV1-12 (hoàn thiện UI) | Hoàng (`api.ts`), Dương (màn hình Đăng nhập) | Vừa |
| N6 | Danh sách phiếu chưa lọc theo người tạo, chưa có ô tìm kiếm | [design.md §4.8](design.md#48-danh-sách-phiếu): "Lọc theo người tạo và ô tìm kiếm: chưa có code"; `createdBy` đã có từ TV1-17 | Supervisor khó tìm phiếu khi dự án có nhiều người | TV2-18 (Could), tuần 5–6, trễ thì cắt | Hoàng | Thấp |
| N7 | `seed:demo` vẫn tạo phiên token cố định `demo-token-<tên>` | `server/src/seedDemo.ts` dòng 19–22; app đã bỏ màn hình nhập mã (TV1-14) | Ai có bản dev là gọi API bằng token đoán được; không ảnh hưởng staging vì `seed:demo` từ chối khi `NODE_ENV=production` | Khi sửa `seedDemo.ts` lần tới; cần xem E2E/test còn dùng không (4 chỗ trong `client/e2e`, `server/test`) | Đại | Thấp |
| N8 | Chưa có yêu cầu và chưa kiểm khả năng tiếp cận | [design.md §11.3](design.md#113-khả-năng-tiếp-cận) mới thêm; chưa có E2E nào kiểm nhãn ô nhập hay độ tương phản | Ngoài trời nắng khó đọc; người dùng trình đọc màn hình không dùng được | TV3-15 rà và ghi (Could, tuần 5–6); sửa UI trong TV1-12 (b) | Đại + Dương | Thấp |

## Đã trả

| # | Món nợ | Trả ở |
|---|---|---|
| – | Tài liệu design.md còn đoạn 🕘 và nhãn 🆕 của phần đã có code (§2, §3, §4.7, §8, §9, §10.1, §12–§15) | design 0.5.37 |
