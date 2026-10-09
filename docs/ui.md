# Phác thảo giao diện

- **Phiên bản:** 0.1 (2026-10-09), bản khung. Nhóm sửa theo thảo luận UI; chỗ nào khác với [design.md](design.md) thì design.md đúng.
- **Ràng buộc chung:** một cột, chạy tốt ở bề ngang 360px (client/CLAUDE.md); chữ tiếng Việt đúng nhãn trong design; phần tử test dùng `data-testid` kebab-case.
- **Số màn hình** được ticket trỏ tới (vd. "UI màn hình 3"), không đổi số đã dùng; thêm màn hình mới thì đánh số tiếp.

| # | Màn hình | Route (hash) | Vai trò | Cần online | Spec | Ticket |
|---|---|---|---|---|---|---|
| 1 | Nhập mã đăng nhập | (khi chưa có token) | mọi | lần đầu | §4.7 | TV1-02 |
| 2 | Danh sách phiếu (trang chủ) + bộ chọn dự án | `#/` | mọi | không | §4.7, §4.8 | TV1-06, TV3-07 |
| 3 | Xung đột | `#/conflict/<recordId>` | mọi | không | §4.5 | TV3-07, TV3-08 |
| 4 | Điền / xem phiếu | `#/fill/<formId>/<recordId>` | mọi | không | §4.1, §5.7 | TV1-05, TV1-10 |
| 5 | Form builder | `#/builder/<formId>`, `#/builder/new` | supervisor | khi lưu | §4.1 | TV1-04 |
| 6 | Thành viên | `#/members` | supervisor | có | §4.7 | TV1-08 |
| 7 | Dự án (quản trị) | `#/admin/projects` | admin | có | §4.7 | TV1-09 |
| 8 | Cài đặt | `#/settings` | mọi | không | §4.2, §4.7 | TV1-07 |

Các trạng thái dùng chung, mọi màn hình phải có: **đang tải**, **rỗng**, **lỗi**, và với màn hình cần online: **"Cần kết nối mạng để dùng chức năng này"**.

---

## 1. Nhập mã đăng nhập

```
┌────────────────────────────────┐
│  Khảo sát thực địa             │
│                                │
│  Mã đăng nhập                  │
│  ┌──────────────────────────┐  │
│  │                          │  │  data-testid="login-token"
│  └──────────────────────────┘  │
│  Nhận mã từ quản trị viên.     │
│                                │
│  [        Tiếp tục        ]    │
│                                │
│  ⚠ Mã không đúng               │  (401)
│  ⚠ Cần kết nối mạng để đăng    │  (offline, chưa có token)
│    nhập lần đầu                │
└────────────────────────────────┘
```

Biến thể: nhập mã người khác khi máy còn phiếu chưa gửi (design §4.7) hiện thông báo chặn kèm nút "Xuất JSON".

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
├────────────────────────────────┤
│ (supervisor) [Thành viên]  [Cài đặt] │
└────────────────────────────────┘
```

Bộ chọn dự án mở ra:

```
┌────────────────────────────────┐
│ ✓ Y tế xã Tân Lập              │
│   Giám sát viên · 1 cần xử lý  │
│   HTX Nông nghiệp              │
│   Điều tra viên · 4 chưa đồng bộ│
│   Dự án cũ            Đã rời   │  (mờ)
└────────────────────────────────┘
```

Banner khi bị rút còn dữ liệu: "Bạn không còn thuộc dự án X. N phiếu chưa gửi được [Xuất JSON] [Xoá khỏi máy]".

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

## 6. Thành viên · 7. Dự án · 8. Cài đặt

Chưa phác chi tiết; nội dung theo design §4.7 và ticket TV1-07, TV1-08, TV1-09. Phác xong thì thêm vào đây trước khi làm ticket.
