# Phác thảo giao diện

- **Phiên bản:** 0.2.11 (2026-10-17): màn hình 3 hiện tên người sửa, màn hình 4 ẩn [Xoá phiếu] với surveyor ở phiếu người khác tạo (TV1-17). 0.2.10 (2026-10-17): màn hình 4 ghi hộp xác nhận xoá phiếu trong app (TV1-13). 0.2.9 (2026-10-17): màn hình 6 Thành viên có code (TV1-08 phần 2), ghi cách code đang làm; nút Thành viên ở màn hình 2 hiện cho cả owner. 0.2.8 (2026-10-16): màn hình 5 ghi chỗ đặt và cách chạy [Xuất form] [Nhập form] (TV1-10 phần 2). 0.2.7 (2026-10-16): màn hình 4 ghi cách hiện trường ẩn và khi máy thiếu bản form của phiếu (TV1-10 phần 1). 0.2.6 (2026-10-14): màn hình 8 thêm mục "Cài lên màn hình chính", Đăng xuất xoá cả cache SW; thêm màn hình "Trình duyệt không được hỗ trợ" (TV1-07 phần 2b). 0.2.5 (2026-10-14): dải "Có phiên bản mới" dùng chung mọi màn hình (TV1-07 phần 2a). 0.2.4 (2026-10-13): gọn giao diện sau khi thử staging (header 360px, nút quay lại màn hình 4, câu hướng dẫn màn hình 8, builder). 0.2.3 (2026-10-13): màn hình 5 ghi cách code đang làm (TV1-04). 0.2.2 (2026-10-13): màn hình 2 ghi chỗ đặt bộ chọn dự án và màn hình chưa có dự án (TV1-06). 0.2.1 (2026-10-12): phác màn hình 8 Cài đặt (TV1-07 phần 1). 0.2 (2026-10-12): theo [ADR 0003](adr/0003-accounts-and-owner-role.md). Nhãn 🆕/🕘 cùng nghĩa với design.md (🆕 bản mới chưa có code, 🕘 bản đang chạy). Nhóm sửa theo thảo luận UI; chỗ nào khác với [design.md](design.md) thì design.md đúng.
- **Ràng buộc chung:** một cột, chạy tốt ở bề ngang 360px (client/CLAUDE.md; header giữ mỗi phần tử một dòng, tên app tự rút gọn bằng "…"); chữ tiếng Việt đúng nhãn trong design; phần tử test dùng `data-testid` kebab-case. Trang quản trị (A1–A3) là ngoại lệ: bố cục cho máy tính.
- **Số màn hình** được ticket trỏ tới (vd. "UI màn hình 3"), không đổi số đã dùng; thêm màn hình mới thì đánh số tiếp. Trang quản trị đánh số riêng `A1, A2, …`.

**App khảo sát (PWA)**

| # | Màn hình | Route (hash) | Vai trò | Cần online | Spec | Ticket |
|---|---|---|---|---|---|---|
| 1 | 🆕 Đăng nhập / Tạo tài khoản (🕘 đang chạy: nhập mã) | (khi chưa có token) | mọi | lần đầu | §4.7 | 🆕 TV1-14 (🕘 TV1-02 đã xong) |
| 2 | Danh sách phiếu (trang chủ) + bộ chọn dự án | `#/` | mọi | không | §4.7, §4.8 | TV1-06, TV3-07 |
| 3 | Xung đột | `#/conflict/<recordId>` | mọi | không | §4.5 | TV3-07, TV3-08 |
| 4 | Điền / xem phiếu | `#/fill/<formId>/<recordId>` | mọi | không | §4.1, §5.7 | TV1-05, TV1-10, TV1-13 |
| 5 | Form builder | `#/builder/<formId>`, `#/builder/new` | supervisor, 🆕 owner | khi lưu | §4.1 | TV1-04 |
| 6 | Thành viên (kèm cài đặt tổ chức cho owner) | `#/members` | supervisor, owner | có | §4.7 | TV1-08 |
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

**Dải cập nhật app** (design §4.3, mọi màn hình kể cả màn hình 1): khi đã tải xong bản mới, hiện trên cùng, trên header:

```
┌────────────────────────────────┐
│ Có phiên bản mới    [Tải lại]  │  update-prompt
└────────────────────────────────┘
```

Không tự ẩn, không tự tải lại. Đang ở màn hình 4 thì bấm [Tải lại] hỏi "Phiếu đang nhập chưa lưu sẽ mất. Tải lại?" [Huỷ] [OK].

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

ADR 0003: các nút ghi "(supervisor)" hiện cho cả `owner` (có code: Sửa form, Thành viên); 🆕 bộ chọn có thêm mục "Tổ chức khác…" mở màn hình 9; nhãn vai trò có thêm "Owner".

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

Code (TV1-06): bộ chọn nằm ở một hàng riêng ngay dưới header (header đã có tên app, trạng thái mạng, Đồng bộ, Cài đặt; không đủ chỗ ở 360px); danh sách mở ra đẩy nội dung xuống. Dòng "Đã rời" không bấm được. Chưa có dự án active: "Đang tải danh sách dự án…" (chưa nhận `/me`) hoặc "Bạn chưa được thêm vào dự án nào. Gửi mã người dùng `<userId>` cho giám sát viên." (`data-testid="no-project"`; 🆕 thay bằng màn hình 9).

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

Code: trang điền phiếu có link "← Quay lại" ở đầu trang (về danh sách, phần chưa bấm Lưu không được giữ); nút "Lưu" rộng hết hàng trên điện thoại.

Code (TV1-10): trường ẩn không hiện ở phiếu mới; phiếu đã có giá trị ở trường ẩn thì trường hiện với ô bị khoá, nhãn kèm "(đã ẩn)"; giá trị sai định dạng (phiếu nháp báo lỗi ở trường đó) thì ô mở cho sửa. Máy chưa có bản form của phiếu: "Đang tải biểu mẫu…" rồi mở phiếu; offline hoặc tải không được: "Cần kết nối để mở phiếu này" kèm "← Quay lại".

Code (TV1-13): bấm [Xoá phiếu] mở hộp xác nhận trong app (không dùng hộp của trình duyệt) "Xoá phiếu này? Không hoàn tác được trên máy." với hai nút [Huỷ] (nhận focus đầu tiên) và [Xoá] màu đỏ; Esc hoặc Huỷ thì đóng hộp, không đổi gì. Phiếu đang xung đột: ẩn cả Lưu và Xoá (§4.5). Code (TV1-17): surveyor không thấy [Xoá phiếu] ở phiếu người khác tạo; phiếu chưa biết người tạo (mới tạo trên máy, hoặc tải về trước bản này) vẫn hiện nút.

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

Code (gọn UI 13/10): bấm cả dòng để chọn trường, dòng đang chọn tô nền; nút ▲ ▼ (không dùng ↑ ↓ vì Windows vẽ thành emoji có màu); chưa chọn trường thì có dòng gợi ý "Bấm vào một trường để sửa…".

Code (TV1-04): mã gợi ý từ nhãn, khoá sau khi lưu ("<mã> (khoá)"); trường chưa lưu có nút "Xoá trường"; lựa chọn nhập mỗi dòng một lựa chọn; chọn loại trường bằng ô "Loại trường" cạnh nút "+ Thêm trường"; "Xem trước" hiện form với ô nhập bị khoá; lỗi hiện ở khung `builder-errors`. Trang chủ: "Sửa form" cạnh mỗi form và "+ Biểu mẫu mới" dưới danh sách, chỉ với giám sát viên. "Xuất form"/"Nhập form" là việc của TV1-10.

Code (TV1-10 phần 2): hàng nút [Xuất form] / [Nhập form] dưới [Xem trước] [Lưu bản mới]. Sửa form đã lưu chỉ có [Xuất form] (tải file JSON); "Biểu mẫu mới" chỉ có [Nhập form] (chọn file JSON, nạp vào builder, lỗi hiện ở `builder-errors`). Form mới trùng mã form đã có: "Mã biểu mẫu đã có trong dự án".

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

Supervisor chỉ thấy thao tác với điều tra viên. Rút người hỏi xác nhận. Lỗi `last_owner`: "Tổ chức phải còn ít nhất một Owner".

Code (`client/src/pages/MembersPage.tsx`, luật hiển thị ở `client/src/members.ts`):
- Vào từ link **Thành viên** cuối trang chủ (supervisor, owner). Cần mạng: offline hoặc mất mạng giữa chừng hiện "Cần kết nối mạng để quản lý thành viên" kèm nút **Thử lại**.
- Mỗi dòng "Tên (tên đăng nhập) · Vai trò" (`member-<username>`), Owner trước. Thay cho [⋯]: ô chọn **Đổi vai trò…** (chỉ Owner, các vai trò khác vai trò hiện tại) và nút **Rút**. Supervisor chỉ có nút Rút ở dòng điều tra viên, không có thao tác ở dòng của mình.
- Ô Vai trò khi thêm: supervisor chỉ có "Điều tra viên". Lỗi hiện dưới form (`member-error`): "Không có tên đăng nhập này", "Người này đã là thành viên", "Không thêm được tài khoản quản trị", "Tổ chức phải còn ít nhất một Owner".
- Rút người khác hỏi "Rút <tên> (<tên đăng nhập>) khỏi tổ chức?". Tự hạ hỏi "Bạn sẽ mất quyền <vai trò> ngay, chỉ còn quyền <vai trò mới>. Tiếp tục?"; tự rút hỏi "Bạn sẽ rời tổ chức này ngay…". Xong thì đồng bộ để vai trò mới có hiệu lực rồi về trang chủ.
- Owner: ô **Tên tổ chức** kèm nút **Lưu tên** (bộ chọn dự án đổi tên sau vòng đồng bộ); ô **Công khai tên tổ chức** (`org-public`) lưu ngay khi bấm, hiện theo giá trị server trả về.

## 7. ~~Dự án (quản trị)~~

🕘 Bỏ. Admin dùng trang quản trị riêng, xem A1–A3 dưới đây.

## 8. Cài đặt

🕘 Bản đang chạy (TV1-07 phần 1). 🆕 Theo ADR 0003: dòng "Mã người dùng" thay bằng **tên đăng nhập** (sau TV2-14/TV2-16); Đăng xuất gọi thêm `POST /api/auth/logout` khi online.

Mở bằng nút "Cài đặt" trên thanh đầu. Đọc từ IndexedDB, dùng được khi offline.

```
┌────────────────────────────────┐
│ ← Cài đặt                      │
├────────────────────────────────┤
│ Tài khoản                      │
│ Dương                          │
│ Mã người dùng: u_ovwt7i59      │  settings-user-id
│ (Gửi mã này cho giám sát viên  │  chưa thuộc dự án nào
│  để được thêm vào dự án)       │
│ (Giám sát viên cần mã này nếu  │  đã thuộc dự án
│  muốn thêm bạn vào dự án khác) │
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
- Trình duyệt không có `storage.estimate`: ẩn dòng dung lượng.
- **Đăng xuất** chỉ bật khi mọi dự án không còn dữ liệu chưa gửi (`hasUnsentData`). Bấm → hộp xác nhận "Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng." [Huỷ] [Đăng xuất]. Đồng ý → xoá mọi CSDL dự án, cache `me`/`forms` của SW và token, về màn hình 1.
- Đang mở từ app đã cài (design §4.3): mục cài chỉ ghi "Đã cài lên màn hình chính."

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
