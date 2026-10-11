# Phân công nhóm 3 người (8 tuần)

Khung dự án đã có sẵn phần lõi đồng bộ (outbox, PUT có điều kiện, idempotency, merge, màn hình conflict cơ bản) và 3 test E2E chạy qua. Phần còn lại chia theo **chiều dọc**: mỗi người sở hữu một mảng từ UI xuống server và tự viết test cho mảng đó, để ít phải chờ nhau.

**Ticket chi tiết cho từng người:** [docs/plan/](plan/README.md). **Quy trình làm với AI:** [docs/vibe-coding.md](vibe-coding.md).

Từ bản design 0.3, hệ thống phục vụ nhiều tổ chức theo [ADR 0002](adr/0002-multi-tenancy.md). Phần này thêm khoảng 1,5–2 tuần công và được chia cho cả ba người; bù lại đã cắt builder kéo thả, so sánh ảnh trong màn hình xung đột và export ZIP.

## Vai trò

### Thành viên 1: Form, PWA, màn hình dự án và môi trường demo

Sở hữu: `client/src/components/`, `client/src/pages/` (trừ ConflictPage), `server/src/routes/forms.ts`, `server/src/routes/members.ts`, `client/vite.config.ts`, môi trường staging.

- **Staging HTTPS** (design §12) ngay tuần 1–2: cả nhóm mở được app trên điện thoại thật. Đây là điều kiện cho định nghĩa "xong" ở dưới.
- Màn hình nhập mã đăng nhập, **bộ chọn dự án**, màn hình **Thành viên** (supervisor) và **Dự án** (admin), banner "đã rời dự án" (design §4.7); API `P/members`.
- Form builder: thêm/ẩn trường, đổi thứ tự bằng nút lên/xuống, panel thuộc tính, xem trước, xuất/nhập form JSON (design §4.1).
- `POST P/forms` có validate (gồm so với phiên bản trước, cờ `hidden`) và tự tăng version; hiển thị phiếu theo đúng `formVersion`.
- Validate phiếu khi lưu (required, số, ngày), trạng thái nháp `draft` (design §4.1, §5.1).
- Service worker: `registerType: 'prompt'` và thông báo cập nhật; icon PNG; hướng dẫn cài; kiểm tra trình duyệt hỗ trợ (design §11.1); `storage.persist()` và trang Cài đặt.
- Test: E2E O1, O2, O4, O5, T6, T10; integration A4; unit cho validate form và validate phiếu.

### Thành viên 2: Đồng bộ và Server (giữ ADR)

Sở hữu: `client/src/sync/`, `client/src/db/`, `shared/`, `server/src/routes/records.ts`, `server/src/db.ts`, `server/src/auth.ts`, `docs/adr/`.

- Giữ ADR 0001 và 0002 đúng với code; viết ADR mới khi đổi quyết định.
- **Lõi multi-tenancy ở server:** bảng `projects`, `users`, `memberships`, cột `project_id`; middleware `requireMember`; lớp truy cập dữ liệu bắt buộc `ctx`; chuyển mọi route sang `/api/projects/:projectId`; `GET /api/me`, `/api/admin/*` (ADR 0002 §2–3).
- Xác thực bằng token, `updatedBy`/`created_by` từ token, phạm vi pull `own`/`all` (design §5.5, §9).
- **Lõi multi-tenancy ở client:** CSDL `field-survey-account`, mỗi dự án một CSDL, sync engine chạy theo từng dự án, cursor theo dự án kèm `scope`, xử lý thay đổi thành viên (ADR 0002 §4–6).
- Idempotency: lưu `project_id`, `record_id`, `request_hash`, trả `422` khi dùng lại key (ADR 0001 quy tắc 3); dọn bảng `idempotency`.
- Sửa `drop` fault để cắt kết nối **sau** khi ghi (phục vụ R3).
- Web Locks cho vòng đồng bộ; pull bỏ qua phiếu nháp.
- Trạng thái lỗi và retry thủ công cho op `failed`; cảnh báo op tồn quá lâu (design §5.2).
- Hiệu năng pull khi có vài nghìn phiếu, đo theo design §11.2.
- Test: integration API (R6, A1–A3); E2E C1, C6, C8, R2, R3, R5, O6, T7, T8, T9.

### Thành viên 3: Conflict UX, Ảnh, Export, đầu mối kiểm thử

Sở hữu: `client/src/pages/ConflictPage.tsx`, `server/src/routes/attachments.ts`, `server/src/routes/export.ts`, `server/src/routes/faults.ts`, `server/src/cli/`, `client/e2e/`, `server/test/`, CI.

- Hoàn thiện màn hình conflict: nhãn trường thay cho id, mục "đã gộp tự động", hộp thoại xoá vs sửa không có lựa chọn mặc định, "gộp cả hai" cho multiselect/photo (design §4.5).
- Chế độ chỉ đọc khi phiếu đang `conflict` (design §4.5, ADR 0001 quy tắc 7). Việc này sửa trang điền phiếu của TV1, nên làm chung với TV1.
- Nén ảnh và upload theo chunk có tiếp tục, hàng đợi ảnh và nhãn "Đang tải ảnh" (design §4.4, §5.6), cả client và server, đường dẫn theo dự án.
- Export CSV/JSON theo dự án (design §4.6).
- **CLI quản trị** (`user:add`, `user:rotate-token`, `user:disable`, `seed:demo`) và **fixture hai dự án** dùng chung cho mọi test (design §10.1, §12).
- **Bộ test cách ly T1–T5** (ADR 0002), gồm T5 tự liệt kê mọi route; bắt buộc chạy trong CI.
- Đổi route tiêm lỗi sang bật chủ động bằng `ENABLE_TEST_ROUTES=1` (design §9).
- Đầu mối kiểm thử: dựng GitHub Actions, giữ ma trận E2E (design §10.1) luôn cập nhật, review test của hai bạn còn lại.
- Test: E2E C2, C4, C5, C7, O3, R4; integration T1–T5; unit cho export CSV (gồm escape và CSV injection).

## Lộ trình

| Tuần | Thành viên 1 | Thành viên 2 | Thành viên 3 | Mốc chung |
|---|---|---|---|---|
| 1 | Chạy được khung; dựng staging HTTPS | Thiết kế chi tiết schema `projects`/`users`/`memberships` và lớp `ctx` | Dựng CI; `ENABLE_TEST_ROUTES`; thiết kế fixture hai dự án | Cả nhóm đọc và ký nhận ADR 0001, 0002; ai cũng chạy được `npm run dev` và `npm test` |
| 2 | Staging xong; màn hình nhập mã; `POST P/forms`, builder bản 1 | Bảng mới, middleware, chuyển route sang `/api/projects/:projectId`, token auth | CLI `user:add`, `seed:demo`; sửa E2E/integration hiện có theo đường dẫn mới và token (cùng PR với TV2); nén ảnh | Tạo form từ UI trong một dự án, điền offline **trên điện thoại thật qua HTTPS** |
| 3 | Validate, trạng thái nháp, O5 | `GET /api/me`; CSDL account + CSDL theo dự án; sync nhiều dự án | Test cách ly T1–T5; upload chunk (server) | **Cách ly dự án có test xanh trong CI** |
| 4 | Bộ chọn dự án; thông báo cập nhật SW | Cursor theo `scope`; thay đổi thành viên (T7–T9); R2, R3, R6 | Upload chunk (client, tiếp tục), hàng đợi ảnh | **Demo giữa kỳ:** hai dự án tách biệt, offline có ảnh, đồng bộ đúng |
| 5 | Màn hình Thành viên, Dự án; `formVersion`, `hidden` | Op `failed`, retry thủ công, R5; Web Locks, O6; C1, C6, C8 | Conflict UI đầy đủ, chế độ chỉ đọc (cùng TV1), C7 | |
| 6 | E2E O2, O4, T6, T10; A4 | Pull phân trang, đo hiệu năng §11.2 | Hộp thoại xoá vs sửa; C4, C5 | **Toàn bộ ca conflict và cách ly có test** |
| 7 | Sửa lỗi, hoàn thiện UI | Sửa lỗi, cập nhật ADR | Export CSV/JSON; O3, R4 | Đóng băng tính năng **giữa tuần 7** |
| 8 | Tài liệu người dùng (gồm hướng dẫn cho giám sát viên và quản trị) | Tài liệu kỹ thuật sync và multi-tenancy | Báo cáo kiểm thử | **Demo cuối kỳ**, nộp báo cáo |

Nửa sau tuần 7 là thời gian dự phòng: chỉ sửa lỗi và bù việc trễ. Việc bị cắt trước tiên nếu trễ, theo thứ tự:
1. Màn hình Dự án cho admin (dùng CLI thay).
2. Xuất/nhập form JSON.
3. "Gộp cả hai" cho multiselect.
4. Đo hiệu năng đầy đủ (giữ phép đo pull 2.000 phiếu).

Không được cắt: bộ test cách ly T1–T5, xử lý bị rút khỏi dự án khi còn phiếu chưa gửi (T7).

**Phụ thuộc cần để ý**
- **Tuần 2 là tuần rủi ro nhất:** đổi đường dẫn API và thêm token làm vỡ mọi test hiện có. TV2 và TV3 làm chung một PR; trước khi merge, `main` không nhận PR nào khác đụng `server/src/routes/`.
- Sync nhiều dự án (TV2, tuần 3) là điều kiện để TV1 làm bộ chọn dự án (tuần 4) và TV3 làm hàng đợi ảnh theo dự án (tuần 4). Thống nhất API của lớp CSDL theo dự án (`openProjectDb(projectId)`) ngay đầu tuần 3.
- Hàng đợi ảnh (TV3) chạy trong vòng đồng bộ của TV2: thống nhất điểm gọi trong `engine.ts` ở tuần 3.
- Thay đổi schema Dexie (CSDL theo dự án, `attachments.nextAttemptAt`, `validationErrors`) do TV2 gộp vào một lần định nghĩa `ProjectDb`, tránh hai người cùng nâng schema.

## Quy trình làm việc

- **Git:** nhánh `main` luôn chạy được. Mỗi ticket một nhánh `feat/<mã-ticket>-<tên-ngắn>` (vibe-coding §2), mở PR, ít nhất một bạn review. CI phải xanh mới merge.
- **Phần lõi cần hai người duyệt:** PR sửa `shared/`, `docs/adr/`, `client/src/db/`, `client/src/sync/engine.ts`, `server/src/auth.ts` hoặc bất kỳ câu SQL nào trên dữ liệu dự án cần cả hai bạn còn lại duyệt. Người duyệt kiểm tra riêng: truy vấn có đi qua `ctx` không.
- **Giao diện giữa các mảng** là kiểu trong `shared/src/types.ts` và API ở design §7. Đổi kiểu dùng chung thì báo cả nhóm và cập nhật tài liệu (kể cả bảng lịch sử thay đổi trong design.md) trong cùng PR.
- **Họp:** 15 phút đầu tuần (kế hoạch), 30 phút cuối tuần (demo nội bộ trên staging với hai dự án mẫu, cập nhật bảng tiến độ).
- **Định nghĩa "xong":** có test, CI xanh, tài liệu liên quan đã cập nhật, demo được trên điện thoại thật qua staging HTTPS ít nhất một lần.

## Nếu nhóm thay đổi số người

- **2 người:** bỏ màn hình Dự án và Thành viên (quản lý hoàn toàn bằng CLI); gộp TV1 và TV3 phần UI; builder chỉ cần sửa JSON có xem trước.
- **4 người:** người thứ tư nhận toàn bộ multi-tenancy phía client (CSDL theo dự án, bộ chọn dự án, màn hình Thành viên/Dự án, T6–T10), TV2 tập trung server và sync.
- **5 người:** thêm một người làm loại trường mới cho các lĩnh vực (design §14) và bộ test hiệu năng.
