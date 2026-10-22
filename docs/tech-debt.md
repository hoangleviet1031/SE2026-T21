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
| N6 | Danh sách phiếu chưa lọc theo người tạo, chưa có ô tìm kiếm | [design.md §4.8](design.md#48-danh-sách-phiếu): "Lọc theo người tạo và ô tìm kiếm: chưa có code"; `createdBy` đã có từ TV1-17 | Supervisor khó tìm phiếu khi dự án có nhiều người | TV2-18 (Could), tuần 5–6, trễ thì cắt | Hoàng | Thấp |
| N8 | Chưa có yêu cầu và chưa kiểm khả năng tiếp cận | [design.md §11.3](design.md#113-khả-năng-tiếp-cận) mới thêm; chưa có E2E nào kiểm nhãn ô nhập hay độ tương phản | Ngoài trời nắng khó đọc; người dùng trình đọc màn hình không dùng được | TV3-15 rà và ghi (Could, tuần 5–6); sửa UI trong TV1-12 (b) | Đại + Dương | Thấp |
| N9 | Bản sao lưu nằm cùng ổ đĩa với server | Bản trước deploy và bản hằng ngày đều ở `~/backup/` trên máy staging; bản ngoài máy chỉ có bản kéo tay hằng tuần ([deploy.md](deploy.md) "Kéo bản sao lưu về máy khác"), nhóm chốt ở TV3-13 thay vì đẩy lên Azure Blob | Mất ổ đĩa hoặc máy ảo thì mất tới một tuần phiếu và ảnh; quên kéo thì mất nhiều hơn | Trước khi có người dùng thật ngoài nhóm: đẩy tự động ra ngoài máy (vd. Azure Blob) | Đại + Dương | **Cao** |

## Đã trả

| # | Món nợ | Trả ở |
|---|---|---|
| N7 | `seed:demo` vẫn tạo phiên token cố định `demo-token-<tên>` | Seed bỏ token cố định, xoá phiên token cũ trong DB dev; E2E lấy token bằng đăng nhập (`client/e2e/global-setup.ts`), test server đăng nhập qua API (nhánh `fix/n7-demo-tokens`) |
| N4 | `ui.md` còn nhãn 🆕/🕘 của phần đã có code | ui 0.2.15: bỏ nhãn ở màn hình 5, 7 và trang quản trị A1–A2; A3 ghi "chưa có code" (PR #62) |
| N5 | `401` trong PWA không hiện "Phiên đăng nhập hết hạn, đăng nhập lại" | design 0.5.42: `api.ts` gặp `401` gọi `expireSession` (xoá token, ghi `sessionExpired`), màn hình Đăng nhập hiện câu; E2E `api-errors.spec.ts` (PR #62) |
| N2 | Chưa sao lưu hằng ngày; ảnh chưa nằm trong bản sao lưu | Script `scripts/backup-daily.mjs` (TV3-13, PR #66); staging bật 2026-10-22: `UPLOAD_DIR` ra `~/survey-data/uploads`, timer 03:00 giờ Việt Nam, chạy thử một lần đạt, bản đầu đã kéo về máy Dương (TV1-19 phần 3, PR #67) |
| N3 | Chưa diễn tập quay lại bản trước | Diễn tập 2026-10-22 trên staging theo `deploy.md` nhánh 2a: 19 s quay lại, 21 s quay về `main`; `deploy.md` thêm vòng chờ health và `git switch main` (design 0.5.43 QS5, PR #64) |
| – | Tài liệu design.md còn đoạn 🕘 và nhãn 🆕 của phần đã có code (§2, §3, §4.7, §8, §9, §10.1, §12–§15) | design 0.5.37 |
