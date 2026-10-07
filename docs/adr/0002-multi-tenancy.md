# ADR 0002: Nhiều tổ chức trên một hệ thống (multi-tenancy theo dự án)

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-10-07
- **Người phụ trách:** Thành viên 2 (Sync & Server)
- **Liên quan:** [design.md](../design.md) §2, §5.5, §6, §7, §9; [ADR 0001 – Mô hình nhất quán](0001-consistency-model.md)

## Bối cảnh

Bản thiết kế đầu giả định cả hệ thống phục vụ **một tổ chức**: mọi người thấy mọi form, giám sát viên thấy mọi phiếu. Mục tiêu mới là phục vụ **nhiều nhóm thuộc các tổ chức tách biệt**, ví dụ một nhóm y tế xã, một hợp tác xã nông nghiệp, một nhóm nghiên cứu giáo dục. Họ dùng chung một bản triển khai nhưng:

1. Không nhóm nào thấy form, phiếu, ảnh của nhóm khác.
2. Một người có thể tham gia nhiều nhóm với vai trò khác nhau (điều tra viên ở nhóm A, giám sát viên ở nhóm B).
3. Thay đổi thành viên (thêm, đổi vai trò, rút ra) phải hoạt động đúng với thiết bị đang offline, và **không làm mất phiếu chưa gửi** (ADR 0001, yêu cầu 1).
4. Vẫn vừa sức 3 người trong 8 tuần.

## Các phương án đã xem xét

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Mỗi tổ chức một bản triển khai** | Không sửa code; cách ly tuyệt đối | Mỗi nhóm phải tự vận hành server, HTTPS, sao lưu; một người ở hai nhóm cần hai app khác origin; không còn là "một hệ thống phục vụ nhiều nhóm" |
| **B. Một CSDL dùng chung, mọi dữ liệu gắn `project_id`** (chọn) | Một lần triển khai, một lần migrate; người dùng dùng chung giữa các dự án; đủ đơn giản với SQLite | Cách ly phụ thuộc vào việc mọi truy vấn đều lọc `project_id`: một câu SQL quên lọc là lộ dữ liệu |
| **C. Mỗi dự án một file SQLite** | Cách ly mạnh, xoá dự án dễ | Bảng người dùng và thành viên phải nằm ở file riêng; migrate N file; truy vấn chéo khó; phức tạp hơn mức cần |
| **D. Nhiều đội trong một tổ chức** (chỉ gắn nhãn đội, không cách ly) | Đơn giản nhất | Không đáp ứng yêu cầu 1 |

Rủi ro chính của B (quên lọc) được giảm bằng cách lấy `project_id` **chỉ** từ đường dẫn đã qua kiểm tra thành viên, gom truy vấn vào một lớp truy cập dữ liệu nhận `projectId` bắt buộc, và có bộ test cách ly riêng (mục Kiểm chứng).

## Quyết định

### 1. Đơn vị cách ly: Dự án

- **Dự án** (`project`) là đơn vị duy nhất để tách dữ liệu. Một tổ chức cần nhiều cuộc khảo sát độc lập thì tạo nhiều dự án; không có cấp "tổ chức" phía trên.
- Form, phiếu, lịch sử phiếu, ảnh, khoá idempotency đều thuộc đúng một dự án. Phiếu **không bao giờ** chuyển dự án.
- `id` form chỉ cần duy nhất trong dự án: khoá chính `forms(project_id, id, version)`. Hai dự án có thể cùng có form `household-survey`.

### 2. Người dùng và vai trò

| Vai trò | Phạm vi | Quyền |
|---|---|---|
| `admin` | Toàn hệ thống (cờ `is_admin` trên người dùng) | Tạo/đổi tên/lưu trữ dự án; chỉ định giám sát viên đầu tiên. **Không** tự động đọc được dữ liệu dự án |
| `supervisor` | Theo dự án | Đọc/sửa mọi phiếu của dự án, tạo/sửa form, xuất dữ liệu, thêm/rút/đổi vai trò thành viên |
| `surveyor` | Theo dự án | Tạo phiếu, đọc/sửa phiếu do mình tạo |

- Bảng `users(id, name, token_hash, is_admin, disabled, created_at)` và `memberships(project_id, user_id, role, added_at)`.
- **Tạo người dùng và cấp token** bằng lệnh CLI ở server (`npm run user:add -w server -- --name "Lan"`). Token chỉ in ra một lần, server lưu SHA-256. Không có tự đăng ký, không mời qua email.
- Giám sát viên thêm thành viên vào dự án bằng mã người dùng (`userId`) trong màn hình "Thành viên".
- Một thiết bị dùng **một tài khoản**; tài khoản đó có thể thuộc nhiều dự án.

### 3. Cách ly ở server

- Mọi API theo dự án nằm dưới `/api/projects/:projectId/...`. API không theo dự án: `GET /api/me`, `/api/admin/*`, `/api/health`.
- Middleware `requireMember(minRole)` chạy trước mọi route theo dự án:
  - không có token hoặc token sai → `401 unauthorized`;
  - không là thành viên dự án (hoặc dự án đã lưu trữ) → `403 not_member`;
  - đủ điều kiện → gắn `req.ctx = { userId, projectId, role }`.
- Route chỉ được lấy `projectId` từ `req.ctx`, không từ thân request hay query.
- Mọi truy vấn đi qua lớp truy cập dữ liệu nhận `ctx` làm tham số bắt buộc và luôn thêm `WHERE project_id = ?`.
- **ID toàn cục, kiểm tra chéo:** `id` phiếu và ảnh là UUID do client tạo, duy nhất toàn hệ thống. Nếu `PUT .../records/:id` hoặc thao tác ảnh nhắm vào một id đã tồn tại ở **dự án khác**, server trả `404 not_found` (không ghi, không tiết lộ là id đó có tồn tại).
- **Idempotency:** `request_hash` tính cả `projectId`, nên dùng lại key ở dự án khác cũng nhận `422 idempotency_key_reused` (ADR 0001 quy tắc 3).
- **Phạm vi trong dự án** (design §5.5): `surveyor` chỉ thấy phiếu có `created_by` = mình; `supervisor` thấy tất cả. Áp dụng cho pull, lịch sử, ảnh, PUT.

### 4. Lưu trữ ở client: mỗi dự án một IndexedDB

- CSDL `field-survey-account`: token, thông tin người dùng, danh sách dự án và vai trò (bản sao của `GET /api/me`), dự án đang chọn.
- Mỗi dự án một CSDL `field-survey-p-<projectId>` với đúng schema Dexie ở design §4.2 (forms, records, outbox, conflicts, attachments, meta).
- Lý do chọn mỗi dự án một CSDL thay vì một CSDL có cột `projectId`:
  - UI chỉ mở CSDL của dự án đang chọn, nên không thể vô tình hiển thị lẫn dữ liệu hai dự án.
  - Rút khỏi dự án thì chỉ cần `Dexie.delete(...)`, không phải xoá lọc từng bảng.
  - Sync engine hiện tại dùng lại gần như nguyên vẹn, chỉ nhận thêm tham số CSDL.
- Cái giá: đếm "cần xử lý" trên mọi dự án phải mở nhiều CSDL. Giải quyết bằng cách sau mỗi vòng đồng bộ ghi số đếm của từng dự án vào `field-survey-account`.

### 5. Đồng bộ nhiều dự án

Mỗi vòng đồng bộ (vẫn trong một Web Lock duy nhất cho cả thiết bị):

1. `GET /api/me` → danh sách dự án và vai trò, lưu vào `field-survey-account`. Offline thì dùng bản đã lưu.
2. Với từng dự án, dự án đang chọn trước: push outbox → upload ảnh → pull → tải form (đúng quy trình design §5.3, đường dẫn có `projectId`).
3. Cursor pull lưu trong `meta` của CSDL dự án, kèm phạm vi lúc pull: `{ cursor, scope: 'own' | 'all' }`. Response pull có trường `scope`; khác với phạm vi đã lưu thì đặt cursor về 0 và pull lại từ đầu.

### 6. Thay đổi thành viên khi thiết bị có thể đang offline

| Sự kiện | Server | Client (ở vòng đồng bộ đầu tiên sau khi biết) |
|---|---|---|
| Được thêm vào dự án | Thêm dòng `memberships` | Tạo CSDL dự án, cursor 0, pull toàn bộ trong phạm vi |
| Nâng `surveyor` → `supervisor` | Đổi `role` | `scope` đổi thành `all` → cursor về 0, pull thêm phiếu của người khác |
| Hạ `supervisor` → `surveyor` | Đổi `role` | Phạm vi bị thu hẹp: xử lý như "bị rút" rồi "được thêm lại", để phiếu của người khác không còn trên máy |
| Bị rút khỏi dự án, hoặc dự án bị lưu trữ | Xoá `memberships` / đánh dấu lưu trữ; mọi request của người đó vào dự án trả `403 not_member` | Ngừng gửi. **Không có dữ liệu chưa gửi** (outbox rỗng, ảnh xong, không nháp, không xung đột): xoá CSDL dự án. **Có:** giữ CSDL, hiện "Bạn không còn thuộc dự án X. N phiếu chưa gửi được" với nút "Xuất JSON" và "Xoá khỏi máy" (người dùng tự bấm) |

- Không bao giờ tự động xoá dữ liệu chưa gửi (ADR 0001, yêu cầu 1).
- Phiếu người đó đã gửi lên vẫn ở lại dự án trên server; `created_by` giữ nguyên.
- Phiếu của người đã bị rút vẫn hiện cho giám sát viên, ghi rõ tác giả "(đã rời dự án)".

### 7. Ngoài phạm vi

Tổ chức nhiều cấp (tổ chức → dự án), tự đăng ký, mời qua email, SSO, chia sẻ form giữa các dự án (thay bằng xuất/nhập JSON form), chuyển phiếu giữa dự án, nhiều tài khoản trên một thiết bị, giới hạn dung lượng theo dự án, giao phiếu theo khu vực cho nhiều điều tra viên.

## Hệ quả

**Tích cực**
- Một bản triển khai phục vụ nhiều nhóm; nhóm mới chỉ cần admin tạo dự án và một giám sát viên.
- Người làm cho nhiều nhóm dùng một app, đổi dự án ở thanh trên cùng, dùng được cả khi offline.
- Mô hình nhất quán của ADR 0001 giữ nguyên, chỉ thu hẹp phạm vi về một dự án.

**Tiêu cực, chấp nhận được**
- Thêm khoảng 1,5–2 tuần công (bảng người dùng/thành viên, middleware, CLI, màn hình chọn dự án và thành viên, sync nhiều CSDL, bộ test cách ly). Phải cắt: builder kéo thả (thay bằng nút lên/xuống), so sánh ảnh trong màn hình xung đột, export ZIP.
- Mọi đường dẫn API đổi; E2E và integration test hiện có phải sửa.
- Cách ly dựa vào kỷ luật code (mọi truy vấn qua lớp có `ctx`), nên phải giữ bộ test cách ly luôn chạy trong CI.
- Thiết bị tham gia nhiều dự án tốn dung lượng tương ứng; chỉ tiêu dung lượng ở design §11.2 tính cho tổng các dự án.

**Việc phát sinh trong code**
- Server: bảng `projects`, `users`, `memberships`; thêm `project_id` vào `forms`, `records`, `record_history`, `idempotency`, `attachments`; index `(project_id, seq)`, `(project_id, created_by, seq)`; middleware; CLI `user:add`, `user:rotate-token`, `project:add`; route `/api/me`, `/api/admin/projects`, `/api/projects/:projectId/members`.
- Client: CSDL `field-survey-account`; mở CSDL theo dự án; sync engine nhận CSDL làm tham số; bộ chọn dự án; màn hình Thành viên (supervisor) và Dự án (admin); banner khi bị rút.
- Seed: hai dự án mẫu (`demo-yte`, `demo-nongnghiep`), mỗi dự án một form, để demo cách ly.

## Kiểm chứng

| # | Mức | Ca | Kỳ vọng |
|---|---|---|---|
| T1 | Integration | Thành viên dự án A gọi API của dự án B | `403 not_member` |
| T2 | Integration | `PUT /projects/B/records/:id` với id đã có ở dự án A | `404`, dữ liệu dự án A không đổi |
| T3 | Integration | Pull của `surveyor` và `supervisor` cùng dự án | Surveyor chỉ nhận phiếu mình tạo; supervisor nhận tất cả (trùng A2 ở design §10.1) |
| T4 | Integration | Admin không là thành viên đọc phiếu của dự án | `403 not_member` |
| T5 | Integration | Duyệt mọi route theo dự án với token của dự án khác | Không route nào trả `2xx` (test tự liệt kê route từ router Express) |
| T6 | E2E | Được thêm vào dự án mới khi đang có dữ liệu dự án khác | Sau một vòng đồng bộ thấy đủ phiếu của dự án mới, dự án cũ không đổi |
| T7 | E2E | Bị rút khỏi dự án khi còn phiếu chưa gửi | Phiếu còn trên máy, có banner và nút Xuất JSON; không có request nào gửi đi |
| T8 | E2E | Bị rút khỏi dự án khi không còn gì chưa gửi | CSDL dự án bị xoá, dự án biến khỏi bộ chọn |
| T9 | E2E | Nâng `surveyor` → `supervisor` | Cursor về 0, thấy phiếu của người khác |
| T10 | E2E | Offline, chuyển qua lại giữa hai dự án đã tải | Mỗi dự án chỉ hiện form và phiếu của mình |

## Khi nào xem lại

- Có yêu cầu pháp lý về cách ly dữ liệu (ví dụ dữ liệu y tế phải nằm trên máy chủ riêng): dùng phương án A cho nhóm đó.
- Số dự án hoặc số phiếu đủ lớn để một file SQLite thành nút thắt: cân nhắc phương án C hoặc Postgres (lưu ý giới hạn cursor ở ADR 0001).
- Cần cấp tổ chức để quản lý nhiều dự án chung thành viên và form mẫu: thêm bảng `organizations` phía trên `projects`.
- Cần nhiều tài khoản trên một thiết bị: tách `field-survey-account` theo người dùng.
