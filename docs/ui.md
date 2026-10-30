# Phác thảo giao diện

- **Phiên bản:** 0.2.39 (2026-10-30): màn hình 2 có dải "Phiếu đang nhập dở, chưa lưu" dẫn về phiếu mới gõ dở (Could, Dương chốt 2026-10-30). 0.2.38 (2026-10-30): màn hình 4 tự giữ chữ đang gõ, mở lại phiếu hỏi [Khôi phục] / [Bỏ]; dải cập nhật đổi câu hỏi khi đang ở màn hình 4 (Could, Dương chốt 2026-10-30). 0.2.37 (2026-10-30): ngăn kéo menu mở thì phần trang phía sau có `inert`, màn hình rộng lên ≥ 1024px thì ngăn kéo đóng (tech-debt N22, Dương chốt 2026-10-30). 0.2.36 (2026-10-30): mục menu đang ở có thêm vạch trái đậm và chữ đậm, không chỉ nền vàng (tech-debt N20, Dương chốt 2026-10-30). 0.2.35 (2026-10-29): ngăn kéo menu giữ con trỏ có code, bỏ câu "chưa giữ" và cách rời trang "Tab ra nội dung phía sau rồi bấm" (tech-debt N19, Dương chốt 2026-10-29). 0.2.34 (2026-10-29): ô nhập đang có con trỏ viền đen + quầng vàng, ô đang báo lỗi giữ viền đỏ; ô "+ Chụp ảnh" có vòng đen quanh cả ô như ô đánh dấu (tech-debt N16, N17, Dương chốt 2026-10-29). 0.2.33 (2026-10-29): màn hình 2 chia phiếu theo form trong mục "Phiếu đã nhập", nhóm cuối "Biểu mẫu chưa có trên máy", tiêu đề phiếu theo design §4.8 và giờ sửa cuối (tech-debt N10, N11; dạng giờ và chữ nhóm cuối Dương duyệt 2026-10-29). 0.2.32 (2026-10-29): ngăn kéo menu giữ con trỏ khi mở (TV3-15 rà khả năng tiếp cận, design §11.3, §14; chưa có code, tech-debt N19). 0.2.31 (2026-10-26): màn hình 8 thêm khối Đổi mật khẩu, ba ô chỉ mở khi bấm [Đổi mật khẩu…] (design §4.7, Dương chốt 2026-10-26). 0.2.30 (2026-10-26): menu điều hướng (☰ trên điện thoại, thanh bên trên máy tính) ở màn hình 2, 6, 8, 9 thay nút [Cài đặt] trên header và khối Thành viên cuối trang chủ; header rộng hết màn ở mọi màn hình (TV1-12, Dương chốt 2026-10-26). 0.2.29 (2026-10-25): màn hình 4 có nhãn trạng thái đầu trang, phiếu Lỗi có câu lỗi, [Thử lại], [Xuất JSON phiếu này] ngay trên trang (tech-debt N12). 0.2.28 (2026-10-25): tiêu đề trang màn hình 5, 6, 8, 9 cùng kiểu với màn hình 2, 4 (TV1-12, sau audit UI). 0.2.27 (2026-10-25): màn hình 8 câu lỗi lúc Đăng xuất có ⚠, nút Đăng xuất khoá đọc kèm lý do (TV1-12, sau audit UI). 0.2.26 (2026-10-25): trang quản trị A2 nút "Đổi Owner…" đổi thành "Thêm Owner…" vì Owner cũ vẫn giữ quyền (TV1-12, sau critique UI). 0.2.25 (2026-10-25): nền trang trắng thay nền giấy, ô chìm có màu riêng, `theme-color` trắng (TV1-12, Dương chốt; gộp audit C11). 0.2.24 (2026-10-25): trang quản trị A1, A2, A3 tải danh sách lần đầu lỗi thì chỉ còn dòng lỗi, không kẹt "Đang tải…" (TV1-16). 0.2.23 (2026-10-25): màn hình 5 chọn hoặc thêm trường thì cuộn tới khối Thuộc tính, câu khi chưa có trường, bỏ trống mã báo "Nhập mã biểu mẫu" và ô Mã viền đỏ, "← Quay lại" khi không mở được builder (TV1-12, sau audit/critique UI). 0.2.22 (2026-10-25): trang quản trị A3 Tài khoản có code (TV1-16): bảng như A1/A2, ô tìm + [Tìm], Khoá và Cấp lại mật khẩu hỏi lại, mật khẩu tạm ở hàng ngay dưới dòng. 0.2.21 (2026-10-25): màn hình 9 gửi yêu cầu xong có dòng "Đã gửi yêu cầu" dưới nút, khối "Yêu cầu của bạn" lên trên form, "← Quay lại" ở đầu trang thay "← Về danh sách phiếu" ở cuối, [Huỷ] đọc ra kèm tên tổ chức (TV1-12, sau audit/critique UI). 0.2.20 (2026-10-24): màn hình 6 ô "Đổi vai trò…" chỉ để chọn, bấm [Đổi] mới gửi; "← Quay lại" ở đầu trang thay "← Về danh sách phiếu" ở cuối, có cả khi không đủ quyền; câu lỗi có ⚠ (TV1-12, sau audit/critique UI). 0.2.19 (2026-10-24): màn hình 5 báo "Đang xem trước…" cho trình đọc màn hình qua vùng status ẩn luôn có sẵn (TV1-12, sau thử máy #80). 0.2.18 (2026-10-24): mục "Hệ thống thiết kế"; header có logo và biểu tượng; nút đang gửi chỉ có vòng xoay, chữ phụ chỉ cho trình đọc màn hình (trừ Lấy vị trí); nút trong trang mở hộp xác nhận có viền đỏ; dải cập nhật nền tối (TV1-12 b2 p1); màn hình 2 thẻ biểu mẫu, nút [Xuất ▾], ẩn bộ lọc khi chưa có phiếu, cả dòng phiếu bấm được (TV1-12 b2 p2); màn hình 3 thẻ trường và ô lựa chọn lớn, màn hình 4 đầu trang cùng màu thẻ form, hàng nút dính đáy, ô chọn nhiều, ảnh, GPS theo thiết kế (TV1-12 b2 p3); màn hình 5 ba khối, ▲▼ hẹp, hàng nút dính đáy, dải "Đang xem trước…" (TV1-12 b2 p4); màn hình 6, 9 theo thiết kế, tên và vai trò / trạng thái hai dòng bỏ " · " (TV1-12 b2 p5); màn hình 1 tab dạng công tắc, mất mạng và hết phiên nền vàng, khối bị chặn; màn hình 8 bốn khối, thanh dung lượng, dòng "Đã cài" có dấu tích (TV1-12 b2 p6); trang quản trị A0–A2 theo thiết kế, ô từ chối và ô Đổi Owner ở hàng ngay dưới dòng, ghi chú rỗng hiện "—" (TV1-12 b2 p7); màn hình 5 kéo thả bằng tay nắm ⠿ (TV1-12 b2 p8), ▲ ▼ giữ đúng dòng đang chọn (TV1-12 b2); màn hình 1 hết phiên mà mất mạng chỉ hiện một dải, A1/A2 con trỏ về dòng kết quả sau thao tác (TV1-12 b2). 0.2.17 (2026-10-23): trạng thái "đang gửi" dùng chung; màn hình 2 câu rỗng, màn hình 4 câu lỗi GPS, màn hình 5 và 8 có "← Quay lại", màn hình 9 "Đang tải…" (TV1-12 b1). 0.2.16 (2026-10-22): màn hình 1 bỏ câu cũ "màn hình 9 chưa có", ghi cách code đang làm khi chưa thuộc tổ chức nào (TV1-12 a3). 0.2.15 (2026-10-22): bỏ nhãn 🆕/🕘 của phần đã có code (màn hình 5, 7, trang quản trị A1–A2; tech-debt N4); màn hình 1 báo hết phiên khi bị `401`, màn hình 6 câu lỗi máy chủ và nút Thử lại (TV1-12 a2). 0.2.14 (2026-10-19): mọi hộp hỏi xác nhận là hộp trong app, Xuất JSON khi bị từ chối đổi tài khoản báo kết quả (TV1-12 a1). 0.2.13 (2026-10-19): màn hình 9 Tổ chức có code, mục "Tổ chức khác…" ở màn hình 2 (TV1-15). 0.2.12 (2026-10-19): màn hình 1 Đăng nhập / Tạo tài khoản có code, bỏ bản nhập mã (TV1-14). 0.2.11 (2026-10-17): màn hình 3 hiện tên người sửa, màn hình 4 ẩn [Xoá phiếu] với surveyor ở phiếu người khác tạo (TV1-17). 0.2.10 (2026-10-17): màn hình 4 ghi hộp xác nhận xoá phiếu trong app (TV1-13). 0.2.9 (2026-10-17): màn hình 6 Thành viên có code (TV1-08 phần 2), ghi cách code đang làm; nút Thành viên ở màn hình 2 hiện cho cả owner. 0.2.8 (2026-10-16): màn hình 5 ghi chỗ đặt và cách chạy [Xuất form] [Nhập form] (TV1-10 phần 2). 0.2.7 (2026-10-16): màn hình 4 ghi cách hiện trường ẩn và khi máy thiếu bản form của phiếu (TV1-10 phần 1). 0.2.6 (2026-10-14): màn hình 8 thêm mục "Cài lên màn hình chính", Đăng xuất xoá cả cache SW; thêm màn hình "Trình duyệt không được hỗ trợ" (TV1-07 phần 2b). 0.2.5 (2026-10-14): dải "Có phiên bản mới" dùng chung mọi màn hình (TV1-07 phần 2a). 0.2.4 (2026-10-13): gọn giao diện sau khi thử staging (header 360px, nút quay lại màn hình 4, câu hướng dẫn màn hình 8, builder). 0.2.3 (2026-10-13): màn hình 5 ghi cách code đang làm (TV1-04). 0.2.2 (2026-10-13): màn hình 2 ghi chỗ đặt bộ chọn dự án và màn hình chưa có dự án (TV1-06). 0.2.1 (2026-10-12): phác màn hình 8 Cài đặt (TV1-07 phần 1). 0.2 (2026-10-12): theo [ADR 0003](adr/0003-accounts-and-owner-role.md). Nhãn 🆕/🕘 cùng nghĩa với design.md (🆕 bản mới chưa có code, 🕘 bản đang chạy). Nhóm sửa theo thảo luận UI; chỗ nào khác với [design.md](design.md) thì design.md đúng.
- **Ràng buộc chung:** một cột, chạy tốt ở bề ngang 360px (client/CLAUDE.md; header giữ mỗi phần tử một dòng, tên app tự rút gọn bằng "…"); chữ tiếng Việt đúng nhãn trong design; phần tử test dùng `data-testid` kebab-case. Trang quản trị (A1–A3) là ngoại lệ: bố cục cho máy tính.
- **Hệ thống thiết kế** (TV1-12 b2, theo bản thiết kế Dương duyệt 2026-10-23): token màu, bo góc, phông ở `:root` trong `client/src/styles.css`, trang quản trị dùng chung. Nền trang trắng `#ffffff` (Dương chốt 2026-10-25, thay nền giấy `#fbfaf7`), khối trắng tách nền nhờ viền `#e6e3dd`; ô chìm `#f5f3ef` (khung gợi ý, mã khoá, toạ độ GPS, bản gốc khi xung đột, dòng menu Xuất khi rê chuột, tiêu đề bảng quản trị); `theme-color` và manifest `theme_color` trắng theo header. Chữ `#262522`, chữ phụ `#625f58` (6,4:1 trên trắng, 5,75:1 trên ô chìm), nút chính `#34322e`, vàng nhấn `#fde59a` (logo, mục đang chọn), đỏ `#c0261a` chỉ cho lỗi và mất dữ liệu; mọi cặp chữ trên nền ≥ 4,9:1. Phông máy, không tải phông; không có chế độ tối. Tiêu đề trang (h2) ở màn hình 2, 4, 5, 6, 8, 9 cùng một kiểu: 22px, đậm 800; màn hình 1 không có tiêu đề. Nút cao ≥ 44px, bo 10px: chính (đen), thường (trắng viền), phụ (xám, vd. Huỷ), nguy hiểm (đỏ đặc, chỉ là nút xác nhận cuối cùng trong hộp), viền đỏ (nút trong trang chỉ mở hộp xác nhận: Xoá phiếu, Rút, Đăng xuất, Xoá khỏi máy, Khoá), khoá (xám, kể cả nút viền đỏ bị khoá). Ô nhập đang có con trỏ: viền đen + quầng vàng (ô đang báo lỗi giữ viền đỏ); ô ảnh, ô đánh dấu: vòng đen quanh cả ô. Link không đổi màu, nhận ra nhờ dạng nút hoặc mũi tên ›; chỉ link nằm giữa câu văn mới gạch chân. Biểu tượng là SVG tự vẽ (`components/Icon.tsx`), luôn đi kèm chữ và ẩn khỏi trình đọc màn hình. Header: ([Menu] ở màn hình có menu) ô logo vàng, tên app (tự rút gọn bằng "…"), trạng thái mạng dạng chấm dưới tên, [Menu] [Đồng bộ] là biểu tượng + chữ nhỏ; header rộng hết màn ở mọi màn hình có header (không nhảy bề rộng khi chuyển màn), nội dung tối đa 720px ở giữa (TV1-12). Bộ chọn dự án: ô chữ cái + tên tổ chức.
- **Số màn hình** được ticket trỏ tới (vd. "UI màn hình 3"), không đổi số đã dùng; thêm màn hình mới thì đánh số tiếp. Trang quản trị đánh số riêng `A1, A2, …`.

**App khảo sát (PWA)**

| # | Màn hình | Route (hash) | Vai trò | Cần online | Spec | Ticket |
|---|---|---|---|---|---|---|
| 1 | Đăng nhập / Tạo tài khoản | (khi chưa có token) | mọi | lần đầu | §4.7 | TV1-14 (thay màn hình nhập mã của TV1-02) |
| 2 | Danh sách phiếu (trang chủ) + bộ chọn dự án | `#/` | mọi | không | §4.7, §4.8 | TV1-06, TV3-07 |
| 3 | Xung đột | `#/conflict/<recordId>` | mọi | không | §4.5 | TV3-07, TV3-08 |
| 4 | Điền / xem phiếu | `#/fill/<formId>/<recordId>` | mọi | không | §4.1, §5.7 | TV1-05, TV1-10, TV1-13 |
| 5 | Form builder | `#/builder/<formId>`, `#/builder/new` | supervisor, owner | khi lưu | §4.1 | TV1-04 |
| 6 | Thành viên (kèm cài đặt tổ chức cho owner) | `#/members` | supervisor, owner | có | §4.7 | TV1-08 |
| 7 | ~~Dự án (quản trị)~~ | ~~`#/admin/projects`~~ | – | – | – | Bỏ, thay bằng trang quản trị A1–A3 (TV1-16) |
| 8 | Cài đặt | `#/settings` | mọi | không | §4.2, §4.7 | TV1-07 |
| 9 | Tổ chức (danh sách công khai, mở tổ chức mới) | `#/orgs` | mọi | có | §4.7 | TV1-15 |

**Trang quản trị `/admin/`** (tách khỏi PWA, chỉ admin, luôn cần online; design §4.9)

| # | Màn hình | Route | Spec | Ticket |
|---|---|---|---|---|
| A1 | Yêu cầu mở tổ chức (mặc định) | `/admin/#/` | §4.9 | TV1-16 |
| A2 | Tổ chức | `/admin/#/projects` | §4.9 | TV1-16 |
| A3 | Tài khoản (Could, cắt được) | `/admin/#/users` | §4.9 | TV1-16, TV2-17 |

Các trạng thái dùng chung, mọi màn hình phải có: **đang tải**, **rỗng**, **lỗi**, và với màn hình cần online: **"Cần kết nối mạng để dùng chức năng này"**.

**Đang gửi** (TV1-12 b1, b2 p1, `components/BusyNote.tsx`): nút khoá, có `aria-busy`, trên nút có vòng xoay, chữ trên nút không đổi; chữ phụ (`data-testid="busy-note"`) chỉ để trình đọc màn hình đọc, không hiện trên màn hình. Riêng Lấy vị trí vẫn hiện chữ phụ vì có thể chờ tới 30 s. Tiếp tục: "Đang đăng nhập…"; Tạo tài khoản: "Đang tạo tài khoản…"; Thêm (thành viên): "Đang thêm…"; Gửi yêu cầu: "Đang gửi yêu cầu…"; Lưu bản mới: "Đang lưu…"; Xuất CSV/JSON: "Đang xuất…"; Lấy vị trí: "Đang lấy vị trí…".

**Dải cập nhật app** (design §4.3, mọi màn hình kể cả màn hình 1): khi đã tải xong bản mới, hiện trên cùng, trên header:

```
┌────────────────────────────────┐
│ Có phiên bản mới    [Tải lại]  │  update-prompt
└────────────────────────────────┘
```

Nền tối, khác hẳn banner cảnh báo vàng. Không tự ẩn, không tự tải lại. Đang ở màn hình 4 thì bấm [Tải lại] hỏi "Nội dung đang nhập sẽ được giữ, mở lại phiếu để khôi phục. Tải lại?" [Huỷ] [Tải lại]; bấm [Tải lại] thì ghi nốt chữ đang gõ rồi mới tải lại.

**Trình duyệt không được hỗ trợ** (design §11.1): thay cho toàn bộ app khi thiếu API bắt buộc, không có màn hình nào khác.

```
┌────────────────────────────────┐
│ Khảo sát thực địa              │
├────────────────────────────────┤
│ Trình duyệt không được hỗ trợ  │  unsupported-browser
│ Dùng Chrome 120 trở lên trên   │
│ Android hoặc máy tính, hoặc    │
│ Safari 16.4 trở lên trên       │
│ iPhone.                        │
│ Thiếu: Web Locks               │  tên API thiếu, chữ nhỏ
└────────────────────────────────┘
```

**Menu điều hướng** (TV1-12, Dương chốt 2026-10-26; `components/NavMenu.tsx`, luật ở `client/src/navMenu.ts`): chỉ ở màn hình 2, 6, 8, 9. Màn hình 1, 3, 4, 5 và trang quản trị không có (3, 4, 5 dùng "← Quay lại").

```
Điện thoại (< 1024px)
┌────────────────────────────────┐
│ ☰    ▣ Khảo sát thực địa    ⟳  │
│ Menu   ● Trực tuyến      Đồng bộ│
├──────────────────┬─────────────┤
│ ▤ Phiếu          │░░ nền mờ ░░░│  mục đang ở nền vàng, vạch trái
│ ▦ Tổ chức        │░░░░░░░░░░░░░│
│ 👥 Thành viên    │░░░░░░░░░░░░░│  (supervisor, owner)
│ ⚙ Cài đặt        │░░░░░░░░░░░░░│
└──────────────────┴─────────────┘

Máy tính (≥ 1024px)
┌──────────────────────────────────────────────┐
│ ▣ Khảo sát thực địa                ⟳ Đồng bộ │  header rộng hết màn
├──────────────┬───────────────────────────────┤
│ ▤ Phiếu      │ [bộ chọn dự án]               │
│ ▦ Tổ chức    │ nội dung (tối đa 720px)       │
│ 👥 Thành viên │                               │
│ ⚙ Cài đặt    │                               │
└──────────────┴───────────────────────────────┘
```

- Mục: **Phiếu** (`#/`), **Tổ chức** (`#/orgs`), **Thành viên** (`#/members`, chỉ supervisor và owner), **Cài đặt** (`#/settings`). Mỗi dòng biểu tượng nét đơn + chữ, cao ≥ 44px; mục đang ở nền vàng nhấn, vạch trái đậm, chữ đậm (không chỉ phân biệt bằng màu, design §11.3) và có `aria-current="page"`. Chưa thuộc tổ chức nào (trang chủ là màn hình 9) thì không có mục Phiếu, mục Tổ chức đang chọn.
- Điện thoại: nút **Menu** (☰ + chữ nhỏ) đầu header, có `aria-expanded`; bấm thì ngăn kéo (`<nav>` tên "Menu", rộng 280px, tối đa 85% màn) trượt từ trái, nền mờ phía sau, con trỏ vào mục đầu. Esc, bấm nền mờ hoặc chọn một mục thì đóng, con trỏ về nút Menu. Rời trang bằng cách khác (nút Back) thì ngăn kéo cũng đóng, quay lại không tự mở. Ngăn kéo giữ con trỏ như hộp thoại: lúc mở, Tab ở mục cuối quay về mục đầu, Shift+Tab ngược lại (TV3-15 chốt 2026-10-29, design §14). Lúc ngăn kéo mở, phần trang phía sau (dải cập nhật, header, nội dung) có `inert`: không bấm, không Tab tới, trình đọc màn hình không vuốt ra được. Ngăn kéo đang mở mà màn hình rộng lên ≥ 1024px thì ngăn kéo đóng. Máy bật giảm chuyển động thì không trượt. Safe-area iPhone chưa thử máy thật (tech-debt N13).
- Máy tính: thanh bên rộng 240px luôn hiện, dính trái dưới header, không có nút Menu. Màn hình 3, 4, 5 không có thanh bên, nội dung 720px ở giữa.
- Giữ nguyên: [Đồng bộ] và trạng thái mạng trên header, "Tổ chức khác…" trong bộ chọn, "← Quay lại" ở màn hình 6, 8, 9.

---

## 1. Đăng nhập / Tạo tài khoản

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│  Khảo sát thực địa             │   │  Khảo sát thực địa             │
│ [Đăng nhập] [Tạo tài khoản]    │   │ [Đăng nhập] [Tạo tài khoản]    │
│  ─────────                     │   │              ─────────────     │
│  Tên đăng nhập                 │   │  Tên đăng nhập                 │
│  [                         ]   │   │  [                         ]   │  login-username
│  Mật khẩu                      │   │  chữ thường, số, . _ (3–32)    │
│  [                         ]   │   │  Tên hiển thị [            ]   │  register-name
│                                │   │  Mật khẩu     [            ]   │  login-password
│  [        Tiếp tục        ]    │   │  Nhập lại     [            ]   │  register-password2
│                                │   │  [     Tạo tài khoản      ]    │
│  ⚠ Sai tên đăng nhập hoặc mật  │   │  ⚠ Tên đăng nhập đã có người   │  (409 username_taken)
│    khẩu                        │   │    dùng                        │
│  ⚠ Thử lại sau ít phút         │   │  ⚠ Mật khẩu nhập lại không khớp│
│  ⚠ Cần kết nối mạng            │   │  ⚠ Cần kết nối mạng            │
└────────────────────────────────┘   └────────────────────────────────┘
```

- Tài khoản admin đăng nhập ở đây: "Tài khoản quản trị dùng trang /admin" kèm link, không lưu token.
- Bị đưa về đây vì server từ chối phiên (`401`: bị thu hồi, tài khoản bị khoá): hiện "⚠ Phiên đăng nhập hết hạn, đăng nhập lại" (`session-expired`) tới khi đăng nhập lại; tự đăng xuất thì không hiện (design §8). Đang có thông báo khác thì dải này tạm ẩn, kể cả khi mất mạng: chỉ hiện một dải "Cần kết nối mạng", có mạng lại thì hiện lại.
- Sau khi đăng nhập: chưa thuộc tổ chức nào → màn hình 9; có → màn hình 2.
- Biến thể: đăng nhập tài khoản khác khi máy còn phiếu chưa gửi (design §4.7) hiện thông báo chặn kèm nút "Xuất JSON"; bấm xong hiện ngay dưới nút "Đã tải N file.", hoặc "Máy không còn phiếu chưa gửi. Bấm Tiếp tục để đăng nhập lại.", hoặc "Không xuất được file, thử lại." (`export-note`).
- Có code (TV1-14, `client/src/pages/LoginPage.tsx`): hai tab có `role="tab"`; nút gửi là "Tiếp tục" (Đăng nhập) hoặc "Tạo tài khoản". Gợi ý "chữ thường, số, . _ (3–32)" chỉ hiện ở tab Tạo tài khoản. Tab Đăng nhập không kiểm mẫu tên (tài khoản cũ tên là `u_xxxxxxxx`). Đổi tab thì xoá thông báo cũ. Câu lỗi phía client và câu từ chối đổi tài khoản: design §4.7.
- Bố cục theo bản thiết kế khung 1a–1g (TV1-12 b2 p6): hai tab dạng công tắc (vẫn `role="tab"` + `aria-selected`), nút gửi rộng hết hàng. Lỗi do người dùng (nhập sai, "Thử lại sau ít phút", tài khoản quản trị) chữ đỏ ngay dưới nút, link "/admin" gạch chân. "Cần kết nối mạng" (cả khi mạng rớt lúc bấm gửi) và "Phiên đăng nhập hết hạn…" không phải lỗi của người dùng nên nền vàng. Bị chặn: khối vàng có viền, [Xuất JSON] nút thường, dòng kết quả chữ đen ("Không xuất được file, thử lại." chữ đỏ).
- Chưa thuộc tổ chức nào (có code, TV1-15, `client/src/pages/HomePage.tsx`): trang chủ hiện màn hình 9 tại chỗ, địa chỉ vẫn là `#/`, không chuyển sang `#/orgs`. Yêu cầu mở tổ chức được duyệt hoặc được thêm vào tổ chức thì vòng đồng bộ kế tiếp tự đưa về màn hình 2 của tổ chức đó.

## 2. Danh sách phiếu (trang chủ)

```
┌────────────────────────────────┐
│ [Y tế xã Tân Lập ▾]   ● Ngoại tuyến │  project-switcher, online-state
│ ⚠ Có 3 phiếu chưa đồng bộ hơn 1 ngày│
│ Cần xử lý: 1          [Đồng bộ]│
├────────────────────────────────┤
│ 🔍 Tìm phiếu…                  │
│ (Tất cả)(Cần xử lý)(Chưa đồng bộ)(Nháp)(Lỗi) │
├────────────────────────────────┤
│ Khảo sát hộ gia đình (12)  [+ Phiếu mới] │
│ ┌────────────────────────────┐ │
│ │ Nguyễn Văn An              │ │
│ │ Chờ đồng bộ · 14:32        │ │  sync-state
│ ├────────────────────────────┤ │
│ │ Trần Thị Bình              │ │
│ │ Cần xử lý xung đột · 09:10 │ │
│ ├────────────────────────────┤ │
│ │ Phiếu chưa có tên          │ │
│ │ Nháp · hôm qua             │ │
│ └────────────────────────────┘ │
│ (supervisor) [Sửa form] [Xuất] │
└────────────────────────────────┘
```

Code (TV1-12 b2 p2, theo bản thiết kế): mỗi form là một thẻ màu (5 màu xoay vòng) gồm tên form, nút [+ Tạo phiếu mới] rộng hết thẻ và (supervisor) [Sửa form] [Xuất ▾]; bấm [Xuất ▾] hiện hai lựa chọn [Xuất CSV] [Xuất JSON], Esc hoặc bấm ra ngoài thì đóng; trình đọc màn hình đọc nút Xuất kèm tên form. "+ Biểu mẫu mới" là dòng riêng dưới các thẻ. "Cần xử lý (n)" là viên thuốc đỏ cạnh tiêu đề "Phiếu đã nhập". Chưa có phiếu nào thì ẩn bộ lọc. Khác hình phác: phiếu không nằm trong thẻ form mà ở mục "Phiếu đã nhập" bên dưới, chia nhóm theo form (tech-debt N10): mỗi nhóm có tiêu đề "Khảo sát hộ gia đình (12)" (heading, vạch trái cùng màu thẻ form), thứ tự nhóm như thứ tự thẻ, form chưa có phiếu thì không có nhóm; phiếu có form không còn trên máy ở nhóm cuối "Biểu mẫu chưa có trên máy (n)" (vạch xám). Khi bộ lọc đang bật, số trong ngoặc đếm theo bộ lọc, nhóm không còn phiếu khớp thì ẩn. Mỗi dòng phiếu: biểu tượng trạng thái, tiêu đề theo §4.8 ("Phiếu chưa có tên" khi rỗng, N11), nhãn trạng thái · giờ sửa cuối, mũi tên ›; bấm chỗ nào ở phần trên của dòng cũng mở phiếu, "Cần xử lý xung đột" là link riêng sang màn hình 3. Giờ sửa: hôm nay "14:32", hôm qua "hôm qua", cũ hơn "24/10", khác năm "24/10/2025". Thành viên, Cài đặt vào từ menu (mục "Menu điều hướng"; TV1-12 bỏ khối Thành viên cuối trang và nút Cài đặt trên header).

Code (tự lưu chữ đang gõ phần 2, Could, Dương chốt 2026-10-30; design §4.8): phiếu mới gõ dở mà chưa Lưu lần nào (app bị tắt, tải lại ở trang khác) thì dưới banner dự án đã rời và các cảnh báo, trên mục "Biểu mẫu", có dải nền vàng nhạt (`typing-unsaved`, tiêu đề là heading):

```
┌────────────────────────────────┐
│ Phiếu đang nhập dở, chưa lưu   │
│ Nguyễn Văn A                 › │
│ Khảo sát hộ gia đình · 14:32   │
└────────────────────────────────┘
```

Mỗi phiếu một dòng trong danh sách, cả dòng là link tới màn hình 4 (ở đó hỏi [Khôi phục] / [Bỏ]): tiêu đề phiếu chữ đậm ("Phiếu chưa có tên" khi rỗng), dưới là tên form · giờ gõ cuối chữ nhạt (giờ như dòng phiếu; dấu " · " ẩn khỏi trình đọc màn hình). Không có nút Bỏ ở trang chủ. Phiếu đã có trong danh sách không lên dải.

ADR 0003: các nút ghi "(supervisor)" hiện cho cả `owner` (có code: Sửa form, Thành viên); bộ chọn có thêm "Tổ chức khác…" mở màn hình 9 (có code, TV1-15: nút dưới danh sách tổ chức; chỉ một tổ chức thì là link cạnh tên); nhãn vai trò có thêm "Owner".

Bộ chọn dự án mở ra (trong hai hình, ▾ và ✓ là biểu tượng SVG ẩn khỏi trình đọc màn hình, không phải ký tự trong tên nút; tên nút có ô chữ cái ẩn tương tự; dự án đang chọn đánh dấu bằng `aria-current`, TV1-12 b2):

```
┌────────────────────────────────┐
│ ✓ Y tế xã Tân Lập              │
│   Giám sát viên · 1 cần xử lý  │
│   HTX Nông nghiệp              │
│   Điều tra viên · 4 chưa đồng bộ│
│   Dự án cũ            Đã rời   │  (mờ)
└────────────────────────────────┘
```

Banner khi bị rút còn dữ liệu: "Bạn không còn thuộc dự án X. N phiếu chưa gửi được [Xuất JSON] [Xoá khỏi máy]". [Xoá khỏi máy] hỏi bằng hộp trong app "Xoá N phiếu chưa gửi của dự án X khỏi máy? Không khôi phục được." [Huỷ] [Xoá khỏi máy] (nút đỏ).

Code (TV1-06): bộ chọn nằm ở một hàng riêng ngay dưới header (header đã có Menu, tên app, trạng thái mạng, Đồng bộ; không đủ chỗ ở 360px); danh sách mở ra đẩy nội dung xuống. Dòng "Đã rời" không bấm được. Chưa có dự án active: "Đang tải danh sách dự án…" (chưa nhận `/me`) (`data-testid="no-project"`); chưa thuộc tổ chức nào thì trang chủ là màn hình 9 Tổ chức (TV1-15).

Code (TV1-12 b1): dự án chưa có phiếu nào thì dưới bộ lọc hiện "Chưa có phiếu nào." (`records-empty`); có phiếu mà bộ lọc ra rỗng thì "Không có phiếu nào ở trạng thái này." (`no-records`).

## 3. Xung đột

Trên điện thoại dùng **thẻ mỗi trường**, không dùng bảng 4 cột.

```
┌────────────────────────────────┐
│ ← Xử lý xung đột               │
│ Trong lúc bạn ngoại tuyến, Lan │
│ đã sửa phiếu này (lần cuối     │
│ 14:32 07/10). 2 trường đã được │
│ gộp tự động. Các trường dưới   │
│ đây cả hai bên cùng sửa, hãy   │
│ chọn giá trị giữ lại.          │
├────────────────────────────────┤  conflict-table
│ Số thành viên                  │
│   Trước đó:      4             │
│ ( ) Của bạn:     5             │
│ ( ) Trên máy chủ: 6            │
├────────────────────────────────┤
│ Nguồn nước (multiselect)       │
│   Trước đó:      Máy           │
│ ( ) Của bạn:     Máy; Giếng    │
│ ( ) Trên máy chủ: Máy; Sông    │
│ ( ) Gộp cả hai:  Máy; Giếng; Sông │
├────────────────────────────────┤
│ ▸ Đã gộp tự động (2 trường)    │
├────────────────────────────────┤
│ [         Áp dụng          ]   │  khoá tới khi chọn hết
└────────────────────────────────┘
```

Hộp thoại xoá vs sửa (ADR 0001 quy tắc 6, không chọn sẵn):

```
┌────────────────────────────────┐
│ Bạn đã xoá phiếu này nhưng Lan │
│ vừa sửa nó.                    │
│ ( ) Giữ phiếu (với bản của Lan)│
│ ( ) Vẫn xoá                    │
└────────────────────────────────┘
```

Code (TV1-17): câu giải thích hiện tên người sửa cuối (`updatedByName`); xung đột lưu trước bản này hoặc không tìm thấy tài khoản thì hiện userId.

Code (TV1-12 b2 p3, theo bản thiết kế khung 3a–3c): câu giải thích là khối trắng viền đỏ bên trái; câu "N trường đã được gộp tự động." bỏ khi không có trường nào gộp hoặc khi là xoá vs sửa. Mỗi trường một thẻ trắng, "Trước đó" nền xám không bấm được; mỗi lựa chọn là cả một ô bấm lớn (radio thật trong ô), đã chọn thì viền đậm, nền vàng nhạt. "Đã gộp tự động (n trường)" là khối thu gọn có mũi tên. Xoá vs sửa: câu hỏi và hai lựa chọn trong một khối, lựa chọn làm mất dữ liệu ("Vẫn xoá", "Bỏ") chữ đỏ. [Áp dụng và đồng bộ] rộng hết hàng.

## 4. Điền / xem phiếu

```
┌────────────────────────────────┐
│ ← Khảo sát hộ gia đình (v2)    │
│ ⚠ Phiếu này cần xử lý xung đột │  (khi conflict: chỉ đọc)
│   trước  [Xử lý]               │
├────────────────────────────────┤
│ Tên chủ hộ *                   │
│ [                          ]   │
│ ⚠ Bắt buộc                     │  (lỗi validate, phiếu thành Nháp)
│ Số thành viên                  │
│ [ 4                        ]   │
│ Ảnh                            │
│ [▢][▢] [+ Chụp ảnh]            │
│ Vị trí                         │
│ 10.7769, 106.7009 ±12 m [Lấy vị trí] │
├────────────────────────────────┤
│ [      Lưu      ]  [Xoá phiếu] │
└────────────────────────────────┘
```

Nhãn trạng thái ở đầu trang dùng cùng hàm `displayState` với danh sách. Phiếu lỗi có thêm "Thử lại" và "Xuất JSON phiếu này".

Code: trang điền phiếu có link "← Quay lại" ở đầu trang (về danh sách; phần chưa bấm Lưu nằm trong bộ đệm, mở lại phiếu thì hỏi khôi phục); nút "Lưu" rộng hết hàng trên điện thoại.

Code (TV1-10): trường ẩn không hiện ở phiếu mới; phiếu đã có giá trị ở trường ẩn thì trường hiện với ô bị khoá, nhãn kèm "(đã ẩn)"; giá trị sai định dạng (phiếu nháp báo lỗi ở trường đó) thì ô mở cho sửa. Máy chưa có bản form của phiếu: "Đang tải biểu mẫu…" rồi mở phiếu; offline hoặc tải không được: "Cần kết nối để mở phiếu này" kèm "← Quay lại".

Code (TV1-12 b1): trường Vị trí là nhóm (`role="group"`, như trường Ảnh), bấm vào tên trường không tự lấy vị trí. Bấm [Lấy vị trí]: nút khoá, "Đang lấy vị trí…", chờ tối đa 30 s; không lấy được thì câu lỗi dưới nút (`gps-error`), câu theo design §8.

Code (TV1-12 b2 p3, theo bản thiết kế khung 4a–4g): đầu trang là khối tên biểu mẫu cùng màu với thẻ của form đó ở màn hình 2. Hàng nút [Xoá phiếu] (viền đỏ) [Lưu] dính đáy màn hình, nằm trong luồng trang nên cuộn hết cỡ vẫn không che trường cuối; phiếu chỉ đọc không có hàng nút. Dấu * đỏ cạnh nhãn trường bắt buộc, ô có lỗi viền đỏ. Chọn nhiều là các ô lớn hai cột (ô đánh dấu thật trong ô, bấm chỗ nào cũng chọn); trường là nhóm (`role="group"`) mang tên trường như Ảnh, Vị trí, bấm tên trường không đánh dấu ô nào (trước đó trường bọc trong nhãn: bấm tên trường đánh dấu ô đầu, ô đầu bị đọc kèm tên trường và mọi lựa chọn). Ảnh: lưới vuông 3 cột, nút × 36 px, nhãn "Chờ tải lên" / "Đang tải lên" / "Lỗi" ở góc dưới, ô [+ Chụp ảnh] có biểu tượng máy ảnh. Vị trí: toạ độ phông đều trên nút [Lấy vị trí]. Chỉ đọc (đang xung đột): dải đỏ nhạt có nút [Xử lý], ô khoá nhưng chữ vẫn đậm, không có nút × và ô chụp ảnh. Thiếu bản form: chữ ở giữa trang kèm biểu tượng (offline) hoặc vòng xoay (đang tải).

Code (tech-debt N12): phiếu đã có trên máy có nhãn trạng thái ngay dưới khối tên biểu mẫu (`record-state`, trên dải xung đột hay câu nháp), biểu tượng và màu như dòng phiếu ở màn hình 2, ở mọi trạng thái; phiếu mới chưa lưu thì không có. Phiếu Lỗi: dưới nhãn là câu lỗi (`sync-error`) + [Thử lại] + [Xuất JSON phiếu này], cùng khối với màn hình 2 (`components/RecordErrorBox.tsx`); bấm [Thử lại] thì ở lại trang, nhãn tự đổi. Ảnh lỗi không có nút ở màn hình này (nhãn "Lỗi" ở từng ảnh, nút ở màn hình 2).

Code (TV1-13): bấm [Xoá phiếu] mở hộp xác nhận trong app (không dùng hộp của trình duyệt) "Xoá phiếu này? Không hoàn tác được trên máy." với hai nút [Huỷ] (nhận focus đầu tiên) và [Xoá] màu đỏ; Esc hoặc Huỷ thì đóng hộp, không đổi gì. Phiếu đang xung đột: ẩn cả Lưu và Xoá (§4.5). Code (TV1-17): surveyor không thấy [Xoá phiếu] ở phiếu người khác tạo; phiếu chưa biết người tạo (mới tạo trên máy, hoặc tải về trước bản này) vẫn hiện nút.

Code (tự lưu chữ đang gõ, Could, Dương chốt 2026-10-30; design §4.1 "Bộ đệm đang nhập"): chữ chưa bấm Lưu được tự giữ trên máy. Mở lại phiếu có chữ đang gõ (tải lại, "← Quay lại" rồi mở lại, app bị tắt) thì dưới nhãn trạng thái có dải nền vàng nhạt như câu nháp (`typing-restore`, `role="status"`), form khoá tới khi chọn:

```
┌────────────────────────────────┐
│ Có nội dung đang nhập chưa lưu │
│ (14:32).                       │
│ [Khôi phục]  [Bỏ]              │
└────────────────────────────────┘
```

- Giờ theo cách của danh sách phiếu (hôm nay "14:32", hôm qua "hôm qua", cũ hơn "24/10"). [Khôi phục] là nút chính, [Bỏ] nút thường.
- Phiếu đã bị sửa ở nơi khác và có trường cả hai cùng sửa: sau [Khôi phục], dải (`typing-kept`) ghi "Đã khôi phục. Trường sau đã được sửa ở nơi khác nên giữ bản mới, nhập lại nếu cần:" rồi mỗi trường một dòng "Tên chủ hộ: bạn đã nhập "…"" (ảnh: "bạn đã chọn ảnh khác", vị trí: "bạn đã lấy vị trí khác", ô để trống: "bạn đã để trống"), nút [Đóng].
- Phiếu đã bị xoá: "Phiếu này đã bị xoá nên không khôi phục được nội dung đang nhập." [Bỏ].

## 5. Form builder

```
┌────────────────────────────────┐
│ ← Sửa form: Khảo sát hộ gia đình │
│ Tiêu đề [Khảo sát hộ gia đình] │
├────────────────────────────────┤
│ Trường                         │
│ ▸ Tên chủ hộ (text) *   [↑][↓] │  (đang chọn)
│   Số thành viên (number) [↑][↓]│
│   Trường cũ (text, ẩn)  [↑][↓] │
│ [+ Thêm trường ▾]              │
├────────────────────────────────┤
│ Thuộc tính: Tên chủ hộ         │
│ Nhãn  [Tên chủ hộ          ]   │
│ Mã    householdName (khoá)     │  chỉ sửa được với trường mới
│ [x] Bắt buộc   [ ] Ẩn          │
│ Lựa chọn (select): …           │
├────────────────────────────────┤
│ ⚠ Lỗi: Không được đổi loại     │  (invalid_form)
│   trường "members"             │
│ [Xem trước] [Lưu bản mới]      │
│ [Xuất form] [Nhập form]        │
└────────────────────────────────┘
```

Code (TV1-12 b1): link "← Quay lại" đầu trang về trang chủ; phần chưa bấm Lưu bản mới không được giữ (giống màn hình 4).

Code (gọn UI 13/10): bấm cả dòng để chọn trường, dòng đang chọn tô nền; nút ▲ ▼ (không dùng ↑ ↓ vì Windows vẽ thành emoji có màu); chưa chọn trường thì có dòng gợi ý "Bấm vào một trường để sửa…".

Code (TV1-04): mã gợi ý từ nhãn, khoá sau khi lưu ("<mã> (khoá)"); trường chưa lưu có nút "Xoá trường"; lựa chọn nhập mỗi dòng một lựa chọn; chọn loại trường bằng ô "Loại trường" cạnh nút "+ Thêm trường"; "Xem trước" hiện form với ô nhập bị khoá; lỗi hiện ở khung `builder-errors`. Trang chủ: "Sửa form" cạnh mỗi form và "+ Biểu mẫu mới" dưới danh sách, chỉ với giám sát viên. "Xuất form"/"Nhập form" là việc của TV1-10.

Code (TV1-10 phần 2): hàng nút [Xuất form] / [Nhập form] dưới [Xem trước] [Lưu bản mới]. Sửa form đã lưu chỉ có [Xuất form] (tải file JSON); "Biểu mẫu mới" chỉ có [Nhập form] (chọn file JSON, nạp vào builder, lỗi hiện ở `builder-errors`). Form mới trùng mã form đã có: "Mã biểu mẫu đã có trong dự án".

Code (TV1-12 b2 p4, theo bản thiết kế khung 5a–5e): ba khối trắng tách rõ: thông tin biểu mẫu (Tiêu đề, Mã biểu mẫu; mã đã lưu hiện phông đều kèm "(khoá)"), Trường (mỗi dòng bấm cả phần chữ để chọn, dòng đang chọn có vạch trái đậm và nền vàng nhạt, trường ẩn chữ xám, ▲▼ rộng 34 px cao 44 px; ô "Loại trường" có nhãn nhìn thấy, cạnh [+ Thêm trường]), Thuộc tính (Bắt buộc, Ẩn là ô lớn; [Xoá trường] viền đỏ). Chưa chọn trường: gợi ý trong khung viền nét đứt. Thứ tự dưới các khối: [Xuất form] / [Nhập form] (nút phụ) → khung xem trước (nếu đang bật) → khung lỗi → hàng nút [Xem trước] [Lưu bản mới] dính đáy màn hình. [Xem trước] đang bật: nền vàng nhạt viền đậm (`aria-expanded`, `aria-controls` trỏ khung). Bật xem trước thì trang cuộn tới khung; đầu khung có dải xanh nhạt "Đang xem trước, chưa sửa được. Bấm lại Xem trước để sửa tiếp." (chỉ để nhìn; trình đọc màn hình nghe câu này từ một vùng `role="status"` ẩn luôn có trên trang, bật thì có chữ, tắt thì rỗng); ô "+ Chụp ảnh" trong khung vẫn hiện nhưng nhìn ra khoá. Lưu lỗi thì trang cuộn tới khung lỗi.

Code (TV1-12 b2 p8, theo bản thiết kế khung 5f): đầu mỗi dòng trường có tay nắm ⠿ (vùng bấm 44×44, ẩn với trình đọc màn hình). Bấm giữ tay nắm rồi kéo lên xuống: dòng nổi lên có bóng và đi theo tay, các dòng khác trượt nhường chỗ, chỗ sẽ thả hiện ô kẻ sọc vàng; thả tay thì đổi thứ tự và dòng vừa kéo thành dòng đang chọn. Chỉ kéo từ tay nắm: bấm phần chữ vẫn là chọn trường, vuốt chỗ khác vẫn cuộn trang. Bấm tay nắm rồi thả tại chỗ không làm gì. Huỷ giữa chừng (Esc, hệ điều hành giành cử chỉ) thì các dòng về chỗ cũ. Giữ gần mép trên hoặc gần hàng nút dính đáy thì trang tự cuộn, thả tay là dừng. Máy bật giảm chuyển động thì các dòng không trượt. ▲ ▼ giữ nguyên; bấm ▲ ▼ ở dòng khác thì dòng đang chọn vẫn là trường đó (đi theo vị trí mới), ô Thuộc tính không đổi sang trường khác.

Code (TV1-12 sau audit/critique UI, A chốt thay Dương 2026-10-25): bấm chọn một trường hoặc [+ Thêm trường] (trường mới tự được chọn) thì trang cuộn để khối Thuộc tính lên đầu màn hình (máy bật giảm chuyển động thì nhảy thẳng, không cuộn mượt); con trỏ bàn phím vẫn ở nút vừa bấm. ▲ ▼, kéo thả, Nhập form không cuộn. Chưa có trường nào: trong khối Trường có câu chữ nhạt "Chưa có trường nào. Chọn loại trường rồi bấm + Thêm trường." (`builder-fields-empty`), không vẽ khung danh sách rỗng. Bỏ trống mã biểu mẫu thì khung lỗi báo "Nhập mã biểu mẫu" (thay câu "Mã biểu mẫu "" không hợp lệ…"; mã gõ sai mẫu vẫn dùng câu cũ). Bấm Lưu (hoặc Nhập form) mà mã trống, sai mẫu hay trùng form đã có thì ô Mã biểu mẫu viền đỏ kèm `aria-invalid`; gõ lại mã đúng thì hết ngay. Không đủ quyền ("Chỉ giám sát viên và Owner được sửa biểu mẫu.") hoặc địa chỉ form không có ("Không tìm thấy biểu mẫu.") vẫn có "← Quay lại" đầu trang.

## 6. Thành viên (TV1-08, theo ADR 0003)

```
┌────────────────────────────────┐
│ ← Thành viên · Y tế Tân Lập    │
│ Thêm theo tên đăng nhập        │
│ [                          ]   │  member-username
│ Vai trò [Điều tra viên ▾]      │  (owner chọn thêm Giám sát viên, Owner)
│ [          Thêm           ]    │
│ ⚠ Không có tên đăng nhập này   │  (404) / Đã là thành viên (409)
├────────────────────────────────┤
│ Lan (lan) · Owner              │
│ Minh (minh) · Điều tra viên [⋯]│  ⋯: Đổi vai trò, Rút khỏi tổ chức
├────────────────────────────────┤
│ (owner) Tên tổ chức [        ] │
│ (owner) [ ] Công khai tên tổ   │  org-public
│             chức               │
└────────────────────────────────┘
```

Supervisor chỉ thấy thao tác với điều tra viên. Rút người và tự hạ vai trò hỏi bằng hộp trong app: [Huỷ] [Rút] (đỏ) / [Huỷ] [Đổi vai trò]. Lỗi `last_owner`: "Tổ chức phải còn ít nhất một Owner".

Code (`client/src/pages/MembersPage.tsx`, luật hiển thị ở `client/src/members.ts`):
- Vào từ mục **Thành viên** trong menu (chỉ supervisor, owner thấy mục này; TV1-12 thay link cuối trang chủ). Link "← Quay lại" ở đầu trang về `#/` như màn hình 5, 8 (TV1-12, thay "← Về danh sách phiếu" ở cuối trang); có cả khi không đủ quyền ("Chỉ giám sát viên và Owner xem được trang này."). Cần mạng: offline hoặc mất mạng giữa chừng hiện "Cần kết nối mạng để quản lý thành viên" kèm nút **Thử lại**.
- Mỗi dòng (`member-<username>`), Owner trước: vòng chữ cái đầu tên; dòng 1 tên đậm + "(tên đăng nhập)" chữ nhạt, dòng 2 nhãn vai trò mỗi vai một màu (Owner tím, Giám sát viên xanh, Điều tra viên xám; chữ vẫn ghi vai trò). Hai dòng nên bỏ " · " giữa tên và vai trò (TV1-12 b2). Thay cho [⋯]: ô chọn **Đổi vai trò…** (chỉ Owner, các vai trò khác vai trò hiện tại) kèm nút **Đổi**, và nút **Rút**. Ô chọn chỉ để chọn, bấm [Đổi] mới gửi; [Đổi] khoá tới khi đã chọn vai trò, xong thì ô về "Đổi vai trò…" (TV1-12: đổi ngay khi ô đổi giá trị thì bấm mũi tên trên ô đang đóng là đổi luôn). Trình đọc màn hình: ô "Vai trò mới của <tên đăng nhập>", nút "Đổi vai trò <tên đăng nhập>". Supervisor chỉ có nút Rút ở dòng điều tra viên, không có thao tác ở dòng của mình.
- Ô Vai trò khi thêm: supervisor chỉ có "Điều tra viên". Lỗi hiện dưới form (`member-error`, bắt đầu bằng ⚠ như màn hình 1, 9; câu lỗi khi tải cũng vậy): "Không có tên đăng nhập này" (cả khi tài khoản bị khoá), "Người này đã là thành viên", "Không thêm được tài khoản quản trị", "Tổ chức phải còn ít nhất một Owner", "Máy chủ đang lỗi, thử lại sau". Tải danh sách lỗi thì hiện câu lỗi kèm nút "Thử lại" (TV1-12 b2: nút ở dòng riêng, ngoài vùng `role="alert"`, để trình đọc màn hình không đọc lẫn vào câu lỗi).
- Rút người khác hỏi "Rút <tên> (<tên đăng nhập>) khỏi tổ chức?". Tự hạ hỏi "Bạn sẽ mất quyền <vai trò> ngay, chỉ còn quyền <vai trò mới>. Tiếp tục?"; tự rút hỏi "Bạn sẽ rời tổ chức này ngay…". Xong thì đồng bộ để vai trò mới có hiệu lực rồi về trang chủ.
- Bố cục theo bản thiết kế khung 6a–6e (TV1-12 b2 p5): khối thêm người (nút [Thêm] rộng hết hàng, lỗi ngay dưới nút), khối danh sách, khối Tổ chức (Owner); thao tác "Đổi vai trò…" [Đổi] và [Rút] viền đỏ ở dòng dưới tên (chật thì [Rút] xuống dòng).
- Owner: ô **Tên tổ chức** kèm nút **Lưu tên** (bộ chọn dự án đổi tên sau vòng đồng bộ); ô **Công khai tên tổ chức** (`org-public`) lưu ngay khi bấm, hiện theo giá trị server trả về.

## 7. ~~Dự án (quản trị)~~

Bỏ. Admin dùng trang quản trị riêng, xem A1–A3 dưới đây.

## 8. Cài đặt

Theo ADR 0003 (TV1-07): hiện **tên đăng nhập** thay mã người dùng; Đăng xuất gọi thêm `POST /api/auth/logout` khi online (TV2-16). Máy lưu thông tin tài khoản từ bản cũ (chưa có tên đăng nhập) thì hiện mã người dùng tới lần đồng bộ kế tiếp; tài khoản cũ có tên đăng nhập trùng mã.

Mở từ mục "Cài đặt" trong menu (TV1-12 thay nút trên header). Đọc từ IndexedDB, dùng được khi offline (trừ Đổi mật khẩu, cần mạng). Có code (TV1-12 b1): link "← Quay lại" đầu trang về `#/` (chưa thuộc tổ chức nào thì về màn hình 9).

```
┌────────────────────────────────┐
│ ← Cài đặt                      │
├────────────────────────────────┤
│ Tài khoản                      │
│ Dương                          │
│ Tên đăng nhập: duong           │  settings-username
│ (Gửi tên này cho giám sát viên │  chưa thuộc tổ chức nào
│  của tổ chức để được thêm vào.)│
│ (Giám sát viên hoặc Owner cần  │  đã thuộc tổ chức
│  tên này nếu muốn thêm bạn vào │
│  tổ chức khác.)                │
├────────────────────────────────┤
│ Đổi mật khẩu                   │
│ [     Đổi mật khẩu…          ] │  aria-expanded; bấm thì mở:
│ Mật khẩu hiện tại [          ] │
│ Mật khẩu mới [               ] │
│ Nhập lại mật khẩu mới [      ] │
│ [Đổi mật khẩu] [Huỷ]           │
│ ⚠ Mật khẩu hiện tại không đúng │  change-password-error
│ ✓ Đã đổi mật khẩu. Các máy khác│  change-password-done (khối đã đóng)
│   cần đăng nhập lại.           │
├────────────────────────────────┤
│ Dung lượng                     │
│ Đã dùng 1,2 MB / 2,0 GB        │  settings-storage
├────────────────────────────────┤
│ Cài lên màn hình chính         │  settings-install
│ Android: mở bằng Chrome, bấm   │
│  menu ⋮ rồi chọn "Cài đặt ứng  │
│  dụng" hoặc "Thêm vào màn hình │
│  chính".                       │
│ iPhone: mở bằng Safari, bấm    │
│  nút Chia sẻ rồi chọn "Thêm    │
│  vào màn hình chính". Trên     │
│  iPhone phải cài thì dữ liệu   │
│  chưa gửi mới không bị xoá sau │
│  7 ngày không mở.              │
├────────────────────────────────┤
│ [Đăng xuất]                    │  logout-button
│ Còn 3 phiếu chưa gửi ở dự án   │  logout-blocked (khi bị khoá)
│ "Y tế xã Tân Lập". Đồng bộ     │
│ xong mới đăng xuất được.       │
└────────────────────────────────┘
```

- Chưa có `userId` (chưa gọi được `/me` lần nào): hiện "Chưa có, cần kết nối mạng một lần".
- **Đổi mật khẩu** (design §4.7, US-13; Dương chốt 2026-10-26): chỉ hiện khi đã có thông tin tài khoản. Khối ngay dưới Tài khoản chỉ có nút [Đổi mật khẩu…] (`aria-expanded`) để trang gọn và trình duyệt không tự điền mật khẩu mỗi lần mở Cài đặt. Bấm thì mở ba ô "Mật khẩu hiện tại", "Mật khẩu mới", "Nhập lại mật khẩu mới" (`autocomplete` `current-password` / `new-password`) kèm [Đổi mật khẩu] [Huỷ], con trỏ vào ô đầu. [Huỷ] hoặc bấm lại [Đổi mật khẩu…] thì đóng khối, xoá chữ đã gõ, con trỏ về nút. Kiểm trước khi gửi, theo thứ tự: "Nhập mật khẩu hiện tại", "Mật khẩu cần từ 8 đến 128 ký tự", "Mật khẩu nhập lại không khớp". Đang gửi: vòng xoay trên nút, chữ phụ "Đang đổi mật khẩu…". Lỗi (`change-password-error`, ⚠, `role="alert"`, khối giữ mở): `wrong_password` "Mật khẩu hiện tại không đúng", `too_many_requests` "Thử lại sau ít phút", máy chủ lỗi "Máy chủ đang lỗi, thử lại sau", mất mạng giữa chừng "Cần kết nối mạng để đổi mật khẩu". Offline: [Đổi mật khẩu] khoá, dưới nút có câu "Cần kết nối mạng để đổi mật khẩu" (`change-password-offline`, gắn vào nút bằng `aria-describedby`). Đổi xong: đóng khối, xoá chữ, con trỏ về [Đổi mật khẩu…], dòng xanh có dấu tích "Đã đổi mật khẩu. Các máy khác cần đăng nhập lại." (`change-password-done`, báo cho trình đọc màn hình qua vùng `role="status"` ẩn luôn có sẵn); mở lại khối thì dòng này mất. Máy đang dùng vẫn đăng nhập.
- Trình duyệt không có `storage.estimate`: ẩn dòng dung lượng.
- **Đăng xuất** chỉ bật khi mọi dự án không còn dữ liệu chưa gửi (`hasUnsentData`). Bấm → hộp xác nhận "Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng." [Huỷ] [Đăng xuất]. Đồng ý → xoá mọi CSDL dự án, cache `me`/`forms` của SW và token, về màn hình 1. Nút khoá thì dòng `logout-blocked` gắn vào nút (`aria-describedby`), trình đọc màn hình đọc lý do khi tới nút. Lúc bấm [Đăng xuất] trong hộp mới thấy còn dữ liệu chưa gửi (vd. vừa lưu ở tab khác) thì không xoá gì, báo "⚠ Còn dữ liệu chưa gửi ở dự án …" (`role="alert"`, dưới nút).
- Đang mở từ app đã cài (design §4.3): mục cài chỉ ghi "Đã cài lên màn hình chính." (dòng chữ xanh có dấu tích).
- Bố cục theo bản thiết kế khung 8a–8c (TV1-12 b2 p6): bốn khối Tài khoản, Dung lượng, Cài lên màn hình chính, Đăng xuất. Tên hiển thị chữ to, tên đăng nhập phông đều nền vàng nhạt, câu hướng dẫn chữ nhạt. Dưới dòng dung lượng có thanh tiến độ (`aria-hidden`, chữ đã nói con số); trình duyệt không báo hạn mức thì không vẽ thanh (`usagePercent`). [Đăng xuất] viền đỏ rộng hết hàng; bị khoá thì xám như mọi nút khoá, dòng giải thích nền vàng ngay dưới nút.

## 9. Tổ chức (TV1-15)

Vào từ mục **Tổ chức** trong menu (TV1-12) hoặc "Tổ chức khác…" ở bộ chọn dự án.

```
┌────────────────────────────────┐
│ ← Quay lại                     │
│ Tổ chức                        │
│ Tên đăng nhập của bạn: minh    │
│ Gửi tên này cho giám sát viên  │
│ của tổ chức để được thêm vào.  │
├────────────────────────────────┤
│ Tổ chức công khai              │  directory
│  Y tế xã Tân Lập               │
│  HTX Nông nghiệp               │
│  (rỗng: Chưa có tổ chức công   │
│   khai nào)                    │
├────────────────────────────────┤
│ Yêu cầu của bạn                │  org-requests
│  HTX Rau sạch                  │
│  Đang chờ duyệt         [Huỷ]  │
│  (hoặc: Bị từ chối: <lý do>)   │
├────────────────────────────────┤
│ Mở tổ chức mới                 │
│ Tên [                        ] │  org-request-name
│ Ghi chú cho quản trị [       ] │
│ [       Gửi yêu cầu       ]    │
│ ✓ Đã gửi yêu cầu               │  org-request-sent
└────────────────────────────────┘
```

Vào được từ bộ chọn dự án ("Tổ chức khác…") và là màn hình mặc định khi chưa thuộc tổ chức nào. Cần mạng.

Có code (TV1-15, `client/src/pages/OrgsPage.tsx`): là trang chủ thì có thêm dòng "Bạn chưa thuộc tổ chức nào." và không có link "← Về danh sách phiếu"; mở từ bộ chọn thì có link đó ở cuối trang (TV1-12 sau audit UI đổi thành "← Quay lại" đầu trang, xem đoạn cuối). Đang chờ danh sách (online, chưa lỗi): "Đang tải…" (`directory-loading`, TV1-12 b1). `data-testid`: `orgs`, `orgs-username`, `directory`, `directory-empty`, `org-request-name`, `org-request-note`, `org-request-error`, `org-requests`, `org-request-status`. Câu chữ: design §4.7.

Code (TV1-12 b2 p5, theo bản thiết kế khung 9a–9e): là trang chủ thì dòng "Bạn chưa thuộc tổ chức nào.", tên đăng nhập và câu hướng dẫn nằm trong khối chào nền vàng nhạt; mở từ bộ chọn thì là khối trắng. Tên đăng nhập phông đều, cỡ to. Câu lỗi (ngoại tuyến, máy chủ lỗi) ngay dưới khối tên. Danh sách chưa tải được (ngoại tuyến hoặc máy chủ lỗi) thì ẩn cả khối "Tổ chức công khai"; đã tải rồi mới mất mạng thì giữ; đang tải thì có vòng xoay kèm "Đang tải…". Mỗi tổ chức công khai có ô chữ cái, chỉ để đọc. "Yêu cầu của bạn": tên và trạng thái hai dòng nên bỏ " · "; trạng thái có biểu tượng và màu như trạng thái phiếu (chờ: đồng hồ xám, bị từ chối: đỏ, đã duyệt: tích xanh, đã huỷ: xám), [Huỷ] là nút phụ. Sau audit/critique UI (TV1-12, Dương chốt 2026-10-24/25): "← Quay lại" ở đầu trang như màn hình 5, 6, 8 (trang chủ của người mới thì không có), thay "← Về danh sách phiếu" ở cuối trang; khối "Yêu cầu của bạn" nằm ngay trên khối "Mở tổ chức mới"; gửi thành công thì ngay dưới nút có dòng xanh có dấu tích "Đã gửi yêu cầu" (`org-request-sent`, báo cho trình đọc màn hình qua vùng `role="status"` ẩn luôn có sẵn), gõ lại ô, gửi lại, Huỷ hay gặp lỗi thì dòng này mất; [Huỷ] có tên đọc ra "Huỷ yêu cầu <tên tổ chức>".

---

# Trang quản trị (`/admin/`, TV1-16)

Tách khỏi PWA (design §4.9): bố cục cho máy tính, luôn online, không lưu gì trên máy ngoài token phiên trong `sessionStorage`. Thanh trên: "Quản trị · Yêu cầu (n) · Tổ chức · Tài khoản · [tên admin] Đăng xuất". Đường dẫn: A1 `/admin/#/`, A2 `/admin/#/projects`, A3 `/admin/#/users`. Kết quả thao tác hiện một dòng trên bảng ("Đã duyệt: … (mã p-…)", lỗi bắt đầu bằng ⚠); phiên bị thu hồi thì về form đăng nhập với "Phiên đăng nhập hết hạn, đăng nhập lại". Tải danh sách lần đầu bị lỗi (lỗi có mã, máy chủ lỗi, mất mạng) thì chỉ có dòng lỗi, không còn "Đang tải…"; không có nút Thử lại: A3 bấm [Tìm], A1/A2 chuyển mục trên thanh trên rồi quay lại hoặc tải lại trang.

Bố cục theo bản thiết kế khung A0–A2b (TV1-12 b2 p7): đăng nhập là thẻ giữa màn hình (logo + "Quản trị", nút rộng hết hàng); "Cần kết nối mạng" và "Phiên đăng nhập hết hạn…" nền vàng (không phải lỗi của người dùng), lỗi khác chữ đỏ. Thanh trên: logo, "Quản trị", hai mục dạng viên (mục đang xem nền vàng nhạt, gạch vàng dưới), tên admin chữ nhạt, [Đăng xuất] nút thường nhỏ. Dòng kết quả: thành công nền xanh nhạt có dấu tích (`role="status"`), lỗi nền đỏ nhạt bắt đầu bằng ⚠ (`role="alert"`); cả hai `admin-notice`. Thao tác xong mà con trỏ bàn phím mất chỗ (dòng vừa duyệt/từ chối biến mất, hàng Thêm Owner đóng, [Mở] thành [Khoá]) thì con trỏ về dòng kết quả, không phải Tab lại từ đầu trang. Bảng trong khối bo góc, tên đậm, cột Lúc chữ nhạt, nút căn phải. Ở 360 px bảng cuộn ngang trong khung.

## A1. Yêu cầu mở tổ chức

```
┌──────────────────────────────────────────────────────────────────┐
│ Tên tổ chức    Người gửi      Lúc          Ghi chú               │
│ HTX Rau sạch   Hoa (hoa)      12/10 09:12  Khảo sát 200 hộ…      │
│                                       [Duyệt] [Từ chối…]         │
│ (rỗng: Không có yêu cầu nào đang chờ)                            │
└──────────────────────────────────────────────────────────────────┘
Từ chối… mở ô nhập lý do (bắt buộc) rồi [Xác nhận từ chối] (khoá tới khi có lý do). [Duyệt] không hỏi lại.
```

- Ghi chú rỗng hiện "—". Rỗng cả danh sách: khối có biểu tượng hộp thư + "Không có yêu cầu nào đang chờ".
- [Từ chối…]: dòng đó nền vàng nhạt, ô "Lý do từ chối" (nhiều dòng) + [Xác nhận từ chối] (đỏ) + [Huỷ] ở hàng ngay dưới (`request-expand-<id>`). Mở thì con trỏ vào ô lý do; [Huỷ] trả con trỏ về [Từ chối…].

## A2. Tổ chức

```
┌──────────────────────────────────────────────────────────────────┐
│ Tên            Owner     Thành viên  Trạng thái                  │
│ Y tế Tân Lập   lan       5           Đang dùng   [Khoá]          │
│ HTX Rau sạch   hoa       2           Đã khoá     [Mở]            │
│                                       [Thêm Owner…]              │
└──────────────────────────────────────────────────────────────────┘
Khoá hỏi xác nhận: "Khoá "<tên>"? Mọi thành viên sẽ không đồng bộ được với tổ chức này." Mở không hỏi.
Thêm Owner… mở ô "Tên đăng nhập của Owner mới" + [Thêm làm Owner], dưới ô: "Owner cũ vẫn giữ quyền; muốn bỏ thì Owner rút ở màn hình Thành viên." Owner rỗng hiện "Chưa có Owner".
```

- Mã tổ chức `p-…` chữ nhỏ nhạt dưới tên. "Chưa có Owner" chữ nghiêng nhạt. Trạng thái có biểu tượng: "Đang dùng" tích xanh, "Đã khoá" ổ khoá xám.
- [Thêm Owner…] (`aria-expanded`, `aria-controls`) mở ô ở hàng ngay dưới dòng (`project-expand-<id>`), dòng đó nền vàng nhạt.

## A3. Tài khoản (Could, cắt được)

```
Tìm theo tên đăng nhập [          ] [Tìm]
┌──────────────────────────────────────────────────────────────────────────────┐
│ Tên đăng nhập   Tạo lúc      Tổ chức  Trạng thái                             │
│ hoa             10/10 08:30  2        Đang dùng  [Khoá] [Cấp lại mật khẩu]   │
│ Hoa                                              [Thu hồi phiên]             │
│   Mật khẩu tạm: ab12cd34ef56 (chỉ hiện một lần)                              │
│ cu              01/10 07:00  0        Đã khoá                                │
│ (rỗng: Không tìm thấy tài khoản nào)                                         │
└──────────────────────────────────────────────────────────────────────────────┘
(nhận đủ 50: Chỉ hiện 50 tài khoản đầu, gõ thêm để thu hẹp)
```

- Mở là tải danh sách không lọc; [Tìm] (hoặc Enter) lọc theo chuỗi con của tên đăng nhập. Tên hiển thị chữ nhỏ nhạt dưới tên đăng nhập. Trạng thái có biểu tượng như A2.
- [Khoá] viền đỏ, hỏi lại bằng hộp xác nhận nút đỏ; [Cấp lại mật khẩu] hỏi lại, nút xác nhận không đỏ; [Thu hồi phiên] không hỏi. Chữ hộp xác nhận ở design §4.9. Tài khoản đã khoá không có nút.
- Kết quả ở dòng kết quả: "Đã khoá: <tên>", "Đã cấp mật khẩu tạm cho <tên>", "Đã thu hồi phiên: <tên>"; lỗi tự khoá/tự thu hồi "⚠ Không tự khoá hay tự thu hồi phiên của chính mình được".
- Mật khẩu tạm phông đều nền vàng nhạt ở hàng ngay dưới dòng (`user-expand-<tên đăng nhập>`), dòng đó nền vàng nhạt; mất khi thao tác khác, tìm, chuyển trang hay tải lại.

Không màn hình nào hiện form, phiếu, ảnh của tổ chức.
