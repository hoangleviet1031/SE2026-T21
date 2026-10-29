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
| N9 | Bản sao lưu nằm cùng ổ đĩa với server | Bản trước deploy và bản hằng ngày đều ở `~/backup/` trên máy staging; bản ngoài máy chỉ có bản kéo tay hằng tuần ([deploy.md](deploy.md) "Kéo bản sao lưu về máy khác"), nhóm chốt ở TV3-13 thay vì đẩy lên Azure Blob | Mất ổ đĩa hoặc máy ảo thì mất tới một tuần phiếu và ảnh; quên kéo thì mất nhiều hơn | Trước khi có người dùng thật ngoài nhóm: đẩy tự động ra ngoài máy (vd. Azure Blob) | Đại + Dương | **Cao** |
| N13 | Chưa thử trên iPhone thật: VoiceOver đọc dải "Đang xem trước…", safe-area hàng nút dính đáy và ngăn kéo menu (TV1-12, đáy ngăn kéo đã cộng `env(safe-area-inset-bottom)`), kéo tay nắm bằng ngón tay trên Safari | Nhóm không có iPhone; PR #80 ghi "chưa thử máy thật". Giả lập 2026-10-24 (Playwright Pixel 5, Chromium, chạm thật qua CDP): kéo tay nắm đổi thứ tự đúng, vuốt phần chữ vẫn cuộn trang, tự cuộn không giật ở CPU chậm 4x. Safe-area rủi ro thấp: `client/index.html` không có `viewport-fit=cover`, `.actionbar` đã cộng `env(safe-area-inset-bottom)` (`client/src/styles.css`). Dải Xem trước đã chuyển sang vùng status luôn có sẵn (cách chắc cho trình đọc màn hình) nhưng chưa nghe thử bằng VoiceOver | Người dùng iPhone có thể không nghe báo đang xem trước, hàng nút sát thanh home, kéo trên Safari khác Chrome | Trước báo cáo cuối kỳ, khi mượn được iPhone | Dương | Vừa |
| N15 | Builder cho lưu biểu mẫu không có trường nào | [design.md §4.1](design.md#41-form-builder-và-schema) không có luật "ít nhất một trường"; `validateFormSchema` (`shared/src/formValidation.ts`) và `builderErrors` (`client/src/builder.ts`) không kiểm số trường. Thử trên staging 2885598 (2026-10-25): "+ Biểu mẫu mới", nhập tiêu đề, bấm "Lưu bản mới" ngay → server nhận, form 0 trường hiện ở trang chủ, "Tạo phiếu mới" không có ô nào | Điều tra viên thấy form rỗng, tạo phiếu không điền được gì; không mất dữ liệu | Sau đóng băng nếu nhóm muốn thêm luật (spec trước, rồi code); đụng `shared/` nên cần Hoàng đồng ý | Dương | Vừa |
| N20 | Mục menu đang ở chỉ phân biệt bằng màu nền | `styles.css` `.sidenav a[aria-current="page"]` chỉ đổi nền `--hl` (1,25:1 với nền trắng), không có dấu hiệu khác như dòng đang chọn ở builder (vạch trái, chữ đậm). Trình đọc màn hình có `aria-current` nên chỉ ảnh hưởng người nhìn | Người khó phân biệt màu hoặc màn hình chói nắng không biết đang ở mục nào. Màn hình 2, 6, 8, 9 | TV1-12 (b) | Dương | Thấp |
| N21 | Vài đích bấm trên PWA nhỏ hơn 44px | Rà TV3-15 (đo `getBoundingClientRect`): link tên app ở header cao 24px (màn hình 2–9); "Tổ chức khác…", "← Quay lại", "Xử lý" (dải phiếu xung đột ở màn hình 4) cao 40px; "Cần xử lý xung đột" ở dòng phiếu cao 32px; ▲▼ ở builder rộng 34px (ui.md cố ý "▲▼ hẹp"). Đều ≥ 24px (mức AA của WCAG 2.2) nên chỉ lệch mục tiêu 44px của §11.3 | Bấm một tay ngoài trời dễ trượt sang nút bên cạnh | TV1-12 (b); ▲▼ thì Dương quyết giữ hay nới | Dương | Thấp |

## Đã trả

| # | Món nợ | Trả ở |
|---|---|---|
| N19 | Ngăn kéo menu chưa giữ con trỏ | `components/NavMenu.tsx` bắt Tab trong handler phím lúc ngăn kéo mở: Tab ở mục cuối về mục đầu, Shift+Tab ở mục đầu về mục cuối, con trỏ ở ngoài ngăn kéo thì về mục đầu; E2E `nav-menu.spec.ts` ca quay vòng (giám sát viên) và ca điều tra viên (PR #108) |
| N17 | Ô "+ Chụp ảnh" không có vòng focus | `client/src/styles.css` luật `.photo-add:has(input:focus-visible)` vẽ vòng đen quanh cả ô như `.ck`, `.opt`; xem trước ở màn hình 5 ô ảnh bị khoá nên không nhận con trỏ; E2E `photo.spec.ts` ca N17, `builder.spec.ts` (ô ảnh xem trước khoá) (PR #107) |
| N16 | Ô nhập đang focus chỉ có quầng vàng nhạt, viền không đổi đen | `client/src/styles.css` nhắc lại viền `--ink` lúc `:focus-visible` cho ô `.field`, `.builder`, `.row-form` (cùng độ cụ thể với luật viền ô); ô `.field.bad` giữ viền đỏ; luật ghi ở ui.md "Hệ thống thiết kế" 0.2.34; E2E `login.spec.ts`, `fill.spec.ts` ca N16 (PR #107) |
| N18 | Đóng hộp xác nhận thì con trỏ rơi về đầu trang | `components/ConfirmDialog.tsx` nhớ nút đã mở hộp, Huỷ hoặc Esc thì trả con trỏ về nút đó; bấm xác nhận thì theo luật từng màn (design §4.7); E2E `delete.spec.ts` ca N18, `admin.spec.ts` Q10 (A2 Khoá) (PR #106) |
| N11 | Dòng phiếu chưa theo luật tiêu đề §4.8 | `client/src/recordList.ts` `recordTitle` (trường `text` đầu tiên không ẩn theo bản form của phiếu, rỗng thì "Phiếu chưa có tên") và `formatEditedAt` (giờ sửa cuối); unit `recordList.test.ts`, E2E `home.spec.ts` ca N11 (PR #105, làm trước TV2-18, Dương chốt 2026-10-26) |
| N10 | Trang chủ không nhóm phiếu theo form | `groupRecordsByForm` (`client/src/recordList.ts`), `HomePage.tsx` chia mục "Phiếu đã nhập" thành nhóm theo form có số phiếu, nhóm cuối "Biểu mẫu chưa có trên máy"; E2E `home.spec.ts` ca N10 (PR #105, làm trước TV2-18, Dương chốt 2026-10-26) |
| N8 | Chưa có yêu cầu và chưa kiểm khả năng tiếp cận | TV3-15 rà từng màn hình theo bốn điểm của [design.md §11.3](design.md#113-khả-năng-tiếp-cận) (2026-10-29), bảng đạt / chưa đạt ở §11.3; chỗ chưa đạt thành N16–N21 (nhánh `docs/tv3-15-a11y-audit`) |
| N14 | A3 Tài khoản: bấm [Tìm] lúc danh sách lần đầu còn đang tải thì kết quả về sau đè kết quả về trước | `UsersPage.tsx` đánh số thứ tự lần tải, kết quả và lỗi của lần cũ bị bỏ qua; E2E `admin.spec.ts` ca N14 (PR #101) |
| N12 | Màn hình điền phiếu thiếu nhãn trạng thái đầu trang và nút cho phiếu Lỗi | ui 0.2.29: `FillPage.tsx` nhãn `displayState` dưới khối tên biểu mẫu; khối lỗi tách thành `components/RecordErrorBox.tsx` dùng chung với trang chủ; E2E `fill-status.spec.ts` (PR #95, làm trước TV2-18, Dương chốt 2026-10-25) |
| N7 | `seed:demo` vẫn tạo phiên token cố định `demo-token-<tên>` | Seed bỏ token cố định, xoá phiên token cũ trong DB dev; E2E lấy token bằng đăng nhập (`client/e2e/global-setup.ts`), test server đăng nhập qua API (nhánh `fix/n7-demo-tokens`) |
| N4 | `ui.md` còn nhãn 🆕/🕘 của phần đã có code | ui 0.2.15: bỏ nhãn ở màn hình 5, 7 và trang quản trị A1–A2; A3 ghi "chưa có code" (PR #62) |
| N5 | `401` trong PWA không hiện "Phiên đăng nhập hết hạn, đăng nhập lại" | design 0.5.42: `api.ts` gặp `401` gọi `expireSession` (xoá token, ghi `sessionExpired`), màn hình Đăng nhập hiện câu; E2E `api-errors.spec.ts` (PR #62) |
| N2 | Chưa sao lưu hằng ngày; ảnh chưa nằm trong bản sao lưu | Script `scripts/backup-daily.mjs` (TV3-13, PR #66); staging bật 2026-10-22: `UPLOAD_DIR` ra `~/survey-data/uploads`, timer 03:00 giờ Việt Nam, chạy thử một lần đạt, bản đầu đã kéo về máy Dương (TV1-19 phần 3, PR #67) |
| N3 | Chưa diễn tập quay lại bản trước | Diễn tập 2026-10-22 trên staging theo `deploy.md` nhánh 2a: 19 s quay lại, 21 s quay về `main`; `deploy.md` thêm vòng chờ health và `git switch main` (design 0.5.43 QS5, PR #64) |
| – | Tài liệu design.md còn đoạn 🕘 và nhãn 🆕 của phần đã có code (§2, §3, §4.7, §8, §9, §10.1, §12–§15) | design 0.5.37 |
