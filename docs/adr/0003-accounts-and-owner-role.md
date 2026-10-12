# ADR 0003: Tự tạo tài khoản, tổ chức công khai và vai trò Owner

- **Trạng thái:** Đề xuất. Hoàng đã chốt toàn bộ nội dung ngày 2026-10-12; chờ Dương và Đại duyệt qua PR (thay thế một phần ADR 0002 nên cần cả nhóm); chưa có code
- **Ngày:** 2026-10-12
- **Người phụ trách:** Hoàng (TV2)
- **Thay thế một phần:** [ADR 0002](0002-multi-tenancy.md) §2 (tạo người dùng, thêm thành viên, vai trò) và §7 (tự đăng ký nằm ngoài phạm vi). Phần còn lại của ADR 0002 (cách ly theo dự án, `requireMember`, mỗi dự án một IndexedDB, thay đổi thành viên khi offline) giữ nguyên.
- **Liên quan:** [design.md](../design.md) §2, §4.7, §6.1, §7, §7.1, §9, §10.1, §12; [ADR 0001](0001-consistency-model.md) (không đổi)

Trong tài liệu này "tổ chức" và "dự án" là một: đơn vị cách ly dữ liệu của ADR 0002. Tên trong code vẫn là `project`.

## Bối cảnh

ADR 0002 chọn mô hình "quản trị cấp tài khoản": quản trị chạy CLI tạo người dùng, gửi mã đăng nhập (token) qua kênh riêng, giám sát viên thêm người vào dự án bằng `userId`. Khi thử trên staging, nhóm thấy:

1. Mỗi người mới đều phải nhờ quản trị chạy lệnh trên server và gửi một chuỗi token dài. Không thực tế khi số điều tra viên tăng.
2. Người dùng quen đăng nhập bằng tên + mật khẩu; token dán vào ô nhập dễ sai và không nhớ được.
3. Giám sát viên phải hỏi `userId` của từng người rồi gõ tay.
4. Hệ thống phục vụ **khách hàng** là các tổ chức. Khách hàng muốn tự đứng ra mở và quản lý tổ chức của mình, nhưng nhóm vận hành vẫn phải kiểm soát ai được mở tổ chức trên app. Cần tách rõ người kiểm soát app (nhóm phát triển) với người sở hữu tổ chức và dữ liệu của tổ chức.

Yêu cầu (Hoàng chốt ngày 2026-10-12):

| # | Yêu cầu |
|---|---|
| Y1 | Người dùng tự tạo tài khoản bằng tên đăng nhập + mật khẩu và đăng nhập bằng chúng |
| Y2 | Tổ chức tự quyết có **công khai** không. Công khai chỉ có nghĩa là **tên tổ chức hiện trong danh sách** cho người đã đăng nhập; không lộ form, phiếu, ảnh, thành viên. **Không có chức năng xin vào** |
| Y3 | Người vào tổ chức (công khai hay không) đều do giám sát viên hoặc Owner thêm bằng tên đăng nhập. Đây là bước "duyệt": tổ chức quyết định ai được vào |
| Y4 | **Owner** là người **đứng ra tạo tổ chức** (gửi yêu cầu, được admin duyệt) và sở hữu nó: sửa được form, chỉ định giám sát viên, bật/tắt công khai |
| Y5 | **Admin** là người kiểm soát app (nhóm phát triển): **duyệt yêu cầu tạo tổ chức**, khoá tổ chức hoặc tài khoản vi phạm, hỗ trợ khi khách hàng mất quyền |
| Y8 | **Dữ liệu thuộc về Owner** (tổ chức). Admin **không có quyền xem** form, phiếu, ảnh của tổ chức nào |
| Y9 | Admin có **giao diện riêng**, tách khỏi app khảo sát (thay quyết định "không làm trang quản trị riêng" ở design §2) |
| Y6 | Một tài khoản thuộc được nhiều tổ chức với vai trò khác nhau ở mỗi tổ chức |
| Y7 | Phạm vi tối thiểu: chưa làm tìm kiếm tổ chức, mô tả tổ chức |

Ràng buộc không đổi: offline-first (ADR 0001), không mất dữ liệu chưa gửi (CLAUDE.md bất biến 1), `projectId` chỉ từ đường dẫn (bất biến 5), `created_by`/`updated_by` từ phiên đăng nhập (bất biến 6), không thêm thư viện nếu chưa hỏi.

## Các phương án đã xem xét

**Đăng nhập**

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Tên đăng nhập + mật khẩu, mỗi lần đăng nhập cấp một phiên (token) riêng cho máy đó** (chọn) | Quen thuộc; mỗi máy một phiên nên đăng nhập máy mới không làm máy cũ (có thể đang giữ phiếu chưa gửi) mất quyền gửi; phần client sau đăng nhập giữ nguyên (vẫn là `Authorization: Bearer`) | Thêm bảng `sessions`, băm mật khẩu, chống đoán mật khẩu |
| B. Tên + mật khẩu, nhưng vẫn một token cho mỗi người (`users.token_hash`) | Ít bảng hơn | Đăng nhập máy B làm token máy A hết hiệu lực; máy A đang offline giữ phiếu thì không gửi được nữa (vi phạm bất biến 1) |
| C. Giữ mã đăng nhập, chỉ thêm form "tự tạo tài khoản" rồi hiện mã | Ít sửa nhất | Không đáp ứng Y1 |
| D. Email + mật khẩu, quên mật khẩu qua email | Tự khôi phục được | Cần dịch vụ gửi mail; ngoài sức 8 tuần |

**Người đứng đầu tổ chức**

| Phương án | Ưu | Nhược |
|---|---|---|
| **E. Vai trò `owner` trong tổ chức, cao hơn `supervisor`; giữ cờ `is_admin` cho người kiểm soát app** (chọn) | Đáp ứng Y4, Y5; quyền Owner chỉ có hiệu lực trong tổ chức đã cấp; cách ly giữa tổ chức không đổi (Owner đi qua `requireMember` như mọi thành viên); tên `owner` không trùng với `admin`, `requireAdmin`, `/api/admin` đang có | Phải nới `CHECK` vai trò |
| F. Cho cờ `is_admin` sửa form mọi tổ chức | Không thêm vai trò | Người vận hành chạm được form của mọi khách hàng mà không khách hàng nào cấp quyền; trái Y8 |

**Ai tạo tổ chức**

| Phương án | Ưu | Nhược |
|---|---|---|
| **G3. Người dùng gửi yêu cầu mở tổ chức, admin duyệt; duyệt xong người gửi thành Owner** (chọn, Hoàng 2026-10-12) | Khách hàng tự đứng ra mở tổ chức (không cần admin nhập hộ); nhóm vận hành kiểm soát được ai dùng app; không có tổ chức rác | Khách hàng phải chờ duyệt; thêm bảng `project_requests`, API và màn hình duyệt cho admin |
| G1. Người dùng tự tạo ngay, có giới hạn số lượng | Không phải chờ | Nhóm không kiểm soát được ai mở tổ chức; có thể có tổ chức rác |
| G2. Admin tạo tổ chức rồi chỉ định Owner | Nhóm biết trước mọi khách hàng | Admin phải nhập hộ; khách hàng phải gửi thông tin qua kênh khác |

**Giao diện admin**

| Phương án | Ưu | Nhược |
|---|---|---|
| **N1. Trang quản trị riêng `/admin/`, cùng origin và cùng API, tách khỏi PWA: chỉ chạy online, không IndexedDB, không sync engine, không được service worker cache; tài khoản admin chỉ dùng trang này** (chọn) | Máy admin không bao giờ có CSDL tổ chức nào (củng cố Y8); bố cục cho máy tính, không bị ràng buộc một cột 360px của app khảo sát; lỗi ở trang admin không ảnh hưởng app của điều tra viên; dùng lại `api`, kiểu `shared`, React đã có, không thêm thư viện | Thêm một điểm vào (entry) trong bản build Vite; đăng nhập riêng |
| N2. Thêm route `#/admin/...` trong chính PWA | Ít cấu hình build | Trộn hai đối tượng người dùng trong một app offline-first; admin vẫn chạy sync engine, `/me`; khó đảm bảo không cache/không lưu gì trên máy admin |
| N3. Chỉ có API và CLI | Không tốn công UI | Trái Y9; admin phải dùng `curl` để duyệt yêu cầu |

**Vào tổ chức**

| Phương án | Ưu | Nhược |
|---|---|---|
| **H. Danh sách tổ chức công khai (chỉ tên) + giám sát viên/Owner thêm bằng tên đăng nhập** (chọn) | Không có yêu cầu nào gửi tới tổ chức nên không thể làm phiền; tổ chức luôn tự quyết ai vào; ít code nhất; không có route theo tổ chức nào nằm ngoài `requireMember` | Người dùng phải liên hệ tổ chức qua kênh khác (điện thoại, Zalo…) để gửi tên đăng nhập |
| I. Nút "Xin tham gia" + giám sát viên duyệt | Không cần kênh liên hệ ngoài | Phải có luật chống làm phiền (giới hạn số yêu cầu, thời gian chờ, chặn), bảng `join_requests`, một route theo tổ chức không qua `requireMember`; nhiều code và test hơn. Đã cân nhắc trong bản nháp trước và bỏ |
| J. Tổ chức công khai thì bấm là vào ngay | Nhanh | Tổ chức không kiểm soát ai vào; người lạ tạo phiếu trong tổ chức |
| K. Mã mời / đường link mời | Không cần danh sách | Phải gửi link qua kênh khác; để sau MVP |

**Một tài khoản ở nhiều tổ chức**

| Phương án | Ưu | Nhược |
|---|---|---|
| **L. Không giới hạn số tổ chức với mọi vai trò; vai trò gắn trên từng membership** (chọn) | Giống ODK Central, KoboToolbox và hướng dẫn chung cho phần mềm nhiều tổ chức (xem Tham khảo); người làm cho nhiều tổ chức dùng một tài khoản, đổi tổ chức khi offline; code client đã hỗ trợ (TV2-05…07) | Một người có thể đọc dữ liệu của nhiều tổ chức, nhưng chỉ của tổ chức đã tự cấp quyền cho họ |
| M. Owner chỉ thuộc một tổ chức | Mỗi tài khoản Owner đại diện đúng một tổ chức | Không có tiền lệ; không thêm cách ly vì supervisor ở nhiều tổ chức có cùng mức truy cập dữ liệu; thêm kiểm tra và test; máy chỉ giữ một tài khoản (design §4.7) nên người làm Owner hai tổ chức không dùng được. Hoàng bỏ ngày 2026-10-12 |

## Quyết định

### 1. Tài khoản và đăng nhập

- **Tự đăng ký** bằng `username`, `name` (tên hiển thị), `password`. Không có email.
  - `username`: chữ thường, số, `.`, `_`, 3–32 ký tự (`^[a-z0-9._]{3,32}$`), duy nhất, không đổi được. Server tự chuyển về chữ thường.
  - `password`: 8–128 ký tự. Băm bằng `scrypt` của `node:crypto` (muối 16 byte ngẫu nhiên, lưu dạng `scrypt$<N>$<salt>$<hash>`), so bằng `timingSafeEqual`. Không thêm thư viện.
  - Tài khoản mới **không thuộc tổ chức nào** và không phải admin.
- **Đăng nhập** bằng `username` + `password`, cần mạng. Thành công thì server tạo một **phiên** và trả token của phiên đó (32 byte ngẫu nhiên, base64url); server chỉ lưu SHA-256 trong bảng `sessions`. Client lưu token trong `field-survey-account` và gửi qua `Authorization: Bearer` như hiện nay, nên `api.ts`, sync engine và mọi luồng offline không đổi.
- **Mỗi máy một phiên.** Đăng nhập máy mới không thu hồi phiên máy cũ. Phiên **không tự hết hạn**: máy offline nhiều tuần vẫn phải gửi được phiếu (bất biến 1). Phiên chỉ mất khi:
  - người dùng bấm Đăng xuất trên máy đó (chỉ bật khi không còn dữ liệu chưa gửi, design §4.7);
  - admin chạy `user:revoke-sessions` (mất máy) hoặc `user:disable`.
- **Quên mật khẩu:** admin chạy `user:reset-password --user <username>`, in mật khẩu tạm một lần. Không thu hồi phiên đang có (máy đang giữ phiếu chưa gửi vẫn gửi được); muốn thu hồi thì chạy thêm `user:revoke-sessions`.
- **Chống đoán mật khẩu:** sai quá 10 lần trong 15 phút cho cùng `username` hoặc cùng IP → `429 too_many_requests` tới hết cửa sổ. Đăng ký tối đa 5 tài khoản mỗi giờ mỗi IP. Đếm trong bộ nhớ tiến trình (khởi động lại thì xoá), đủ cho quy mô đồ án.
- Đăng nhập sai tên hay sai mật khẩu đều trả cùng `401 invalid_credentials` (không lộ tên nào đã có).
- Logic "nhập tài khoản khác trên máy còn phiếu chưa gửi" ở design §4.7 giữ nguyên, so `user.id` sau khi đăng nhập.

### 2. Vai trò

| Vai trò | Là ai | Lưu ở đâu | Phạm vi | Quyền |
|---|---|---|---|---|
| **Admin** | Người kiểm soát app (nhóm phát triển) | cờ `users.is_admin` (giữ nguyên tên trong code) | Toàn hệ thống | **Duyệt/từ chối yêu cầu mở tổ chức**; xem danh sách mọi tổ chức (tên, trạng thái, số thành viên, tên đăng nhập các Owner); **khoá (lưu trữ)/mở** tổ chức vi phạm; chỉ định Owner khi khách hàng mất tài khoản Owner; quản lý tài khoản bằng CLI (`user:*`: khoá, cấp lại mật khẩu, thu hồi phiên). **Không có quyền xem** form, phiếu, ảnh của tổ chức nào (Y8, ca T4) |
| **`owner`** | Người đứng ra tạo tổ chức và sở hữu nó cùng dữ liệu của nó (khách hàng) | `memberships.role` | Một tổ chức | Mọi quyền của supervisor, thêm: đổi tên tổ chức, thêm/đổi/rút supervisor và Owner khác, bật/tắt công khai |
| **`supervisor`** | Người giám sát của khách hàng | `memberships.role` | Một tổ chức | Đọc/sửa mọi phiếu, **tạo/sửa form**, xuất dữ liệu, thêm/rút điều tra viên |
| **`surveyor`** | Điều tra viên | `memberships.role` | Một tổ chức | Tạo phiếu, đọc/sửa phiếu mình tạo |

Thứ hạng trong `requireMember`: `surveyor < supervisor < owner`. Route sửa form dùng `requireMember('supervisor')`, nên Owner đi qua tự nhiên. Phạm vi pull của `owner` là `all`.

| Quyền | surveyor | supervisor | owner |
|---|:-:|:-:|:-:|
| Điền phiếu, sửa phiếu mình tạo | ✓ | ✓ | ✓ |
| Đọc/sửa mọi phiếu, xuất CSV/JSON | | ✓ | ✓ |
| Tạo/sửa form | | ✓ | ✓ |
| Thêm, rút điều tra viên | | ✓ | ✓ |
| Thêm, đổi vai trò, rút supervisor và Owner | | | ✓ |
| Đổi tên tổ chức, bật/tắt công khai | | | ✓ |

Mỗi tổ chức luôn có ít nhất một Owner: không rút/hạ được Owner cuối cùng (`409 last_owner`). Luật `last_supervisor` cũ được thay bằng luật này (Owner đã có mọi quyền của supervisor).

**Một tài khoản ở nhiều tổ chức (phương án L):** một tài khoản thuộc được nhiều tổ chức, mỗi tổ chức một vai trò bất kỳ, ví dụ `owner` ở X và `surveyor` ở Y (vẫn tối đa 10 tổ chức mỗi người theo design §11.2). Quyền ở tổ chức này không bao giờ có hiệu lực ở tổ chức khác: `requireMember` chỉ xét membership của đúng tổ chức trong đường dẫn. Dữ liệu không trộn vì mỗi tổ chức một CSDL trên máy (ADR 0002 §4).

**Ghi vết:** `memberships` thêm `added_by` (ai thêm hoặc đổi vai trò lần cuối) cùng `added_at` đã có. Đủ để trả lời "ai đã cho người này vào tổ chức với vai trò gì".

### 3. Mở tổ chức và thêm người

1. **Mở tổ chức (phương án G3):**
   1. Người dùng đã đăng nhập vào màn hình "Tổ chức", nhập tên tổ chức (1–100 ký tự) và một dòng ghi chú cho admin (không bắt buộc, tối đa 500 ký tự, ví dụ đơn vị, mục đích khảo sát), bấm "Gửi yêu cầu". Cần mạng.
   2. Admin xem danh sách yêu cầu đang chờ (tên tổ chức, ghi chú, tên đăng nhập và tên hiển thị người gửi, thời điểm), chọn **Duyệt** hoặc **Từ chối** kèm lý do.
   3. **Duyệt:** server tạo tổ chức và thêm **người gửi** làm `owner` trong cùng một transaction, nên tổ chức không bao giờ thiếu Owner. Admin **không** thành thành viên (Y8). Người gửi thấy tổ chức ở vòng đồng bộ kế tiếp nhờ `/me` (luồng T6 sẵn có).
   4. **Từ chối:** người gửi thấy "Bị từ chối: <lý do>" ở màn hình Tổ chức và gửi được yêu cầu mới.
   - `id` tổ chức do **server sinh** lúc duyệt (`p-` + 8 ký tự `a-z0-9`, khớp mẫu `id` dự án ở design §7), không cho người dùng tự đặt: tránh trùng, và `id` nằm trong URL, tên IndexedDB.
   - Tổ chức mới mặc định **không công khai**.
   - **Giới hạn:** mỗi người tối đa **1** yêu cầu đang chờ và là Owner của tối đa **3** tổ chức chưa lưu trữ; vượt thì `409 project_limit_reached`. Người gửi huỷ được yêu cầu đang chờ. Vẫn giữ tối đa 10 tổ chức mỗi người ở mọi vai trò (design §11.2).
   - Không gửi thông báo đẩy hay email: admin thấy số yêu cầu đang chờ ở trang quản trị (mục 8, màn hình A1), người gửi thấy trạng thái ở màn hình Tổ chức.
   - Tổ chức vi phạm: admin khoá bằng `PATCH /api/admin/projects/:projectId { archived: true }`; mọi thành viên nhận `403 not_member` và client xử lý như bị rút (ADR 0002 §6, không mất phiếu chưa gửi).
2. **Owner** thêm supervisor (và Owner khác nếu muốn) bằng tên đăng nhập ở màn hình Thành viên.
3. **Owner hoặc supervisor** thêm điều tra viên bằng tên đăng nhập. Người được thêm thấy tổ chức ở vòng đồng bộ kế tiếp nhờ `GET /api/me`, đi đúng luồng "được thêm vào dự án" đã có (ADR 0002 §6, ca T6). Không thêm cơ chế mới phía client.
4. **Tổ chức công khai:** người đã đăng nhập thấy **tên** các tổ chức công khai mình chưa thuộc, ở màn hình "Tổ chức" (cần mạng), kèm hướng dẫn "Gửi tên đăng nhập `<username>` cho giám sát viên của tổ chức để được thêm". Không có nút xin vào, không có thông báo gửi tới tổ chức (Y2).
   - Mặc định tổ chức mới **không công khai**. Chỉ Owner bật/tắt.
   - Danh sách chỉ trả `id`, `name`; không trả số thành viên, form hay bất kỳ dữ liệu nào khác.
   - Tổ chức đã lưu trữ không hiện.

### 4. Cách ly dữ liệu (nhắc lại, không đổi)

- Mọi route theo tổ chức vẫn đi qua `requireMember`; ADR này không thêm ngoại lệ nào. Test T5 giữ nguyên.
- `GET /api/directory` và `/api/project-requests` không nằm dưới `/api/projects/:projectId`; chúng chỉ đọc/ghi `projects.id`, `projects.name`, `projects.public` và bảng `project_requests`, không bao giờ chạm form, phiếu, ảnh.
- **Admin không xem được dữ liệu tổ chức (Y8):** admin vẫn nhận `403 not_member` khi gọi `P/...` (T4); duyệt yêu cầu không biến admin thành thành viên; API admin chỉ trả thông tin quản trị (tên, trạng thái, số thành viên, tên đăng nhập Owner). Muốn xem dữ liệu thì Owner phải tự thêm người đó vào tổ chức, và việc này để lại dấu vết `added_by`.

### 5. Mô hình dữ liệu (migration 3)

| Bảng | Thay đổi |
|---|---|
| `users` | Thêm `username TEXT UNIQUE` (tài khoản cũ: đặt bằng `id`), `password_hash TEXT` (tài khoản cũ để trống, đăng nhập được sau khi admin chạy `user:reset-password`). `token_hash` giữ lại, không dùng nữa |
| `sessions` *(mới)* | `token_hash` PK, `user_id` FK `users`, `created_at`, `last_seen_at`; index `(user_id)`. Migration chép `users.token_hash` cũ thành một phiên, để máy đang đăng nhập bằng token cũ (staging) không bị đẩy ra |
| `projects` | Thêm `public INTEGER NOT NULL DEFAULT 0` |
| `project_requests` *(mới)* | `id` PK (UUID), `user_id` FK `users`, `name`, `note`, `status` ∈ `pending`, `approved`, `rejected`, `cancelled` (`CHECK`), `created_at`, `decided_at`, `decided_by`, `reason` (lý do từ chối), `project_id` (có khi đã duyệt); index `(status, created_at)`, `(user_id, status)` |
| `memberships` | **Tạo lại bảng và chép nguyên dữ liệu** (SQLite không sửa được `CHECK`): `CHECK (role IN ('surveyor', 'supervisor', 'owner'))`, thêm `added_by`. Supervisor hiện có giữ nguyên vai trò; mỗi tổ chức đang có dữ liệu phải được admin chỉ định ít nhất một Owner sau khi nâng cấp. Đây là ngoại lệ thứ hai so với luật "chỉ thêm cột/bảng" (design §12); nhóm chấp nhận vì dữ liệu được chép nguyên vẹn và vai trò nằm một chỗ dễ kiểm tra hơn so với bảng `project_owners` riêng |

### 6. API

**Không theo tổ chức**

| Method, đường dẫn | Thân | Kết quả | Ai |
|---|---|---|---|
| `POST /api/auth/register` | `{ username, name, password }` | `201 { token, user }` (đăng nhập luôn); `409 username_taken`; `400 invalid_body`; `429 too_many_requests` | không cần đăng nhập |
| `POST /api/auth/login` | `{ username, password }` | `200 { token, user }`; `401 invalid_credentials`; `429 too_many_requests` | không cần đăng nhập |
| `POST /api/auth/logout` | – | `204`, xoá phiên hiện tại | đã đăng nhập |
| `GET /api/me` | – | Như cũ; `user` thêm `username`; `role` có thêm `owner` | đã đăng nhập |
| `GET /api/directory` | – | `[{ id, name }]`: tổ chức công khai, chưa lưu trữ, mình chưa là thành viên | đã đăng nhập |
| `POST /api/project-requests` | `{ name, note? }` | `201 { id, name, status: 'pending' }`; `400 invalid_body`; `409 project_limit_reached` | đã đăng nhập |
| `GET /api/project-requests` | – | Yêu cầu của chính mình: `[{ id, name, status, reason?, projectId?, createdAt }]` | đã đăng nhập |
| `DELETE /api/project-requests/:id` | – | `204`, huỷ yêu cầu đang chờ của mình; yêu cầu của người khác hoặc đã xử lý → `404` | đã đăng nhập |
| `GET /api/admin/project-requests?status=pending` | – | `[{ id, name, note, user: { id, username, name }, createdAt }]` | admin |
| `POST /api/admin/project-requests/:id` | `{ decision: 'approve' \| 'reject', reason? }` | Duyệt: `200 { projectId }`, tổ chức được tạo, người gửi là `owner`. Từ chối: `200`, cần `reason`. Yêu cầu không còn `pending` → `409 request_decided` | admin |
| `GET /api/admin/projects` | – | Như ADR 0002, thêm số thành viên và tên đăng nhập các Owner (không có dữ liệu khảo sát) | admin |
| `PATCH /api/admin/projects/:projectId` | `{ archived }` | Khoá/mở tổ chức. Không đổi `name`, `public` (quyền của Owner) | admin |
| `PUT /api/admin/projects/:projectId/owners/:username` | – | Thay cho `PUT …/members/:userId`: thêm hoặc nâng người đó thành `owner`, dùng khi khách hàng mất tài khoản Owner; `404` nếu không có dự án hoặc tên đăng nhập | admin |
| `POST /api/admin/projects` | | Bỏ: tổ chức chỉ được tạo khi duyệt yêu cầu | – |

**Theo tổ chức** (`P` = `/api/projects/:projectId`, mọi route qua `requireMember`)

| Method, đường dẫn | Thân | Kết quả | Ai |
|---|---|---|---|
| `GET P/members` | – | `[{ userId, username, name, role, addedAt }]` | supervisor |
| `POST P/members` | `{ username, role }` | `201`; `404 not_found` nếu không có tên đó; `409 already_member`; `403 forbidden` nếu supervisor thêm vai trò khác `surveyor` | supervisor (`role: surveyor`), owner (mọi vai trò) |
| `PUT P/members/:userId` | `{ role }` | `200`; `409 last_owner`; `403 forbidden` như trên | như trên |
| `DELETE P/members/:userId` | – | `204`; `409 last_owner`; supervisor chỉ rút được surveyor | như trên |
| `PATCH P/settings` | `{ name?, public? }`, ít nhất một trường | `200 { name, public }` | owner |
| `POST P/forms` | như design §4.1 | như design §4.1 | supervisor (Owner đi qua theo thứ hạng) |

**Mã lỗi mới** (thêm vào design §7.1 khi chốt): `401 invalid_credentials`, `409 username_taken`, `409 already_member`, `409 last_owner` (thay `last_supervisor`), `409 project_limit_reached`, `409 request_decided`, `409 admin_account`, `429 too_many_requests`. `409 project_exists` không còn dùng.

### 7. Giao diện

```
1. Đăng nhập (đổi)                      9. Tổ chức (mới, cần mạng)
┌────────────────────────────────┐      ┌────────────────────────────────┐
│ Khảo sát thực địa              │      │ ← Tổ chức                      │
│ [Đăng nhập] [Tạo tài khoản]    │      │ Tên đăng nhập của bạn: minh    │
│ Tên đăng nhập [            ]   │      │ Gửi tên này cho giám sát viên  │
│ Mật khẩu      [            ]   │      │ của tổ chức để được thêm vào.  │
│ (Tạo tài khoản: thêm Tên hiển  │      │                                │
│  thị, Nhập lại mật khẩu)       │      │ Tổ chức công khai:             │
│ [          Tiếp tục        ]   │      │  Y tế xã Tân Lập               │
│ ⚠ Sai tên đăng nhập hoặc mật   │      │  HTX Nông nghiệp               │
│   khẩu / Cần kết nối mạng      │      ├────────────────────────────────┤
└────────────────────────────────┘      │ Mở tổ chức mới                 │
                                        │ Tên [                        ] │
                                        │ Ghi chú cho quản trị [       ] │
                                        │ [Gửi yêu cầu]                  │
                                        │ Trạng thái: Đang chờ duyệt [Huỷ]│
                                        │  (hoặc: Bị từ chối: <lý do>)   │
                                        └────────────────────────────────┘


6. Thành viên (đổi, supervisor/owner, cần mạng)
┌────────────────────────────────┐
│ Thêm theo tên đăng nhập [    ] │
│ Vai trò [Điều tra viên ▾] [Thêm]│  (owner chọn được Giám sát viên, Owner)
├────────────────────────────────┤
│ Minh (minh) · Điều tra viên [⋯]│
│ Lan (lan) · Owner              │
├────────────────────────────────┤
│ (owner) [x] Công khai tên tổ   │
│             chức               │
└────────────────────────────────┘
```

Người chưa thuộc tổ chức nào vào thẳng màn hình 9 sau khi đăng nhập (thay câu "Gửi mã người dùng `<userId>`" ở design §4.7). Khi chốt, các phác thảo này chuyển vào [ui.md](../ui.md).

### 8. Trang quản trị riêng (phương án N1)

- **Địa chỉ:** `https://<máy chủ>/admin/`. Là một trang thứ hai trong cùng gói `client/` (Vite build nhiều trang: `index.html` cho app khảo sát, `admin/index.html` cho quản trị), dùng chung `shared/` và cách gọi API, không thêm thư viện.
- **Tách khỏi PWA:**
  - Không đăng ký service worker, không có manifest; SW của app khảo sát bỏ qua `/admin/` (`navigateFallbackDenylist`), để trang quản trị luôn lấy bản mới từ server và không chạy offline.
  - Không dùng IndexedDB, không chạy sync engine. Token phiên lưu trong `sessionStorage` (đóng tab là phải đăng nhập lại), không lưu dữ liệu gì khác.
  - Bố cục cho màn hình máy tính (bảng nhiều cột), vẫn dùng được trên điện thoại.
- **Đăng nhập:** cùng `POST /api/auth/login`; tài khoản không có `is_admin` thì trang báo "Tài khoản này không phải quản trị" và không lưu token.
- **Tài khoản admin chỉ dùng cho trang quản trị:**
  - Đăng nhập app khảo sát bằng tài khoản admin: app báo "Tài khoản quản trị dùng trang /admin" và không tạo CSDL nào trên máy.
  - Không thêm được tài khoản admin vào tổ chức (`POST P/members` → `409 admin_account`). Người trong nhóm phát triển muốn thử app khảo sát thì dùng một tài khoản thường riêng.
  - Nhờ vậy Y8 được đảm bảo bằng cấu trúc, không chỉ bằng kỷ luật: tài khoản có quyền quản trị không bao giờ là thành viên tổ chức nào.
- **Màn hình:**

```
A1. Yêu cầu mở tổ chức (mặc định)              A2. Tổ chức
┌──────────────────────────────────────────┐  ┌──────────────────────────────────────────┐
│ Quản trị · Yêu cầu (2) · Tổ chức ·       │  │ Tên            Owner   TV  Trạng thái    │
│ Tài khoản               [admin] Đăng xuất│  │ Y tế Tân Lập   lan     5   Đang dùng [Khoá]│
├──────────────────────────────────────────┤  │ HTX Rau sạch   hoa     2   Đã khoá  [Mở] │
│ Tên tổ chức   Người gửi    Lúc    Ghi chú│  │ [Đổi Owner…] (khi khách hàng mất tài     │
│ HTX Rau sạch  Hoa (hoa)    09:12  "200 hộ│  │  khoản Owner: nhập tên đăng nhập mới)    │
│               [Duyệt] [Từ chối: lý do…]  │  └──────────────────────────────────────────┘
└──────────────────────────────────────────┘
A3. Tài khoản (cắt được: CLI làm thay)
┌──────────────────────────────────────────┐
│ Tìm theo tên đăng nhập [        ]        │
│ hoa · Hoa · tạo 10/10 · 2 tổ chức        │
│ [Khoá] [Cấp lại mật khẩu] [Thu hồi phiên]│
└──────────────────────────────────────────┘
```

  - A1, A2 bắt buộc. A3 **cắt được**: nếu trễ, admin dùng CLI `user:*` như hiện nay.
  - Mọi màn hình chỉ hiện thông tin quản trị (tên, tên đăng nhập, số thành viên, trạng thái); không có đường nào dẫn tới form, phiếu, ảnh.
- **API thêm cho A3** (chỉ khi làm A3): `GET /api/admin/users?q=<tên đăng nhập>` → `[{ id, username, name, disabled, createdAt, projectCount }]`; `POST /api/admin/users/:id/disable`, `…/reset-password` (trả mật khẩu tạm một lần), `…/revoke-sessions`. Cùng hành vi với lệnh CLI tương ứng.

## Hệ quả

**Tích cực**
- Người mới tự tạo tài khoản, không cần admin chạy lệnh cho từng người; khách hàng tự đứng ra mở tổ chức, admin chỉ bấm duyệt.
- Nhóm vận hành kiểm soát được mọi tổ chức trên app mà không xem được dữ liệu của khách hàng.
- Tổ chức luôn tự quyết ai vào, và không nhận được yêu cầu nào từ người lạ.
- Sau khi đăng nhập, client vẫn chỉ cầm một token: sync engine, outbox, cursor, `membership.ts` dùng lại nguyên vẹn. ADR 0001 không đổi.
- Không thêm route theo tổ chức nào nằm ngoài `requireMember`.

**Tiêu cực, chấp nhận được**
- Thêm mặt tấn công: đăng ký hàng loạt, đoán mật khẩu. Giảm bằng giới hạn tần suất; không chống được kẻ tấn công có nhiều IP (ngoài phạm vi đồ án).
- Danh sách công khai không có cách liên hệ trong app; người dùng phải tìm giám sát viên qua kênh khác.
- Quên mật khẩu vẫn cần admin.
- Khách hàng phải chờ admin duyệt mới bắt đầu được; không có thông báo, người gửi tự mở app để xem trạng thái.
- Admin không xem được dữ liệu nên không thể tự kiểm tra nội dung khi có khiếu nại; chỉ khoá được tổ chức.
- Migration 3 phải tạo lại bảng `memberships`, và tổ chức đang có (staging) cần admin chỉ định Owner sau khi nâng cấp.
- Phiên không hết hạn: mất máy mà không báo admin thì phiên còn dùng được.

**Việc phát sinh** (tách ticket sau khi chốt; ước lượng khoảng 9–10 ngày công, gồm trang quản trị; bỏ A3 thì bớt khoảng 1,5 ngày)

| Phần | Việc | Ảnh hưởng ticket có sẵn |
|---|---|---|
| Server – auth (TV2) | Migration 3, `scrypt`, `sessions`, `register`/`login`/`logout`, giới hạn tần suất, `requireAuth` đọc `sessions`, vai trò `owner` trong `requireMember`, `GET /api/directory`, `PUT /admin/projects/:id/owners/:username` | `auth.ts`, `repo/memberships.ts`, `routes/admin.ts`, test A1, T4 |
| Server – mở tổ chức (TV2) | Bảng `project_requests`, `/api/project-requests`, `/api/admin/project-requests` (duyệt tạo tổ chức + Owner trong một transaction) | `routes/admin.ts` (bỏ `POST /admin/projects`) |
| Client – trang quản trị (TV1) | Trang `/admin/` (mục 8): Vite nhiều trang, SW bỏ qua `/admin/`, đăng nhập riêng, A1 duyệt yêu cầu, A2 tổ chức; A3 tài khoản nếu kịp. App khảo sát chặn tài khoản admin | TV1-09 thay bằng ticket này (không còn "cắt được" phần A1, A2); `vite.config.ts` |
| Server – tài khoản admin (TV2) | `409 admin_account` khi thêm admin vào tổ chức; API `/api/admin/users…` nếu làm A3 | |
| Server – thành viên (TV1) | `P/members` theo `username`, phân quyền supervisor/owner, `last_owner`, `added_by`, `P/settings` | TV1-08 đổi phạm vi |
| Client (TV1) | Trang đăng nhập 2 tab, màn hình Tổ chức (danh sách công khai, gửi/huỷ yêu cầu mở tổ chức), màn hình Thành viên theo vai trò, nút công khai; nhãn vai trò "Owner" ở bộ chọn dự án | TV1-02 làm lại, TV1-06, TV1-08 |
| CLI, fixture, E2E (TV3) | `user:add` có `--username` và in mật khẩu tạm, `user:reset-password`, `user:revoke-sessions`; tài khoản demo có mật khẩu và một Owner mỗi dự án; helper `login()` đăng nhập bằng tên + mật khẩu | TV3-02 |
| Docs | Design §1, §2 (bỏ câu "không làm trang quản trị riêng"), §3, §4.3, §4.7, §6.1, §6.2, §7, §7.1, §9, §10.1, §12; ui.md màn hình 1, 6, 9 và A1–A3; ADR 0002 ghi "Thay thế một phần bởi ADR 0003" | |

Đề xuất cắt để bù (nhóm chọn): xuất/nhập form JSON, "Gộp cả hai" cho multiselect, đo hiệu năng đầy đủ (giữ phép đo pull 2.000 phiếu).

## Kiểm chứng

Mã ca mới: `U` (tài khoản), `Q` (yêu cầu mở tổ chức), `D` (danh sách công khai), `M` (thành viên), `A` (phân quyền, nối tiếp design §10.1).

| # | Mức | Ca | Kỳ vọng |
|---|---|---|---|
| U1 | Integration | Đăng ký rồi gọi `/me` bằng token nhận được | `201`, `/me` trả đúng người, `projects: []` |
| U2 | Integration | Đăng ký trùng `username` (khác hoa thường) | `409 username_taken` |
| U3 | Integration | Sai mật khẩu; sai tên đăng nhập | Cùng `401 invalid_credentials` |
| U4 | Integration | Sai mật khẩu 11 lần trong 15 phút | Lần thứ 11 nhận `429`, kể cả khi mật khẩu đúng |
| U5 | Integration | Đăng nhập hai lần (hai máy), cả hai token gửi phiếu | Cả hai được; đăng xuất một máy không ảnh hưởng máy kia |
| U6 | Integration | DB chỉ chứa hash | Không có mật khẩu hay token gốc trong `users`, `sessions` |
| U7 | E2E | Tạo tài khoản trên app, tải lại trang | Vẫn đăng nhập; offline lần đầu thì báo cần mạng |
| Q1 | Integration | Người dùng gửi yêu cầu mở tổ chức | `201 pending`; chưa có tổ chức nào được tạo; `/me` vẫn `projects: []` |
| Q2 | Integration | Admin duyệt | Tổ chức được tạo với `id` dạng `p-xxxxxxxx`, người gửi là `owner`, `/me` của người gửi có tổ chức; admin **không** có membership |
| Q3 | Integration | Admin từ chối kèm lý do; từ chối không có lý do | Người gửi đọc được lý do, không có tổ chức; `400 invalid_body` |
| Q4 | Integration | Người thường gọi `/api/admin/project-requests…` | `403 forbidden` |
| Q5 | Integration | Gửi yêu cầu thứ hai khi đang chờ; gửi khi đã là Owner của 3 tổ chức | `409 project_limit_reached` |
| Q6 | Integration | Duyệt lại yêu cầu đã xử lý; huỷ yêu cầu của người khác | `409 request_decided`; `404` |
| Q7 | Integration | Sau khi duyệt, admin gọi `P/forms`, `P/records` của tổ chức vừa tạo | `403 not_member` (Y8) |
| Q9 | Integration | Owner thêm tài khoản admin vào tổ chức | `409 admin_account` |
| Q10 | E2E | Trang `/admin/`: đăng nhập bằng tài khoản thường bị từ chối; admin duyệt yêu cầu ở A1, khoá tổ chức ở A2; sau đó `indexedDB.databases()` trên trang admin rỗng | Như mô tả |
| Q11 | E2E | Đăng nhập app khảo sát bằng tài khoản admin | Báo "Tài khoản quản trị dùng trang /admin", không tạo CSDL nào |
| Q8 | E2E | Tạo tài khoản → gửi yêu cầu → admin duyệt qua API → sau một vòng đồng bộ người gửi thấy tổ chức với vai trò Owner, tạo được form | Như T6 |
| D1 | Integration | `GET /directory` | Chỉ `id`, `name` của tổ chức công khai, chưa lưu trữ, mình chưa là thành viên |
| D2 | Integration | Supervisor hoặc surveyor `PATCH P/settings`; Owner | `403 forbidden`; `200` và tổ chức hiện/ẩn trong D1 |
| M1 | Integration | Supervisor thêm surveyor bằng tên đăng nhập; thêm supervisor | `201`; `403 forbidden` |
| M2 | Integration | Owner thêm supervisor, Owner khác; tên không tồn tại; người đã là thành viên | `201`; `404 not_found`; `409 already_member` |
| M3 | E2E | Tạo tài khoản → Owner thêm bằng tên đăng nhập → sau một vòng đồng bộ người đó thấy tổ chức, tải được form, gửi được phiếu | Như T6 |
| A5 | Integration | Supervisor và Owner `POST P/forms`; surveyor | `201`; `403 forbidden` |
| A6 | Integration | Một người là `owner` ở tổ chức A và `surveyor` ở tổ chức B: sửa form, `PATCH P/settings` ở A và ở B | `2xx` ở A; `403 forbidden` ở B (quyền ở A không mang sang B) |
| A7 | Integration | Rút/hạ Owner cuối cùng | `409 last_owner` |
| A8 | Integration | Admin chỉ định Owner bằng tên đăng nhập; người thường gọi | `200`, người đó vào được tổ chức với vai trò `owner`; `403 forbidden` |
| T4 | Integration | Admin không là thành viên gọi `P/forms`, `P/records` | Vẫn `403 not_member` (không đổi) |
| T5 | Integration | Duyệt mọi route theo tổ chức bằng token tổ chức khác | Không route nào trả `2xx` (không đổi, không có ngoại lệ) |

## Quyết định cho các câu hỏi của bản nháp trước

Hoàng trả lời ngày 2026-10-12:

| Câu hỏi | Quyết định |
|---|---|
| Migration `memberships`: tạo lại bảng hay bảng riêng? | Tạo lại bảng, chép nguyên dữ liệu (mục 5) |
| Ai bật/tắt công khai? | Chỉ Owner |
| Tên vai trò đứng đầu tổ chức? | `owner` (không dùng `admin` để khỏi nhầm với người vận hành) |
| Ai tạo tổ chức và Owner? | Người dùng gửi yêu cầu mở tổ chức, admin (người kiểm soát app) duyệt; người gửi thành Owner (phương án G3) |
| Dữ liệu thuộc về ai, admin có xem được không? | Thuộc về Owner (tổ chức); admin không có quyền xem (Y8, giữ T4) |
| Admin dùng giao diện nào? | Trang quản trị riêng `/admin/` (phương án N1); tài khoản admin chỉ dùng trang này, không là thành viên tổ chức nào (`409 admin_account`) |
| Xin tham gia và các con số giới hạn? | Bỏ xin tham gia; giữ công khai ở mức hiện tên trong danh sách. Giới hạn đăng nhập/đăng ký giữ như mục 1 |

## Tham khảo

Cách các hệ thống khác xử lý tài khoản ở nhiều tổ chức (đọc ngày 2026-10-12), dùng cho phương án L:
- ODK Central: tài khoản dùng chung toàn server, vai trò gán theo từng dự án, một người có vai trò ở nhiều dự án; quản trị toàn hệ thống tách riêng – [Managing Users in Central](https://docs.getodk.org/central-users/), [Managing Projects in Central](https://docs.getodk.org/central-projects/)
- KoboToolbox: chia sẻ dự án bằng tên đăng nhập, quyền theo từng dự án, quyền theo dòng (chỉ phiếu của mình) – [Managing permissions](https://support.kobotoolbox.org/_sources/managing_permissions.md.txt), [Row-Level Permissions](https://support.kobotoolbox.org/row_level_permissions.html)
- Hướng dẫn chung: vai trò lưu trên membership từng tổ chức, không dùng vai trò toàn cục – [Clerk](https://clerk.com/blog/multi-tenant-authentication-what-you-need-to-know), [Logto](https://blog.logto.io/guide-to-begin-with-logto-organizations), [OpenFGA](https://openfga.dev/docs/use-cases/multi-tenant-saas.md)

## Khi nào xem lại

- Có email/SMS: thêm khôi phục mật khẩu tự phục vụ.
- Người dùng khó liên hệ tổ chức: thêm nút "Xin tham gia" kèm luật chống làm phiền (phương án I) hoặc mã mời (phương án K).
- Yêu cầu mở tổ chức nhiều tới mức admin không kịp duyệt: cho tự tạo kèm giới hạn (phương án G1), admin chỉ khoá khi vi phạm.
- Cần thông báo khi được duyệt: thêm thông báo đẩy (Web Push) hoặc email.
- Tổ chức cần thêm thông tin công khai (mô tả, lĩnh vực, tìm kiếm): mở rộng `directory`.
- Cần phiên có hạn vì yêu cầu bảo mật: thêm hết hạn kèm cơ chế giữ quyền gửi phiếu chưa đồng bộ.
