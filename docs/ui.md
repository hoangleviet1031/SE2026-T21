# Phác thảo giao diện

- **Phiên bản:** 0.2 (2026-10-12): theo [ADR 0003](adr/0003-accounts-and-owner-role.md). Nhãn 🆕/🕘 cùng nghĩa với design.md (🆕 bản mới chưa có code, 🕘 bản đang chạy). Nhóm sửa theo thảo luận UI; chỗ nào khác với [design.md](design.md) thì design.md đúng.
- **Ràng buộc chung:** một cột, chạy tốt ở bề ngang 360px (client/CLAUDE.md); chữ tiếng Việt đúng nhãn trong design; phần tử test dùng `data-testid` kebab-case. Trang quản trị (A1–A3) là ngoại lệ: bố cục cho máy tính.
- **Số màn hình** được ticket trỏ tới (vd. "UI màn hình 3"), không đổi số đã dùng; thêm màn hình mới thì đánh số tiếp. Trang quản trị đánh số riêng `A1, A2, …`.

**App khảo sát (PWA)**

| # | Màn hình | Route (hash) | Vai trò | Cần online | Spec | Ticket |
|---|---|---|---|---|---|---|
| 1 | 🆕 Đăng nhập / Tạo tài khoản (🕘 đang chạy: nhập mã) | (khi chưa có token) | mọi | lần đầu | §4.7 | 🆕 TV1-14 (🕘 TV1-02 đã xong) |
| 2 | Danh sách phiếu (trang chủ) + bộ chọn dự án | `#/` | mọi | không | §4.7, §4.8 | TV1-06, TV3-07 |
| 3 | Xung đột | `#/conflict/<recordId>` | mọi | không | §4.5 | TV3-07, TV3-08 |
| 4 | Điền / xem phiếu | `#/fill/<formId>/<recordId>` | mọi | không | §4.1, §5.7 | TV1-05, TV1-10 |
| 5 | Form builder | `#/builder/<formId>`, `#/builder/new` | supervisor, 🆕 owner | khi lưu | §4.1 | TV1-04 |
| 6 | Thành viên (🆕 kèm cài đặt tổ chức cho owner) | `#/members` | supervisor, 🆕 owner | có | §4.7 | TV1-08 |
| 7 | ~~Dự án (quản trị)~~ | ~~`#/admin/projects`~~ | – | – | – | 🕘 Bỏ, thay bằng trang quản trị A1–A3 (TV1-16) |
| 8 | Cài đặt | `#/settings` | mọi | không | §4.2, §4.7 | TV1-07 |
| 9 | 🆕 Tổ chức (danh sách công khai, mở tổ chức mới) | `#/orgs` | mọi | có | §4.7 | TV1-15 |

**🆕 Trang quản trị `/admin/`** (tách khỏi PWA, chỉ admin, luôn cần online; design §4.9)

| # | Màn hình | Route | Spec | Ticket |
|---|---|---|---|---|
| A1 | Yêu cầu mở tổ chức (mặc định) | `/admin/#/` | §4.9 | TV1-16 |
| A2 | Tổ chức | `/admin/#/projects` | §4.9 | TV1-16 |
| A3 | Tài khoản (cắt được) | `/admin/#/users` | §4.9 | TV1-16, TV2-17 |

Các trạng thái dùng chung, mọi màn hình phải có: **đang tải**, **rỗng**, **lỗi**, và với màn hình cần online: **"Cần kết nối mạng để dùng chức năng này"**.

---

## 1. Đăng nhập / Tạo tài khoản

### 🆕 Bản mới (ADR 0003, TV1-14; chưa có code)

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
- Sau khi đăng nhập: chưa thuộc tổ chức nào → màn hình 9; có → màn hình 2.
- Biến thể: đăng nhập tài khoản khác khi máy còn phiếu chưa gửi (design §4.7) hiện thông báo chặn kèm nút "Xuất JSON" (như bản cũ).

### 🕘 Bản cũ (đang chạy, TV1-02)

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

🆕 ADR 0003: các nút ghi "(supervisor)" hiện cho cả `owner`; bộ chọn có thêm mục "Tổ chức khác…" mở màn hình 9; nhãn vai trò có thêm "Owner".

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

## 6. Thành viên 🆕 (TV1-08, theo ADR 0003)

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

Supervisor chỉ thấy thao tác với điều tra viên. Rút người hỏi xác nhận. Lỗi `last_owner`: "Tổ chức phải còn ít nhất một Owner".

## 7. ~~Dự án (quản trị)~~

🕘 Bỏ. Admin dùng trang quản trị riêng, xem A1–A3 dưới đây.

## 8. Cài đặt

Chưa phác chi tiết; nội dung theo design §4.2, §4.7 và ticket TV1-07. 🆕 Hiện thêm tên đăng nhập (để gửi cho giám sát viên). Phác xong thì thêm vào đây trước khi làm ticket.

## 9. Tổ chức 🆕 (TV1-15)

```
┌────────────────────────────────┐
│ ← Tổ chức                      │
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
│ Mở tổ chức mới                 │
│ Tên [                        ] │  org-request-name
│ Ghi chú cho quản trị [       ] │
│ [       Gửi yêu cầu       ]    │
│ Yêu cầu của bạn:               │
│  HTX Rau sạch · Đang chờ duyệt │  [Huỷ]
│  (hoặc: Bị từ chối: <lý do>)   │
└────────────────────────────────┘
```

Vào được từ bộ chọn dự án ("Tổ chức khác…") và là màn hình mặc định khi chưa thuộc tổ chức nào. Cần mạng.

---

# Trang quản trị 🆕 (`/admin/`, TV1-16)

Tách khỏi PWA (design §4.9): bố cục cho máy tính, luôn online, không lưu gì trên máy ngoài token phiên trong `sessionStorage`. Thanh trên: "Quản trị · Yêu cầu (n) · Tổ chức · Tài khoản · [tên admin] Đăng xuất".

## A1. Yêu cầu mở tổ chức

```
┌──────────────────────────────────────────────────────────────────┐
│ Tên tổ chức    Người gửi      Lúc          Ghi chú               │
│ HTX Rau sạch   Hoa (hoa)      12/10 09:12  Khảo sát 200 hộ…      │
│                                       [Duyệt] [Từ chối…]         │
│ (rỗng: Không có yêu cầu nào đang chờ)                            │
└──────────────────────────────────────────────────────────────────┘
Từ chối… mở ô nhập lý do (bắt buộc) rồi [Xác nhận từ chối].
```

## A2. Tổ chức

```
┌──────────────────────────────────────────────────────────────────┐
│ Tên            Owner     Thành viên  Trạng thái                  │
│ Y tế Tân Lập   lan       5           Đang dùng   [Khoá]          │
│ HTX Rau sạch   hoa       2           Đã khoá     [Mở]            │
│                                       [Đổi Owner…]               │
└──────────────────────────────────────────────────────────────────┘
Khoá hỏi xác nhận: "Mọi thành viên sẽ không đồng bộ được với tổ chức này."
```

## A3. Tài khoản (cắt được)

```
┌──────────────────────────────────────────────────────────────────┐
│ Tìm theo tên đăng nhập [          ]                              │
│ hoa · Hoa · tạo 10/10 · 2 tổ chức                                │
│ [Khoá] [Cấp lại mật khẩu] [Thu hồi phiên]                        │
│ Mật khẩu tạm: ab12-cd34-ef56 (chỉ hiện một lần)                  │
└──────────────────────────────────────────────────────────────────┘
```

Không màn hình nào hiện form, phiếu, ảnh của tổ chức.
