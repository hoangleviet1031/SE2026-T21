# Tài liệu thiết kế: Offline-first Field Survey PWA

- **Phiên bản:** 0.5.32 (2026-10-18)
- **Nhóm:** 3 sinh viên, 8 tuần. Phân công ở [team-plan.md](team-plan.md).
- **Quyết định kiến trúc (đã chấp nhận):** [ADR 0001 – Mô hình nhất quán](adr/0001-consistency-model.md), [ADR 0002 – Nhiều tổ chức](adr/0002-multi-tenancy.md), [ADR 0003 – Tài khoản, Owner, trang quản trị](adr/0003-accounts-and-owner-role.md) (thay một phần ADR 0002)
- **Quy ước:** "Code chưa làm" nghĩa là spec đã chốt nhưng khung mã hiện tại chưa theo.
- **Quy ước bản cũ / bản mới (từ 0.5):** chỗ nào ADR 0003 đổi so với code đang chạy thì ghi hai nhãn:
  - **🆕 Bản mới (ADR 0003, chưa có code):** spec đích, làm theo các ticket nhóm "Theo ADR 0003" trong [plan/](plan/README.md).
  - **🕘 Bản cũ (đang chạy, ADR 0002):** cách code hiện tại đang làm; giữ để đối chiếu, sẽ bỏ khi ticket tương ứng xong.

  Mục không có nhãn thì không bị ADR 0003 ảnh hưởng. Khi ticket xong, xoá đoạn 🕘 và bỏ nhãn 🆕 trong cùng PR.
- **Phác thảo giao diện:** [ui.md](ui.md)

## Lịch sử thay đổi

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 0.1 | 2026-10-07 | Bản đầu |
| 0.2 | 2026-10-07 | Thêm trạng thái nháp, sơ đồ trạng thái đầy đủ, khoá sửa khi đang xung đột, đồng bộ ảnh (§5.6), nhiều tab, phạm vi pull và vai trò, ràng buộc idempotency key, trình duyệt hỗ trợ, yêu cầu phi chức năng, triển khai, mã lỗi API, tiêu chí chấp nhận, thuật ngữ |
| 0.3 | 2026-10-07 | Chốt ADR 0001; phục vụ nhiều tổ chức theo ADR 0002: dự án, thành viên, vai trò `admin`, API theo dự án, mỗi dự án một IndexedDB, màn hình Dự án/Thành viên (§4.7); cắt builder kéo thả, so sánh ảnh, ZIP |
| 0.3.1 | 2026-10-09 | §9: route tiêm lỗi chuyển sang bật bằng `ENABLE_TEST_ROUTES=1` (TV3-01); §10: thêm unit test phía client |
| 0.4 | 2026-10-09 | Lấp chỗ hở trong spec: `createdBy` và tên người sửa trong `ServerRecord`/lịch sử (§6.2, §7), định dạng `GET /api/me` (§7), phân trang pull `hasMore` (§7), validate theo từng loại trường (§4.1), danh sách phiếu và bộ lọc (§4.8), đăng nhập mã khác khi còn dữ liệu (§4.7), xoá phiếu (§5.7), API tiêm lỗi đầy đủ (§10.1), cập nhật cấu trúc mã nguồn (§3); thêm [ui.md](ui.md). Các đề xuất chờ chốt liệt kê ở §14 |
| 0.4.1 | 2026-10-10 | Nhóm chốt P1, P2, P3, P5, P6, P8 (§14); bỏ nhãn "chờ chốt" ở §4.7, §5.7, §6.2, §7, §10.1 |
| 0.4.2 | 2026-10-10 | Thêm ca kiểm thử O7, O8 cho xoá phiếu (§10.1); P6 giao cho ticket TV2-13, TV1-13 (§14) |
| 0.4.3 | 2026-10-08 | TV2-01: chốt schema server sau migration 2 (§6.1): `record_history` có `project_id` (khớp ADR 0002), thêm index `memberships(user_id)`, `idempotency(created_at)`, khoá ngoại và `CHECK` vai trò; `attachments` để TV3-05 thêm ở migration 3 |
| 0.4.4 | 2026-10-11 | TV2-03: `P/forms`, `P/records` (pull, history, PUT) chạy theo dự án và có xác thực (§7); `PullResponse.scope` thêm, `PushRecordRequest` bỏ `updatedBy` (§6.2); server dev/E2E nạp tài khoản demo khi `SEED_DEMO=1` |
| 0.4.5 | 2026-10-11 | TV3-02: `seed:demo` từ chối chạy khi `NODE_ENV=production` (§12); `user:add` sinh `userId` dạng `u_` + 8 ký tự a-z0-9 |
| 0.4.6 | 2026-10-10 | `FieldDef.hidden` và `validateRecord` đã có code (§4.1, §6.2; TV1-05 phần thuần) |
| 0.4.7 | 2026-10-12 | TV2-04: `GET /me` và `/admin/projects` có code (§7); chốt định dạng API admin (id dự án do admin đặt, `PUT .../members/:userId` không có thân); thêm kiểu `AdminProject`, `CreateProjectRequest`, `UpdateProjectRequest` (§6.2) và mã `409 project_exists` (§7.1) |
| 0.4.8 | 2026-10-12 | TV2-05: client tách `field-survey-account` và `field-survey-p-<projectId>` (§4.2); `ProjectDb` version 1 gồm `draft`, `validationErrors`, `attachments.nextAttemptAt`; CSDL `field-survey` cũ bị xoá khi khởi động; `api.ts` nhận `projectId` bắt buộc |
| 0.4.9 | 2026-10-12 | TV2-06: vòng đồng bộ chạy trong Web Lock `field-survey-sync`, gọi `/me`, đồng bộ mọi dự án `active` (đang chọn trước), ghi số đếm "cần xử lý" (`conflict` + `error`) và "chưa đồng bộ" (`pending` + `draft`) vào `field-survey-account` (§4.2, §5.3); O6 có E2E (§10.1) |
| 0.4.10 | 2026-10-12 | TV2-07: `meta.pull = { cursor, scope }` và quy tắc phạm vi rộng/hẹp (§5.5); dự án bị rút hoặc hạ vai trò chỉ bị xoá dữ liệu khi không còn gì chưa gửi; `403 not_member` dừng dự án; route kiểm thử `/api/__test/memberships` (§10.1) |
| 0.4.11 | 2026-10-12 | TV2-08: `request_hash` = SHA-256 của JSON chuẩn hoá (khoá sắp xếp) gồm `projectId`, `recordId` và các trường `PushRecordRequest`; khác hash thì `422`; dọn key quá 30 ngày khi khởi động và mỗi 24 giờ; fault `drop` cắt kết nối sau khi ghi, thêm `drop-before` (§10.1); R2, R3, R6 có test |
| 0.4.12 | 2026-10-12 | TV2-09: op `failed` (4xx tính một lần gửi), sửa phiếu lỗi tạo op mới thay vì sửa op đã gửi, "Thử lại" giữ `opId` và `attempts` (§5.1); `createdAt` của op và quy tắc cảnh báo tồn lâu (§5.2); fault mode `"400"` và R5 có test (§10.1) |
| 0.4.13 | 2026-10-12 | Thêm đề xuất P9 ([ADR 0003](adr/0003-accounts-and-owner-role.md), chưa chốt): tự tạo tài khoản bằng tên + mật khẩu, tổ chức công khai (chỉ hiện tên), vai trò `owner` của tổ chức, yêu cầu mở tổ chức do admin duyệt, trang quản trị riêng. Các mục spec khác chưa đổi (§14) |
| 0.5 | 2026-10-12 | Chấp nhận ADR 0003 (PR #21, P9 chuyển sang "Đã chốt"). Spec đổi theo, **chưa có code**, đánh dấu 🆕/🕘: tài khoản tên + mật khẩu và bảng `sessions` (§4.7, §6.1, §9), vai trò `owner` (§2, §6.2), yêu cầu mở tổ chức do admin duyệt, tổ chức công khai chỉ hiện tên (§4.7), trang quản trị `/admin/` tách khỏi PWA (§2, §3, §4.3, §4.9), API và mã lỗi mới (§7, §7.1), ca kiểm thử U, Q, D, M, A5–A8 (§10.1), CLI (§12) |
| 0.5.1 | 2026-10-12 | TV1-05 client: phiếu không hợp lệ lưu thành `draft` kèm `validationErrors`, không tạo, sửa hay xoá op; op chưa gửi và op `failed` có sẵn được giữ; push xong op cũ vẫn giữ `draft`; pull bỏ qua `draft` (§4.1, §5.1, ADR 0001 quy tắc 8). O5 có test (§10.1) |
| 0.5.2 | 2026-10-12 | TV1-07 phần 1: trang Cài đặt (tên, `userId`, dung lượng) và Đăng xuất có code (§4.7); `account.user` ghi sau mỗi lần gọi `/me` (§4.2). 🆕 Spec mới (tên đăng nhập, `/auth/logout`) làm sau TV2-14/TV2-16 |
| 0.5.3 | 2026-10-12 | TV1-03: `POST P/forms` có code (§7): thân `SaveFormRequest` (§6.2), `version` do server đặt, `invalid_body`/`invalid_form`; luật lưu form thêm: `id` form cùng mẫu id trường, `title` không trống, option không trống, `options` ở trường không phải select bỏ qua (§4.1); `validateFormSchema` trong `shared/`; A3 phần forms và A5 phần supervisor/surveyor có test (§10.1); Owner chờ TV2-14 |
| 0.5.4 | 2026-10-13 | TV1-06: bộ chọn dự án có code (§4.7): chưa chọn lần nào hoặc dự án đã chọn đã rời thì vào dự án active đầu tiên theo thứ tự `/me`, bỏ mặc định `demo-yte` (§4.2); dự án "Đã rời" không chọn được; banner bị rút ở trang chủ, N đếm phiếu nháp/chờ/lỗi/xung đột, "Xoá khỏi máy" hỏi xác nhận; màn hình chưa có dự án. T7 đủ phần banner (§10.1). 🆕 Owner, "Tổ chức khác…" chờ TV2-16, TV1-15 |
| 0.5.5 | 2026-10-13 | TV1-04: form builder có code (§4.1): mã form/trường gợi ý từ nhãn và khoá sau khi lưu, chỉ xoá được trường chưa lưu, xem trước khoá ô nhập, lưu xong ghi form vào IndexedDB, builder báo trường thiếu nhãn; offline "Cần kết nối để lưu form"; hai người cùng sửa: bản lưu sau thành version mới (§13) |
| 0.5.6 | 2026-10-13 | Sửa lỗi TV1-03: `id` form được có dấu `-` (`^[a-zA-Z][a-zA-Z0-9_-]*$`), vì form mẫu `household-survey` không lưu được bản mới; `id` trường giữ mẫu cũ (§4.1) |
| 0.5.7 | 2026-10-14 | TV1-07 phần 2a: SW `registerType: 'prompt'` có code, dải "Có phiên bản mới" + [Tải lại], hỏi xác nhận khi đang nhập phiếu, kiểm bản mới mỗi 60 phút, `clientsClaim` ở lần cài đầu; runtime cache sửa theo đường dẫn theo dự án; `/admin/` không qua SW; icon PNG 192/512 (maskable) và `apple-touch-icon` (§4.3) |
| 0.5.8 | 2026-10-14 | TV1-07 phần 2b: kiểm tra API bắt buộc khi mở app và màn hình "Trình duyệt không được hỗ trợ" có code (§11.1); `storage.persist()` gọi sau mỗi lần lưu phiếu kể cả nháp, bỏ qua nếu đã được cấp (§4.2); hướng dẫn cài lên màn hình chính ở trang Cài đặt (§4.3); Đăng xuất xoá cache runtime `me`, `forms` của SW, giữ precache (§4.7) |
| 0.5.9 | 2026-10-15 | TV3-05: `P/attachments/*` có code (§7): dạng response của `status`, `chunks`, `complete`; bảng `attachments` là migration 3, file ở `uploads/<projectId>/<id>/` (§6.1). Bước ADR 0003 (TV2-14) lấy số migration kế tiếp |
| 0.5.10 | 2026-10-15 | TV3-03: nén ảnh có code (§4.4): JPEG 0.8, vượt 600 KB thì 0.7, 0.6, vẫn vượt thì vẫn lưu; §8 thêm dòng ảnh không đọc được; §11.2 kích thước ảnh sau nén đo bằng E2E `photo.spec.ts` |
| 0.5.11 | 2026-10-16 | TV1-10 phần 1: trường ẩn có code: phiếu mới không hiện, phiếu đã có giá trị thì hiện chỉ đọc kèm "(đã ẩn)", có lỗi định dạng thì mở cho sửa (§4.1); vòng đồng bộ tải bản form mà phiếu trên máy đang dùng nếu máy chưa có (§5.3 bước 5); trang điền phiếu thiếu bản form thì gọi đồng bộ, offline hoặc tải không được thì "Cần kết nối để mở phiếu này" (§8). Xuất/nhập form làm ở phần 2 |
| 0.5.14 | 2026-10-16 | TV2-13: `deleteRecordLocally` có code (§5.7): xoá hẳn khi phiếu chưa thể tới server, xoá mềm và op xoá khi có thể đã tới; op xoá của phiếu nháp mang bản hợp lệ cuối cùng (op chưa gửi nếu còn, không thì `baseData`) và phiếu nhận luôn bản đó; op xoá được xác nhận thì xoá phiếu và ảnh khỏi máy; pull bỏ qua tombstone của phiếu máy không có. Nút "Xoá phiếu" hiện có gọi hàm này sau `confirm()` của trình duyệt với đúng câu chữ (TV1-13 thay bằng hộp thoại của app). O7, O8 có E2E (§10.1) |
| 0.5.13 | 2026-10-16 | TV2-10: phiếu `conflict` không lưu, không xoá được ở tầng dữ liệu (`saveRecordLocally` ném `RecordInConflictError`), trang điền phiếu báo "Phiếu này cần xử lý xung đột trước" kèm link (§4.5); bỏ op `blocked` (§5.2); 409 tự gộp được thì gửi lại ngay trong cùng vòng, tối đa 3 lần mỗi phiếu (§5.3). C1, C6, C8 và pull bỏ qua nháp có E2E (§10.1) |
| 0.5.15 | 2026-10-16 | TV2-14: migration 4 có code (§6.1): `users.username`, `users.password_hash`, bảng `sessions` (chép token cũ thành phiên), `projects.public`, `memberships` tạo lại có `owner` và `added_by`; admin là thành viên thì migration dừng. `POST /auth/register`, `/login`, `/logout` có code, `requireAuth` tra `sessions`, `/me` trả `username`, vai trò `owner` trong `requireMember` và phạm vi pull (§7); trust proxy loopback để giới hạn tần suất đếm đúng IP sau Caddy (§9); tài khoản tự đăng ký ghi `users.token_hash` giữ chỗ (§6.1); kiểu `Role`, `MeResponse`, `RegisterRequest`, `LoginRequest`, `AuthResponse` và `parseRegisterRequest`/`parseLoginRequest` trong `shared/` (§6.2). U1–U6, MG1, MG2, A5 phần Owner có test (§10.1). CLI và `seed:demo` ghi token thành phiên làm cầu nối tới TV3-12 (§12) |
| 0.5.16 | 2026-10-16 | TV3-12: CLI theo tài khoản có code (§12): `user:add --username`, `user:reset-password`, `user:revoke-sessions`, `user:disable` (khoá và thu hồi phiên), bỏ `user:rotate-token`; `seed:demo` có mật khẩu demo và Owner `chu`, giữ token demo tới TV1-14/TV2-16 |
| 0.5.17 | 2026-10-16 | TV3-06: hàng đợi ảnh có code (§5.6): chỉ ảnh còn trong phiếu chưa xoá mới upload và mới tính là dữ liệu chưa gửi; `409 missing_chunks` gửi bù, `422` lần đầu gửi lại từ đầu; thứ tự nhãn khi phiếu chưa đồng bộ; nhãn trên ảnh thu nhỏ; O3 có E2E (§10.1) |
| 0.5.12 | 2026-10-16 | TV1-10 phần 2: Xuất/Nhập form trong builder có code (§4.1): xuất `<id>-v<version>.json`, nhập nạp vào builder thành form mới; form mới trùng mã form đã có báo "Mã biểu mẫu đã có trong dự án"; kiểm kiểu thân lưu form chuyển sang `shared/` (`parseSaveFormRequest`), server dùng chung; §8 thêm dòng file nhập không hợp lệ |
| 0.5.18 | 2026-10-17 | TV1-08 phần 1: API thành viên có code (§7): `GET/POST P/members`, `PUT/DELETE P/members/:userId`, `PATCH P/settings`; thứ tự kiểm lỗi, supervisor không tự rút mình, đổi vai trò giữ `added_at` và ghi `added_by`; kiểm và ghi trong một transaction để không mất Owner cuối cùng. Kiểu `Member`, `ProjectSettings` và luật thân request, `canAssignRole` ở `shared/` (§6.2). `last_owner`, `already_member`, `admin_account` có code (§7.1). M1, M2, A6, A7, Q9, D2 (trừ vế D1) có test (§10.1). Màn hình Thành viên (phần 2) chưa có |
| 0.5.19 | 2026-10-17 | TV1-08 phần 2: màn hình Thành viên có code (§4.7, ui.md màn hình 6); supervisor và Owner thấy Sửa form, Thành viên; thêm `GET P/settings` (owner) để màn hình đọc trạng thái công khai (§7, Dương chốt); thao tác làm mình mất quyền chạy một vòng đồng bộ mới sau vòng đang chạy (`syncAfterChange`) để `/me` cập nhật ngay |
| 0.5.20 | 2026-10-17 | TV3-10: API kiểm thử `match`, `chunkIndex`, `stats` có code (§10.1), request bị cắt kết nối ghi `status: 0`; R4 có E2E, O3 kiểm 2 ảnh và trạng thái "Đang tải ảnh (2)" |
| 0.5.21 | 2026-10-17 | TV3-07: màn hình xung đột có code (§4.5): thẻ mỗi trường, nhãn theo form, "Gộp cả hai", mục "Đã gộp tự động"; xoá vs sửa khoá Áp dụng tới TV3-08; phiếu `conflict` mở ra chỉ đọc; bộ lọc trạng thái và số "Cần xử lý" (§4.8), phiếu đã xoá mà đang xung đột vẫn hiện; C7 có E2E (§10.1) |
| 0.5.22 | 2026-10-17 | TV1-13: hộp xác nhận xoá phiếu là hộp trong app (`ConfirmDialog`), O7 kiểm câu chữ, Huỷ và Esc (§10.1). Ẩn nút xoá với surveyor theo người tạo chưa có code (thiếu `createdBy`, §6.2) |
| 0.5.23 | 2026-10-17 | TV1-11: O2, O4 có E2E (`offline-install.spec.ts`); T6, T10 có E2E (`projects.spec.ts`) (§10.1) |
| 0.5.24 | 2026-10-17 | TV1-17 phần 1: `ServerRecord.createdBy`, `createdByName`, `updatedByName` và `RecordHistoryEntry.updatedByName` có code (§6.2): server ghép tên lúc đọc ở pull, PUT, 409, history; không tìm thấy tài khoản thì tên rỗng. Client chưa dùng (phần 2) |
| 0.5.25 | 2026-10-17 | TV1-17 phần 2: client lưu `createdBy`, `createdByName` theo phiếu, màn hình xung đột hiện tên người sửa (§6.2); surveyor không thấy "Xoá phiếu" ở phiếu người khác tạo (§5.7) |
| 0.5.26 | 2026-10-17 | Sửa vòng đồng bộ (§5.3): gọi `syncNow()` lúc đang có vòng chạy thì chạy thêm đúng một vòng sau đó, thay cho gộp vào vòng đang chạy (phiếu lưu lúc vòng đã qua bước push phải chờ tới 30 s); bỏ `syncAfterChange` |
| 0.5.27 | 2026-10-18 | TV3-08: hộp thoại xoá vs sửa có code (§4.5): khung hai lựa chọn ngay trong màn hình xung đột, không chọn sẵn; chỉ hỏi giữ hay xoá, không kèm thẻ từng trường; "Bỏ" cũng gửi op xoá; C4, C5 có E2E (§10.1) |
| 0.5.28 | 2026-10-18 | TV3-09: export có code (§4.6, §7): thêm cột `updatedByName`; chống CSV injection chỉ với ô chữ (số giữ nguyên), thêm tab và CR; `format` mặc định `csv`, lạ thì `400`, form không có thì `404`; route cũ `/api/export` bỏ; nút "Xuất CSV"/"Xuất JSON" ở trang chủ; A3 phần export có test (§10.1) |
| 0.5.29 | 2026-10-18 | TV2-15: migration 5 `project_requests` có code (§6.1). `/directory`, `/project-requests`, `/admin/project-requests`, `PUT /admin/projects/:projectId/owners/:username` có code (§7): duyệt tạo tổ chức và Owner trong một transaction, giới hạn 3 tổ chức kiểm lại lúc duyệt, `?status=` mặc định `pending`, huỷ chỉ đổi trạng thái. `GET /admin/projects` thêm `ownerUsernames`, `memberCount`; `PATCH` chỉ còn `{ archived }`; **bỏ** `POST /admin/projects`, `PUT …/members/:userId` và mã `project_exists` (§7.1). Kiểu `DirectoryEntry`, `ProjectRequest`, `AdminProjectRequest`, `CreateProjectRequestBody`, `DecideProjectRequest` và luật thân request ở `shared/` (§6.2). Route kiểm thử `PUT /api/__test/projects/:projectId` thay `POST /admin/projects` cho E2E (§10.1). Q1–Q7, D1, D2 (vế D1), A8 có test, T4 viết lại (§10.1) |
| 0.5.30 | 2026-10-18 | TV2-16: client đăng nhập bằng phiên có code (§4.2, §4.7): `register`, `login`, `logoutSession`, `fetchMeWithToken` ở `api.ts`; `signIn.ts` biết người dùng là ai rồi mới lưu token, trong Web Lock `field-survey-sync` (tài khoản admin → `AdminAccountError`, cùng người → thay token, khác người mà máy trống → xoá dữ liệu người cũ, khác người mà còn dữ liệu chưa gửi → từ chối, không xoá gì); phiên bị từ chối được huỷ trên server; màn hình nhập mã kiểm mã trước khi lưu ("Mã không đúng"); vòng đồng bộ bỏ token admin đã lưu từ trước; Đăng xuất gọi `POST /auth/logout` khi online. Q11 có E2E (§10.1) |
| 0.5.32 | 2026-10-18 | TV2-11: đo hiệu năng pull có code (§11.2, [perf.md](perf.md)): pull lần đầu 5.000 phiếu 2,3 s, danh sách 2.000 phiếu 123 ms, đổi dự án 128 ms (CPU ×4: 9,1 s / 498 ms / 316 ms), đều đạt; `EXPLAIN QUERY PLAN` của pull đi theo index có test; bộ đo `npm run test:perf` chạy riêng; lệnh `seed:perf` (§12) và route kiểm thử `POST /api/__test/seed-perf` (§10.1). Số 0.5.31 dành cho TV2-17 |

## Mục lục

1. Mục tiêu và phạm vi
2. Người dùng và kịch bản chính
3. Kiến trúc tổng quan
4. Thành phần
5. Đồng bộ
6. Mô hình dữ liệu
7. REST API
8. Xử lý lỗi
9. Bảo mật và quyền riêng tư
10. Kiểm thử
11. Yêu cầu phi chức năng
12. Triển khai
13. Rủi ro và hạn chế
14. Câu hỏi mở
15. Thuật ngữ

---

## 1. Mục tiêu và phạm vi

**Mục tiêu:** một hệ thống dùng chung cho **nhiều nhóm thuộc các tổ chức khác nhau** (y tế, nông nghiệp, giáo dục, ...). Mỗi nhóm tự tạo form cho lĩnh vực của mình; điều tra viên thu thập phiếu ở nơi không có mạng, dữ liệu tự đồng bộ khi có kết nối, và khi hai nơi cùng sửa một phiếu thì hệ thống giải thích rõ chuyện gì xảy ra để người dùng tự quyết. Dữ liệu của các nhóm tách biệt hoàn toàn (ADR 0002).

**Trong phạm vi (MVP)**

| Nhóm chức năng | Nội dung |
|---|---|
| Dự án và thành viên | Mỗi nhóm là một dự án (tổ chức) có form, phiếu, ảnh và thành viên riêng. Một người thuộc được nhiều dự án với vai trò khác nhau; đổi dự án ngay trong app, kể cả khi offline. |
| Tài khoản và tổ chức 🆕 | Tự tạo tài khoản (tên + mật khẩu); gửi yêu cầu mở tổ chức, admin duyệt, người gửi thành Owner; tổ chức công khai hiện tên trong danh sách; trang quản trị riêng cho admin (ADR 0003). |
| Form builder | Tạo/sửa form với 7 loại trường: text, number, select, multiselect, date, photo, gps. Form có phiên bản, thuộc một dự án. |
| Offline storage | Form, phiếu, ảnh, hàng đợi đồng bộ trong IndexedDB (Dexie). App shell được service worker precache. |
| Sync queue | Outbox bền vững, retry với exponential backoff, idempotency key. |
| Attachments | Nén ảnh ở client, upload theo chunk, tiếp tục khi mất mạng giữa chừng. |
| Conflict UI | Merge theo trường, hiển thị ai sửa, lúc nào, giá trị gốc/của bạn/trên máy chủ. |
| Export | CSV (UTF-8 có BOM) và JSON theo từng dự án; ảnh xuất dạng URL. |

**Ngoài phạm vi:** đăng nhập SSO, email (xác nhận tài khoản, quên mật khẩu, mời qua email), xin tham gia tổ chức trong app, tìm kiếm và mô tả tổ chức, tổ chức nhiều cấp, phân quyền chi tiết hơn các vai trò ở §2, logic điều kiện trong form, nhóm lặp (danh sách dòng trong phiếu), báo cáo/biểu đồ, cộng tác thời gian thực, ứng dụng native, nhiều tài khoản trên một máy, builder kéo thả (dùng nút lên/xuống), so sánh ảnh trong màn hình xung đột, xoá hoặc ngừng dùng form (form cũ vẫn hiện trong danh sách).

**Tiêu chí thành công (dùng để demo tuần 8)**
- Hai dự án mẫu (`demo-yte`, `demo-nongnghiep`) với form khác nhau; một người là điều tra viên ở dự án này và giám sát viên ở dự án kia, đổi qua lại khi offline, không thấy lẫn dữ liệu.
- Trên điện thoại thật qua HTTPS: tắt mạng hoàn toàn, mở app từ màn hình chính, tạo 10 phiếu có ảnh và GPS; bật mạng, tất cả phiếu **và ảnh** lên server, không trùng.
- Hai máy cùng sửa một phiếu khi offline: khác trường thì tự gộp; cùng trường thì hiện màn hình conflict dễ hiểu.
- Server lỗi 500 / timeout / mất mạng giữa lúc upload: dữ liệu vẫn lên đủ, đúng một lần.
- Đạt các chỉ tiêu hiệu năng ở §11 trên bộ dữ liệu mẫu 2.000 phiếu.

## 2. Người dùng và kịch bản chính

**🆕 Bản mới (ADR 0003, chưa có code)**

| Vai trò | Là ai | Phạm vi | Nhu cầu / quyền |
|---|---|---|---|
| **Điều tra viên** (`surveyor`; dùng điện thoại, thường offline) | Người đi thu thập | Theo tổ chức | Nhập nhanh, không mất dữ liệu, biết phiếu nào đã lên server; chỉ thấy phiếu mình tạo |
| **Giám sát viên** (`supervisor`; thường online, máy tính hoặc điện thoại) | Người giám sát của khách hàng | Theo tổ chức | Sửa phiếu sai, tạo/sửa form, xuất dữ liệu, thêm/rút điều tra viên |
| **Owner** (`owner`) | Khách hàng, người đứng ra mở tổ chức và **sở hữu dữ liệu** | Theo tổ chức | Mọi quyền của giám sát viên; thêm/đổi/rút giám sát viên và Owner; đổi tên tổ chức, bật/tắt công khai |
| **Admin** (cờ `is_admin`) | Người kiểm soát app (nhóm phát triển) | Toàn hệ thống | Duyệt yêu cầu mở tổ chức, khoá tổ chức/tài khoản vi phạm, hỗ trợ khi mất tài khoản Owner. **Không có quyền xem** form, phiếu, ảnh; không là thành viên tổ chức nào |

Thứ hạng trong tổ chức: `surveyor < supervisor < owner`. Một tài khoản thuộc được nhiều tổ chức với vai trò khác nhau. Surveyor, supervisor, Owner dùng PWA khảo sát; **admin dùng trang quản trị riêng `/admin/`** (§4.9), không đăng nhập được vào PWA.

**Kịch bản (bản mới)**
0. *Mở tổ chức mới:* khách hàng tự tạo tài khoản trên app, gửi yêu cầu mở tổ chức; admin duyệt ở trang quản trị; khách hàng thành Owner, thêm giám sát viên và điều tra viên bằng tên đăng nhập của họ (họ cũng tự tạo tài khoản).
1. *Chuẩn bị:* giám sát viên tạo form. Điều tra viên đăng nhập bằng tên + mật khẩu, mở app khi có Wi-Fi, app tải danh sách tổ chức và form, cài lên màn hình chính.

**🕘 Bản cũ (đang chạy, ADR 0002)**

| Vai trò | Phạm vi | Nhu cầu |
|---|---|---|
| **Điều tra viên** (`surveyor`) | Theo dự án | Như trên |
| **Giám sát viên** (`supervisor`) | Theo dự án | Sửa phiếu sai, tạo/sửa form, xuất dữ liệu, quản lý thành viên dự án |
| **Quản trị** (`admin`) | Toàn hệ thống | Tạo dự án cho nhóm mới, chỉ định giám sát viên đầu tiên; không tự động đọc dữ liệu dự án |

Mọi vai trò dùng chính PWA này. Kịch bản 0 cũ: quản trị tạo người dùng bằng CLI và gửi mã đăng nhập (token); tạo dự án, chỉ định giám sát viên. Kịch bản 1 cũ: điều tra viên nhập mã đăng nhập.

**Kịch bản (chung cho hai bản)**
2. *Thực địa:* mất mạng; điều tra viên tạo phiếu, chụp ảnh, lấy GPS. Mỗi phiếu hiện nhãn "Chờ đồng bộ" (hoặc "Nháp" nếu thiếu trường bắt buộc).
3. *Về vùng có mạng:* app tự đồng bộ; nhãn đổi thành "Đã đồng bộ" khi cả phiếu và ảnh đã lên. Nếu giám sát viên đã sửa cùng phiếu, phiếu hiện "Cần xử lý xung đột".
4. *Xử lý xung đột:* màn hình liệt kê trường bị sửa ở cả hai nơi, người sửa và thời điểm; điều tra viên chọn giá trị giữ lại.
5. *Tổng hợp:* giám sát viên xuất CSV.

## 3. Kiến trúc tổng quan

```mermaid
flowchart LR
  subgraph Browser["Trình duyệt (PWA)"]
    UI["React UI<br/>Form renderer, danh sách, conflict"]
    DB[("IndexedDB (Dexie)<br/>field-survey-account<br/>+ mỗi dự án một CSDL:<br/>forms, records, outbox,<br/>conflicts, attachments, meta")]
    SE["Sync engine<br/>theo từng dự án:<br/>push outbox, upload ảnh, pull, merge"]
    SW["Service worker (Workbox)<br/>precache app shell"]
    UI <--> DB
    SE <--> DB
  end
  SE -- "REST /api (JSON, Idempotency-Key, Bearer token)" --> API["Express API"]
  API --> SQL[("SQLite<br/>projects, users, memberships,<br/>forms, records, record_history,<br/>idempotency, attachments")]
  API --> FS[("Thư mục uploads/")]
  SW -. "cache /index.html, JS, CSS" .- UI
  ADM["🆕 Trang quản trị /admin/<br/>(online, không IndexedDB, không SW)"] -- "REST /api/admin, /api/auth" --> API
```

**Nguyên tắc**
- **Local-first:** UI chỉ đọc/ghi IndexedDB, không bao giờ chờ mạng. Mạng là việc của sync engine chạy nền.
- **Một nguồn sự thật cho mỗi việc:** server quyết định thứ tự phiên bản; client giữ dữ liệu người dùng cho tới khi server xác nhận.
- **Cách ly theo dự án:** server lấy `projectId` chỉ từ đường dẫn đã qua kiểm tra thành viên; client mở riêng một CSDL cho mỗi dự án (ADR 0002).
- **Code dùng chung** (`shared/`): kiểu dữ liệu, thuật toán merge, backoff, để client và server không lệch nhau.

**Cấu trúc mã nguồn**

```
field-survey-pwa/
  shared/   kiểu dữ liệu, threeWayMerge, nextRetryDelay, validate form/phiếu (+ unit test)
  server/   Express + node:sqlite
            src/db.ts (migration), src/auth.ts (token, requireMember),
            src/repo/ (truy cập dữ liệu theo ctx), src/routes/ (me, admin, members, forms,
            records, attachments, export, faults), src/cli/ (user:*, seed:*); test/
  client/   React + Vite + Dexie + vite-plugin-pwa
            src/db (accountDb, projectDb), src/sync (api, engine, outbox, attachments),
            src/pages, src/components, src/media; e2e/
            🆕 admin/index.html + src/admin/ (trang quản trị, không dùng Dexie/sync)
  docs/     design.md, ui.md, team-plan.md, vibe-coding.md, adr/, plan/, deploy.md, worklog/
```

Chưa có: `src/media/`, `src/sync/attachments.ts`, `routes/members.ts`, và mọi thứ đánh dấu 🆕.

## 4. Thành phần

### 4.1 Form builder và schema

Form là JSON (`FormSchema` trong `shared/src/types.ts`):

```json
{
  "id": "household-survey",
  "version": 1,
  "title": "Khảo sát hộ gia đình",
  "fields": [
    { "id": "householdName", "type": "text", "label": "Tên chủ hộ", "required": true },
    { "id": "waterSource", "type": "select", "label": "Nguồn nước", "options": ["Máy", "Giếng"] },
    { "id": "oldField", "type": "text", "label": "Trường cũ", "hidden": true }
  ]
}
```

- **Phiên bản hoá:** mỗi lần lưu form, server tạo dòng mới `(id, version+1)`, không sửa bản cũ. Bản ghi lưu `formVersion` và luôn hiển thị bằng đúng phiên bản đó.
- **Quy tắc đổi form an toàn:** được thêm trường, đổi nhãn, thêm option. Không đổi `id` hay `type` của trường đã có (tạo trường mới thay vì sửa). Không xoá trường khỏi mảng `fields`; muốn bỏ thì đặt `hidden: true` (`FieldDef.hidden`). Trường ẩn không hiện khi tạo phiếu mới nhưng vẫn có cột khi export. Phiếu đã có giá trị ở trường ẩn (của chính `formVersion` của phiếu) thì trường vẫn hiện, chỉ đọc, nhãn kèm "(đã ẩn)", để không giấu dữ liệu đã nhập; lưu lại phiếu vẫn giữ giá trị đó. Giá trị đó sai định dạng (phiếu thành nháp và báo lỗi ở trường này) thì trường mở cho sửa, để phiếu không kẹt ở nháp (có code, `client/src/formDisplay.ts`).
- **Form thuộc một dự án;** `id` form chỉ cần duy nhất trong dự án. Muốn dùng lại form của dự án khác: xuất form ra JSON rồi nhập vào (nút "Xuất form"/"Nhập form" trong builder). Có code (`client/src/formFile.ts`):
  - **Xuất form** (khi sửa form đã lưu): tải file `<id>-v<version>.json` chứa `FormSchema` của bản mới nhất trên máy, không gồm phần đang sửa chưa lưu. Chạy được khi offline.
  - **Nhập form** (ở "Biểu mẫu mới"): đọc file bằng cùng hàm kiểm kiểu với thân `POST P/forms` (`parseSaveFormRequest` trong `shared/`, `version` trong file bị bỏ qua) rồi `validateFormSchema` như form mới. Lỗi: "File không phải JSON", "File không đúng định dạng biểu mẫu" hoặc lỗi luật lưu form; builder giữ nguyên. Hợp lệ thì **nạp vào builder** thành form mới chưa lưu (mã form, mã trường sửa được, trường xoá được); người dùng xem, sửa rồi bấm "Lưu bản mới" như form tạo tay.
  - **Mã form trùng:** form mới (tạo tay hoặc nhập) có mã trùng form đã có trên máy trong dự án thì builder báo "Mã biểu mẫu đã có trong dự án" và không gửi; đổi mã rồi lưu. Không lưu thành bản mới của form cũ.
- **Validate ở server khi lưu form** (`POST /api/projects/:projectId/forms`, trả `400 invalid_form` kèm danh sách lỗi):
  - `id` trường duy nhất và khớp `^[a-zA-Z][a-zA-Z0-9_]*$` (là tên cột khi export); `id` form khớp `^[a-zA-Z][a-zA-Z0-9_-]*$` (thêm `-`, vd. `household-survey`), `title` không để trống.
  - select/multiselect phải có ít nhất 1 option, option không trùng, không để trống. `options` ở trường loại khác thì bỏ qua.
  - So với phiên bản trước: mọi trường cũ vẫn còn (có thể `hidden`), không đổi `type`, không bỏ option (option bỏ đi thì giữ lại, dữ liệu cũ vẫn hiển thị được).
- **Builder UI:** danh sách trường có nút lên/xuống để đổi thứ tự (không làm kéo thả), panel thuộc tính cho trường đang chọn, nút xem trước dùng chính `FormRenderer`. Có code (`client/src/pages/BuilderPage.tsx`, hàm thuần ở `client/src/builder.ts`), chỉ hiện với `supervisor` (🆕 và `owner`):
  - **Mã** form và trường gợi ý từ tiêu đề/nhãn (bỏ dấu, camelCase, "Tên chủ hộ" → `tenChuHo`), sửa được tới khi lưu lần đầu, sau đó khoá.
  - Trường **chưa lưu** lần nào có nút "Xoá trường"; trường đã lưu chỉ có "Ẩn".
  - **Lựa chọn** của select/multiselect nhập trong ô văn bản, mỗi dòng một lựa chọn.
  - **Xem trước** chỉ để nhìn, mọi ô nhập bị khoá (để trường ảnh không ghi ảnh rác vào máy).
  - **Lưu bản mới:** kiểm trước ở máy bằng `validateFormSchema` (so với bản mới nhất trên máy) cộng luật riêng của builder "trường phải có nhãn"; lỗi thì không gửi. Offline: "Cần kết nối để lưu form". Lưu được thì ghi form server trả về vào IndexedDB và về trang chủ (thấy form ngay; máy khác thấy sau vòng đồng bộ).
- **Validate phiếu:** chạy ở client khi bấm Lưu (required, kiểu số, định dạng ngày). Phiếu không hợp lệ vẫn lưu được, ở trạng thái **nháp** (`draft`, xem §5.1): không tạo op trong outbox, không đồng bộ, hiện nhãn "Nháp" và danh sách lỗi khi mở lại. Lần lưu hợp lệ tiếp theo chuyển sang `pending` và tạo op.
- **Luật validate theo loại trường** (`validateRecord` trong `shared/`, chạy được cả ở server nếu cần). Trường `hidden` bỏ qua khi kiểm tra `required`.

  | Loại | Giá trị | "Có giá trị" (cho `required`) | Lỗi định dạng |
  |---|---|---|---|
  | `text` | `string` | sau khi bỏ khoảng trắng hai đầu còn ít nhất 1 ký tự | – |
  | `number` | `number` | khác `null` | không phải số hữu hạn (`NaN`, `Infinity`) |
  | `select` | `string` | khác `null` và `""` | không nằm trong `options` của đúng `formVersion` |
  | `multiselect` | `string[]` | mảng có ít nhất 1 phần tử | có phần tử không nằm trong `options` |
  | `date` | `string` `YYYY-MM-DD` | khác `null` và `""` | sai định dạng hoặc ngày không tồn tại (vd. `2026-02-30`) |
  | `gps` | `GpsValue` | khác `null` | `lat` ngoài `[-90, 90]` hoặc `lng` ngoài `[-180, 180]` |
  | `photo` | `string[]` (id ảnh) | mảng có ít nhất 1 id | – |

  Với `photo` bắt buộc: chỉ cần ảnh đã lưu trên máy là hợp lệ; ảnh chưa upload xong **không** làm phiếu thành nháp (việc upload là của §5.6). Option bị bỏ khỏi form ở phiên bản mới không làm phiếu cũ thành lỗi, vì phiếu luôn validate theo `formVersion` của chính nó.
- Phiếu đã từng lên server mà bị sửa thành không hợp lệ cũng thành `draft`: bản trên server giữ nguyên, thay đổi cục bộ được giữ và không bị pull ghi đè (ADR quy tắc 8).

**Tiêu chí chấp nhận**
- Giám sát viên tạo form 7 loại trường, lưu, điều tra viên thấy form sau lần đồng bộ kế tiếp.
- Sửa form (thêm trường, ẩn trường) tạo version mới; phiếu cũ vẫn mở bằng version cũ.
- Server từ chối form đổi `type` trường cũ hoặc thiếu trường cũ, trả `400 invalid_form`.
- Phiếu thiếu trường bắt buộc lưu được dạng nháp, không lên server.

### 4.2 Lưu trữ offline (IndexedDB)

Dexie, định nghĩa trong `client/src/db/accountDb.ts` và `client/src/db/projectDb.ts`; mở CSDL của dự án đang chọn qua `client/src/db/current.ts` (`openProjectDb`, `useCurrentProjectDb`, `setCurrentProject`). Theo ADR 0002 có hai loại CSDL:

**`field-survey-account`** (một CSDL cho cả thiết bị)

| Bảng | Khoá | Nội dung |
|---|---|---|
| `account` | `key` | `token`; `user` = `{ id, name, isAdmin }` (bản sao `MeResponse.user`, ghi sau mỗi lần gọi `/me`); `currentProjectId` (dự án đang chọn). Token là token **phiên** của máy này (ADR 0003 §1); `user` có thêm `username`; tài khoản `isAdmin` không được lưu (bị chặn khi đăng nhập, §4.9). Có code (TV2-16): token chỉ được ghi sau khi `client/src/signIn.ts` kiểm xong người dùng, ghi `user` trước rồi `token` sau cùng |
| `projects` | `id` | Bản sao `GET /api/me`: tên dự án, vai trò, trạng thái (`active` / `removed`), số phiếu cần xử lý (`needsAttention`: `conflict` + `error`) và chưa đồng bộ (`unsynced`: `pending` + `draft`), cập nhật sau mỗi vòng đồng bộ |

**`field-survey-p-<projectId>`** (mỗi dự án một CSDL, cùng schema)

| Bảng | Khoá / index | Nội dung |
|---|---|---|
| `forms` | `key` = `id@version`, index `id` | Mọi phiên bản form đã tải |
| `records` | `id`, index `formId`, `syncState`, `updatedAt` | `data`, `deleted`, `baseData`, `baseVersion`, `syncState`, `validationErrors` |
| `outbox` | `++seq`, unique `opId`, index `recordId`, `nextAttemptAt` | Thao tác chờ gửi (§5.2) |
| `conflicts` | `recordId` | Bản server, lịch sử, kết quả merge chờ người dùng |
| `attachments` | `id`, index `recordId`, `uploadState`, `nextAttemptAt` | Blob ảnh, chunk đã upload, trạng thái retry (§5.6) |
| `meta` | `key` | `pull: { cursor, scope }` (§5.5), ... |

- **Dự án đang chọn:** lưu trong `account` (`currentProjectId`). Chưa chọn lần nào, hoặc dự án đã chọn không còn active (đã rời), thì dùng dự án active đầu tiên trong `projects` (thứ tự `/me`); không có dự án active nào thì không mở CSDL dự án nào (`client/src/projects.ts`, `resolveCurrentProjectId`).
- **Đổi dự án:** UI đóng CSDL cũ, mở CSDL của dự án mới; mọi `liveQuery` chỉ chạy trên CSDL đang mở, nên không thể hiển thị lẫn dữ liệu hai dự án.
- **Rút khỏi dự án:** xoá cả CSDL bằng `Dexie.delete`, chỉ khi không còn dữ liệu chưa gửi (ADR 0002 §6).

- **ID phía client:** `crypto.randomUUID()` cho phiếu và ảnh, nên tạo được khi offline và không đụng nhau.
- **Ghi nguyên tử:** lưu phiếu và thêm op vào outbox trong cùng một transaction Dexie (`saveRecordLocally`), không bao giờ có phiếu đã sửa mà thiếu op (trừ phiếu nháp, vốn không có op).
- **Nâng cấp schema:** thêm `this.version(n+1).stores(...).upgrade(...)`, không sửa version cũ. Mọi CSDL dự án dùng chung một lớp `ProjectDb` nên được nâng cấp giống nhau khi mở. CSDL `field-survey` của khung hiện tại không chuyển dữ liệu sang (chưa có người dùng thật), chỉ xoá.
- **Chống bị xoá dữ liệu:** gọi `navigator.storage.persist()` sau lần lưu phiếu đầu tiên, kể cả phiếu nháp (`client/src/persistStorage.ts`: gọi sau mỗi lần lưu nhưng bỏ qua khi `persisted()` đã là `true`, nên trình duyệt từ chối thì lần lưu sau xin lại; không có API thì bỏ qua); hiển thị dung lượng đã dùng qua `navigator.storage.estimate()` ở trang Cài đặt.

### 4.3 Service worker và cài đặt PWA

- `vite-plugin-pwa` chế độ `generateSW`.
- **Precache** toàn bộ app shell (HTML, JS, CSS, icon). Điều hướng bất kỳ (trừ `/api/`) trả `index.html` khi offline.
- **Runtime cache** `GET /api/projects/*/forms` và `GET /api/me` theo NetworkFirst (timeout 3s). Dữ liệu phiếu **không** cache qua SW vì nguồn là IndexedDB.
- **Không đụng tới trang quản trị:** `/admin/` nằm trong `navigateFallbackDenylist` (đã có code) và không có trong precache (TV1-16 lo khi thêm `admin/index.html`), để trang quản trị luôn lấy bản mới từ server và không chạy offline (§4.9).
- **Cập nhật phiên bản app:** dùng `registerType: 'prompt'`: khi có SW mới, hiện dải "Có phiên bản mới" với nút [Tải lại] (`client/src/components/UpdatePrompt.tsx`); không tự reload. Đang ở trang nhập phiếu thì hỏi "Phiếu đang nhập chưa lưu sẽ mất. Tải lại?" trước. Trình duyệt kiểm bản mới khi mở trang; app kiểm thêm mỗi 60 phút vì app đã cài thường mở cả ngày.
- **Lần cài đầu:** `clientsClaim` để SW nắm luôn trang đang mở (rời mạng ngay sau lần mở đầu vẫn tải lại được). Không có `skipWaiting`, nên bản cập nhật vẫn chờ người dùng bấm Tải lại. Lần deploy đầu tiên sau khi đổi từ `autoUpdate` thì SW cũ vẫn tự thay như trước.
- **Đồng bộ nền:** sync engine chạy trong trang (§5.3). Background Sync API chỉ có trên Chromium nên là tuỳ chọn nâng cao, không phải yêu cầu.
- **Hướng dẫn cài:** trang Cài đặt có mục "Cài lên màn hình chính" cho Android (Chrome) và iPhone (Safari); app đang chạy ở chế độ đã cài (`display-mode: standalone` hoặc `navigator.standalone` trên iOS) thì chỉ ghi "Đã cài lên màn hình chính." (ui.md màn hình 8).
- **Manifest:** tên "Khảo sát thực địa", `display: standalone`, icon SVG và icon PNG 192/512 (cần cho Android cũ và iOS); PNG 512 dùng thêm làm `maskable`. iOS không đọc icon trong manifest nên `index.html` có `apple-touch-icon` 180×180. PNG nền vuông kín (hệ điều hành tự bo góc), sinh từ `icon.svg` bằng `client/scripts/make-icons.mjs`.

### 4.4 Attachments (ảnh)

**Ở client**
1. Chọn/chụp ảnh qua `<input type="file" accept="image/*" capture="environment">`.
2. **Nén** bằng canvas: cạnh dài tối đa 1600px, JPEG chất lượng 0.8 (ảnh 4–6 MB còn khoảng 300–500 KB). Bỏ EXIF trừ hướng xoay. Ảnh nhiều chi tiết vượt 600 KB thì nén lại ở 0.7, rồi 0.6; vẫn vượt thì vẫn lưu (không làm mất ảnh). Ảnh nhỏ vẫn đi qua canvas để bỏ EXIF.
3. Lưu Blob vào bảng `attachments`; giá trị trường photo là danh sách `attachmentId`.

**Upload theo chunk (resumable)**
- Mọi đường dẫn dưới đây có tiền tố `/api/projects/:projectId` (§7); ảnh thuộc dự án của phiếu chứa nó.
- Chunk 256 KB. Trước khi upload, `GET .../attachments/:id/status` để biết chunk nào server đã có, chỉ gửi phần thiếu.
- `PUT .../attachments/:id/chunks/:index` idempotent: gửi lại chunk đã có thì server trả 200, không ghi lại.
- Sau chunk cuối: `POST .../attachments/:id/complete { recordId, totalChunks, mimeType, sha256 }`; server ghép file, kiểm tra SHA-256 và magic bytes, trả `409 missing_chunks` nếu thiếu chunk, `422 checksum_mismatch` nếu sai hash.
- Thứ tự với bản ghi và cách retry: xem §5.6.
- Ảnh đã upload xong được giữ lại ở client cho tới khi người dùng dọn bộ nhớ, để xem offline.

### 4.5 Conflict UI

Khi sync engine nhận `409` và merge còn xung đột trường hoặc xung đột xoá/sửa, phiếu chuyển `conflict` và một dòng `conflicts` được lưu với: bản server, lịch sử các phiên bản sau `baseVersion`, kết quả merge.

**Màn hình xung đột** (`client/src/pages/ConflictPage.tsx`):
- Câu giải thích bằng ngôn ngữ thường: *"Trong lúc bạn ngoại tuyến, **Lan** đã sửa phiếu này (lần cuối 14:32 07/10). 2 trường đã được gộp tự động. Các trường dưới đây cả hai bên cùng sửa, hãy chọn giá trị giữ lại."*
- **Mỗi trường một thẻ** (ui.md màn hình 3, không dùng bảng 4 cột vì không vừa điện thoại): tên trường (nhãn trong form đúng `formVersion` của phiếu; form chưa có trên máy thì dùng `id`), giá trị trước đó, của bạn, trên máy chủ; mỗi thẻ chọn một bên, không chọn sẵn. Nút "Áp dụng và đồng bộ" khoá tới khi chọn hết. Logic thuần ở `client/src/conflictView.ts`.
- Mục "Đã gộp tự động" thu gọn, mở ra thấy trường nào lấy từ đâu.
- **Xoá vs sửa:** hộp thoại riêng: "Bạn đã xoá phiếu này nhưng Lan vừa sửa nó. Giữ phiếu (với bản của Lan) hay vẫn xoá?" (và chiều ngược lại: "Lan đã xoá phiếu này nhưng bạn vừa sửa. Khôi phục với bản của bạn hay bỏ?"). Nút "Áp dụng" bị khoá cho tới khi người dùng trả lời câu này; không bao giờ mặc định chọn hộ.
- Multiselect và photo có thêm lựa chọn "Gộp cả hai" (hợp hai tập). Ảnh chỉ hiện số lượng mỗi bên ("3 ảnh" / "2 ảnh"); xem thumbnail so sánh để sau MVP.
- Sau khi áp dụng: dữ liệu đã chọn thành op mới với `baseVersion` = version server đã thấy, đẩy ngay. Nếu lại nhận `409` (server đổi tiếp trong lúc người dùng đang chọn), đi lại đúng quy trình ADR quy tắc 5 với base = bản server đã thấy: khác trường thì tự gộp, cùng trường thì hiện màn hình conflict mới.
- **Trong lúc phiếu đang `conflict`, không sửa được phiếu** (ADR quy tắc 7): mở phiếu thì ở chế độ chỉ đọc (mọi ô nhập và nút chọn ảnh bị khoá, không có Lưu và Xoá) với banner "Phiếu này cần xử lý xung đột trước" và link "Xử lý" tới màn hình xung đột. `saveRecordLocally` vẫn từ chối phiếu `conflict` (cả lưu lẫn xoá) cho trường hợp phiếu vừa thành `conflict` đúng lúc bấm Lưu; phần đang nhập vẫn trên màn hình. Phiếu có thể thành `conflict` ngay lúc form đang mở vì đồng bộ chạy nền: trang tự chuyển sang chỉ đọc.
- **Xoá vs sửa có code (TV3-08):** câu hỏi và hai lựa chọn hiện ngay trong màn hình xung đột (`DeleteConflictDialog`, không phải hộp modal: modal có nút Huỷ sẽ cho thoát ra mà chưa trả lời), dùng tên người sửa/xoá trên máy chủ. Câu hỏi đã nói rõ giữ bản nào nên không hiện thẻ từng trường. Kết quả: "Giữ phiếu (với bản của Lan)" → bản máy chủ, `deleted: false`; "Vẫn xoá" → `deleted: true` với bản máy chủ mới nhất; "Khôi phục với bản của bạn" → bản trên máy, `deleted: false`; "Bỏ" → `deleted: true`, cũng gửi op xoá như mọi lựa chọn (máy chủ thêm một version vẫn đã xoá; máy dọn phiếu và ảnh khi được xác nhận, §5.7).
- Danh sách phiếu có bộ lọc "Cần xử lý" và số đếm trên đầu trang.

**Tiêu chí chấp nhận:** đủ các ca C1–C8 ở §10.1.

### 4.6 Export

`GET /api/projects/:projectId/export/:formId?format=csv|json&includeDeleted=0` (chỉ `supervisor` của dự án; 🆕 `owner` cũng gọi được vì `requireMember('supervisor')` xét theo thứ hạng)

- **CSV:** cột cố định `id, version, updatedAt, updatedBy, updatedByName, formVersion, deleted` (`updatedBy` là `userId`, `updatedByName` là tên để người đọc Excel dễ hiểu; rỗng nếu server không có tên) rồi một cột mỗi trường của phiên bản form mới nhất, theo thứ tự trong form (kể cả trường `hidden`; trường chỉ có ở phiên bản cũ thêm vào cuối). Multiselect nối bằng `"; "`, gps tách `<field>_lat`, `<field>_lng`, `<field>_accuracy`, photo là các URL tuyệt đối nối bằng `"; "` (gốc lấy từ `PUBLIC_BASE_URL`). Mở đầu bằng BOM UTF-8 để Excel đọc đúng tiếng Việt. Escape theo RFC 4180. Ô **chữ** bắt đầu bằng `= + - @` (thêm tab, CR theo OWASP) được thêm tiền tố `'` để tránh CSV injection; giá trị của trường số giữ nguyên (kể cả số âm) để Excel còn tính được. Dòng kết thúc CRLF.
- **JSON:** `{ forms: FormSchema[], records: ServerRecord[] }`, gồm mọi phiên bản form đã dùng.
- **Kèm ảnh:** ngoài phạm vi MVP (ADR 0002 cắt); nếu làm sau thì `format=zip` trả `data.csv` và thư mục `photos/<recordId>/<attachmentId>.jpg`, stream bằng `archiver`.
- Client có nút "Xuất CSV" và "Xuất JSON" cạnh mỗi form ở trang chủ, chỉ supervisor và owner thấy; cần mạng (offline thì nút khoá kèm "Cần kết nối mạng để xuất").
- **Có code (TV3-09):** `server/src/lib/csv.ts`, `server/src/lib/exportTable.ts` (hàm thuần), `server/src/routes/export.ts`. Không truyền `format` thì `csv`; giá trị khác `csv`/`json` → `400 invalid_body`; form không có trong dự án → `404 not_found`. URL ảnh trong CSV là API ảnh nên **cần đăng nhập** mới mở được (không có token thì `401`); bấm từ Excel không xem được ảnh.

**Tiêu chí chấp nhận**
- File CSV mở bằng Excel không lỗi font tiếng Việt; số dòng bằng số phiếu chưa xoá của dự án.
- Phiếu tạo bằng form v1 và v2 cùng nằm trong một file, cột khớp đúng.
- Không bao giờ có phiếu của dự án khác trong file.
- Có unit test cho escape (dấu phẩy, ngoặc kép, xuống dòng, ô bắt đầu bằng `=`).

### 4.7 Dự án (tổ chức), tài khoản và thành viên

Theo ADR 0002, phần tài khoản và vai trò theo ADR 0003.

**Chung cho hai bản**
- **Bộ chọn dự án** ở thanh trên cùng: tên dự án đang chọn, mở ra thấy mọi dự án của mình kèm vai trò và số phiếu cần xử lý / chưa đồng bộ của từng dự án (số lưu sau vòng đồng bộ gần nhất, §4.2). Đổi dự án được khi offline với dự án đã tải; đổi xong về danh sách phiếu của dự án mới. Chỉ có một dự án thì chỉ hiện tên. Có code (`client/src/components/ProjectSwitcher.tsx`).
- **Bị rút khỏi dự án:** dự án hiện mờ trong bộ chọn với nhãn "Đã rời" và **không chọn được**; đang chọn dự án đó thì app chuyển sang dự án active đầu tiên. Còn phiếu chưa gửi thì trang chủ có banner "Bạn không còn thuộc dự án X. N phiếu chưa gửi được" (mỗi dự án một banner, dù đang chọn dự án nào) với nút "Xuất JSON" và "Xoá khỏi máy". N là số phiếu nháp, chờ đồng bộ, lỗi, xung đột, cùng tập với file Xuất JSON. "Xoá khỏi máy" hỏi "Xoá N phiếu chưa gửi của dự án X khỏi máy? Không khôi phục được.", xoá trong Web Lock `field-survey-sync` và không xoá nếu dự án vừa được thêm lại. Tổ chức bị admin khoá cũng đi luồng này. Có code (`client/src/components/RemovedProjectBanners.tsx`).

**🆕 Bản mới (ADR 0003, chưa có code)**
- **Tài khoản:** màn hình đầu có hai tab "Đăng nhập" / "Tạo tài khoản" (cần mạng). Tạo tài khoản: tên đăng nhập (`^[a-z0-9._]{3,32}$`, không đổi được), tên hiển thị, mật khẩu (8–128 ký tự), nhập lại mật khẩu; tạo xong là đăng nhập luôn. Sai tên hoặc mật khẩu: "Sai tên đăng nhập hoặc mật khẩu". Mỗi lần đăng nhập server cấp một **phiên** riêng cho máy đó, không tự hết hạn (ADR 0003 §1).
- **Sau khi đăng nhập:** chỉ thuộc một tổ chức thì vào thẳng; nhiều thì vào tổ chức chọn lần trước; **chưa thuộc tổ chức nào thì vào màn hình Tổ chức** (ui.md màn hình 9).
- **Màn hình Tổ chức** (mọi người dùng, cần mạng):
  - Hiện tên đăng nhập của mình kèm hướng dẫn "Gửi tên này cho giám sát viên của tổ chức để được thêm vào".
  - Danh sách **tên** các tổ chức công khai mình chưa thuộc (`GET /api/directory`). Không có nút xin vào.
  - Form "Mở tổ chức mới": tên (1–100 ký tự), ghi chú cho quản trị (tuỳ chọn, ≤ 500 ký tự) → "Gửi yêu cầu". Hiện trạng thái yêu cầu của mình: "Đang chờ duyệt" (nút Huỷ), "Bị từ chối: <lý do>", hoặc đã duyệt (tổ chức xuất hiện trong bộ chọn sau vòng đồng bộ kế tiếp). Tối đa 1 yêu cầu đang chờ và là Owner của tối đa 3 tổ chức.
- **Màn hình Thành viên** (`supervisor`, `owner`; cần mạng):
  - Thêm người **bằng tên đăng nhập** và chọn vai trò. Supervisor chỉ thêm/rút được `surveyor`; Owner thêm, đổi, rút được mọi vai trò. Rút có hỏi xác nhận.
  - Không rút/hạ được Owner cuối cùng (`409 last_owner`). Không thêm được tài khoản admin (`409 admin_account`).
  - Owner có thêm: đổi tên tổ chức, ô "Công khai tên tổ chức" (mặc định tắt).
  - Có code (TV1-08): API `P/members`, `P/settings` (§7), màn hình `client/src/pages/MembersPage.tsx` (ui.md màn hình 6). Tự hạ hoặc tự rút hỏi xác nhận nói rõ mất quyền ngay; xong thì chạy một vòng đồng bộ mới (chờ vòng đang chạy, vì vòng đó có thể đã đọc `/me` cũ) rồi về trang chủ.
- **Admin** không dùng app khảo sát: đăng nhập bằng tài khoản admin thì hiện "Tài khoản quản trị dùng trang /admin" và không tạo CSDL nào. Việc của admin ở trang quản trị (§4.9). Có code (TV2-16): `signIn.ts` ném `AdminAccountError` trước khi lưu token và huỷ phiên vừa cấp; token admin đã lưu từ bản cũ thì vòng đồng bộ thấy `isAdmin` trong `/me`, xoá token và dừng trước khi mở CSDL dự án nào.
- **Nhập tài khoản khác trên máy đang có dữ liệu:** như bản cũ dưới đây, thay "mã" bằng "tên đăng nhập + mật khẩu"; "Cùng người" là đăng nhập lại chính tài khoản đó (phiên mới thay phiên cũ trên máy; phiên cũ không bị thu hồi trên server, ADR 0003 §1). Có code (TV2-16, `client/src/signIn.ts`, quyết định ở hàm thuần `decideSignIn`): chạy trong Web Lock `field-survey-sync`; khác người mà máy trống thì xoá như Đăng xuất (cache runtime, mọi CSDL dự án, `projects`, `user`, `currentProjectId`); bị từ chối thì không lưu token và huỷ phiên vừa cấp. Màn hình tên + mật khẩu chưa có (TV1-14): tới lúc đó màn hình nhập mã đi cùng đường này qua `signInWithToken` (kiểm mã bằng `GET /me`, 401 → "Mã không đúng"). Nút "Xuất JSON" ở thông báo từ chối chưa có (TV1-14); N đếm phiếu nháp, chờ đồng bộ, lỗi, xung đột, N = 0 (chỉ còn ảnh hoặc op) thì câu là "còn dữ liệu chưa gửi".
- **Đăng xuất** như bản cũ, thêm: gọi `POST /api/auth/logout` để huỷ phiên của máy này nếu đang online. Có code (TV2-16, `client/src/logout.ts`): gọi sau khi đã xoá dữ liệu trên máy, trước khi xoá token; lỗi mạng thì vẫn đăng xuất trên máy (phiên còn trên server, admin thu hồi được bằng `user:revoke-sessions`).

**🕘 Bản cũ (đang chạy, ADR 0002)**
- **Lần đầu mở app:** màn hình nhập mã đăng nhập (token do quản trị tạo bằng CLI, §12). Sau đó nếu chỉ thuộc một dự án thì vào thẳng dự án đó; nhiều dự án thì vào dự án đầu tiên theo thứ tự `/me`, lần sau vào dự án đã chọn lần trước; chưa nhận được `/me` lần nào thì hiện "Đang tải danh sách dự án…"; nếu chưa thuộc dự án nào: "Bạn chưa được thêm vào dự án nào. Gửi mã người dùng `<userId>` cho giám sát viên."
- **Màn hình Thành viên** (`supervisor`, cần online): danh sách thành viên và vai trò; thêm bằng `userId`; đổi vai trò; rút khỏi dự án (có hỏi xác nhận). Không cho tự rút giám sát viên cuối cùng. *(Chưa có code; TV1-08 sẽ làm theo bản mới.)*
- **Màn hình Dự án** (`admin`, cần online, trong PWA): tạo dự án, đổi tên, lưu trữ; chỉ định giám sát viên đầu tiên. *(Chưa có code; thay bằng trang quản trị §4.9.)*
- **Tạo người dùng** không có UI: quản trị chạy CLI ở server (§12).
- **Nhập mã của người khác trên máy đang có dữ liệu** (sau `401`, hoặc người dùng tự nhập lại):** sau khi `GET /api/me` trả về, so `user.id` mới với `userId` đang lưu trong `field-survey-account`.
  - Cùng người (đăng nhập lại, hoặc mã mới sau `user:revoke-sessions`): chỉ thay token, giữ nguyên mọi CSDL, đồng bộ tiếp.
  - Khác người và máy **không** còn dữ liệu chưa gửi ở mọi dự án (định nghĩa như `hasUnsentData`, ADR 0002 §6): xoá mọi CSDL dự án của người cũ rồi đăng nhập người mới.
  - Khác người và máy **còn** dữ liệu chưa gửi: từ chối, hiện "Máy này còn N phiếu chưa gửi của <tên người cũ>. Nhập lại mã của người đó để gửi, hoặc xuất JSON trước." kèm nút "Xuất JSON". Không có nút xoá ở bước này. Lý do: phiếu chưa gửi phải lên server dưới tên người tạo (bất biến 6), mà token người mới không gửi hộ được.
- **Đăng xuất** (trang Cài đặt, ui.md màn hình 8) chỉ bật khi không còn dữ liệu chưa gửi ở mọi dự án; đăng xuất xoá token và mọi CSDL dự án. Có hộp xác nhận "Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng." Việc kiểm tra và xoá chạy trong Web Lock `field-survey-sync` (chờ vòng đồng bộ đang chạy xong) và kiểm lại ngay trước khi xoá (`client/src/logout.ts`). Đăng xuất xoá cả cache runtime `me` và `forms` của SW (§4.3; tên ở `client/src/swCaches.ts`) để dữ liệu của người cũ không nằm lại trên máy dùng chung, nhưng giữ precache để app vẫn mở được offline. Có code.

**Tiêu chí chấp nhận:** đủ các ca T1–T10 ở ADR 0002; 🆕 thêm U1–U7, Q1–Q9, Q11, D1–D2, M1–M3, A5–A8 ở ADR 0003 (§10.1).

### 4.8 Danh sách phiếu

Trang chủ của dự án đang chọn. Đọc từ IndexedDB (`liveQuery`), không gọi API.

- **Nhóm theo form**, mỗi form một mục có số phiếu; trong mục, phiếu sắp theo `updatedAt` cục bộ mới nhất trước.
- **Mỗi dòng:** tiêu đề phiếu (giá trị trường `text` đầu tiên không ẩn, rỗng thì "Phiếu chưa có tên"), nhãn trạng thái hiển thị (§5.1, §5.6), giờ sửa cuối. Với `supervisor` thêm tên người tạo (`createdByName`, kèm "(đã rời dự án)" nếu cần).
- **Bộ lọc:** trạng thái ("Tất cả", "Cần xử lý", "Chưa đồng bộ", "Nháp", "Lỗi"); với `supervisor` thêm lọc theo người tạo (cần `createdBy`, §6.2). Ô tìm kiếm theo tiêu đề phiếu. Bộ lọc chạy trên index `syncState` và lọc trong bộ nhớ, đủ cho 2.000 phiếu (§11.2).
  - Có code (TV3-07, `client/src/recordFilter.ts`): lọc theo nhãn hiển thị (§5.6) chứ không theo `syncState` thô. "Cần xử lý" = xung đột, lỗi, lỗi ảnh; "Chưa đồng bộ" = chờ đồng bộ, đang tải ảnh; "Nháp"; "Lỗi" = lỗi, lỗi ảnh. Số "Cần xử lý (n)" đầu danh sách, bấm vào thì bật bộ lọc đó. Lọc theo người tạo và ô tìm kiếm: chưa có code.
- **Phiếu đã xoá** (`deleted`) không hiện trong danh sách mặc định, **trừ khi đang `conflict`** (vd. xoá ở máy này, sửa ở máy kia): người dùng phải thấy để xử lý.
- **Hiệu năng:** 2.000 phiếu phải cuộn mượt; nếu không đạt thì chỉ render phần đang thấy (tự viết, không thêm thư viện nếu chưa hỏi).
- Đầu trang: số "Cần xử lý" (§4.5) và cảnh báo phiếu tồn lâu (§5.2).

### 4.9 Trang quản trị 🆕 (ADR 0003 §8, chưa có code)

Trang riêng cho admin tại `/admin/`, **tách khỏi PWA khảo sát**:
- Cùng origin và cùng API; là trang thứ hai trong bản build Vite của `client/` (`admin/index.html`), dùng chung `shared/`, không thêm thư viện.
- Chỉ chạy online: không service worker, không manifest, không IndexedDB, không sync engine. Token phiên lưu trong `sessionStorage` (đóng tab thì đăng nhập lại).
- Đăng nhập bằng `POST /api/auth/login`; tài khoản không có `is_admin` → "Tài khoản này không phải quản trị", không lưu token.
- Bố cục cho máy tính, vẫn dùng được trên điện thoại.

| Màn hình | Nội dung | Bắt buộc |
|---|---|---|
| A1. Yêu cầu mở tổ chức (mặc định) | Bảng yêu cầu đang chờ: tên tổ chức, ghi chú, người gửi (tên + tên đăng nhập), thời điểm; nút Duyệt, Từ chối (bắt buộc nhập lý do) | Có |
| A2. Tổ chức | Mọi tổ chức: tên, Owner, số thành viên, trạng thái; Khoá/Mở; Đổi Owner (nhập tên đăng nhập) khi khách hàng mất tài khoản Owner | Có |
| A3. Tài khoản | Tìm theo tên đăng nhập; Khoá, Cấp lại mật khẩu (hiện mật khẩu tạm một lần), Thu hồi phiên | **Cắt được**: CLI `user:*` làm thay |

Không màn hình nào hiện form, phiếu, ảnh hay danh sách thành viên chi tiết của tổ chức (dữ liệu thuộc về Owner).

## 5. Đồng bộ

Chi tiết lý do ở [ADR 0001](adr/0001-consistency-model.md). Mã: `client/src/sync/engine.ts`, `client/src/sync/outbox.ts`, `server/src/routes/records.ts`.

### 5.1 Trạng thái phiếu

`syncState` của phiếu: `draft | pending | synced | conflict | error`.

```mermaid
stateDiagram-v2
  [*] --> draft: lưu, chưa hợp lệ
  [*] --> pending: lưu, hợp lệ
  draft --> draft: sửa, vẫn chưa hợp lệ
  draft --> pending: sửa thành hợp lệ (tạo op)
  pending --> synced: push 200/201, không còn op
  pending --> pending: lỗi mạng / 5xx (backoff)
  pending --> pending: người dùng sửa tiếp
  pending --> pending: 409, tự gộp được
  pending --> conflict: 409, có trường xung đột hoặc xoá vs sửa
  pending --> error: 4xx khác (dữ liệu sai)
  synced --> pending: người dùng sửa, hợp lệ
  synced --> draft: người dùng sửa, chưa hợp lệ
  synced --> synced: pull nhận bản mới hơn
  conflict --> pending: người dùng chọn xong
  error --> pending: người dùng bấm "Thử lại" hoặc sửa phiếu
```

- `conflict`: phiếu chỉ đọc cho tới khi giải quyết (§4.5).
- `error`: op ở trạng thái `failed` (lần bị `4xx` tính là một lần gửi, `attempts + 1`). Sửa phiếu thì op `failed` bị bỏ và dữ liệu mới đi trong một op mới với `opId` mới, không dùng lại key cho dữ liệu khác (CLAUDE.md bất biến 3; an toàn vì server không lưu key cho response lỗi). Bấm "Thử lại" thì gửi lại đúng op đó (cùng `opId`, cùng dữ liệu, giữ `attempts`).
- Nhãn hiển thị tách khỏi `syncState`: phiếu `synced` nhưng còn ảnh chưa lên hiện "Đang tải ảnh (n)" (§5.6).

### 5.2 Outbox

Mỗi op: `{ seq, opId, recordId, data, deleted, attempts, nextAttemptAt, status, lastError, createdAt }`. `createdAt` là lúc phiếu bắt đầu có thay đổi chưa lên server (giờ thiết bị, chỉ để hiển thị cảnh báo tồn lâu); giữ nguyên khi gộp hoặc thay op.

| `status` | Ý nghĩa |
|---|---|
| `queued` | Chờ gửi (có thể đang trong thời gian backoff theo `nextAttemptAt`) |
| `failed` | Server trả 4xx không retry được; chờ người dùng sửa hoặc bấm "Thử lại" |

Không còn trạng thái `blocked` (TV2-10): phiếu đang `conflict` không sửa được (§4.5) nên không sinh op mới. Op `blocked` do bản cũ tạo, nếu còn trên máy (chỉ có thể ở staging), vẫn bị bỏ qua khi push như trước và bị xoá khi người dùng giải quyết xung đột; không có migration vì không gộp an toàn được phần sửa sau khi đã xung đột.

- **Gộp op:** sửa phiếu khi op cuối của nó **chưa từng gửi** (`attempts = 0`) thì cập nhật op đó. Nếu op đã gửi ít nhất một lần (có thể server đã ghi nhưng response bị mất) thì giữ nguyên `opId` và thêm op mới phía sau. Nhờ vậy idempotency key không bao giờ bị dùng cho dữ liệu khác.
- **Thứ tự:** FIFO theo `seq`, tuần tự trong từng phiếu: op sau chỉ chạy khi op trước xong. Phiếu khác nhau không chặn nhau.
- `baseVersion` đọc từ phiếu **lúc gửi**, không lưu trong op, vì op trước thành công sẽ nâng `baseVersion`.
- **Op tồn lâu:** op `queued` có `attempts ≥ 5` hiện cảnh báo "Máy chủ đang lỗi, sẽ thử lại"; phiếu có op với `createdAt` từ 24 giờ trở lên (kể cả op `failed`) hiện cảnh báo ở đầu trang "Có n phiếu chưa đồng bộ hơn 1 ngày". Phiếu nháp không có op nên không tính.

### 5.3 Vòng đồng bộ

`syncNow()` được gọi khi: app mở, sự kiện `online`, mỗi 30 giây, sau mỗi lần lưu, khi hết thời gian backoff. Gọi lúc đang có vòng chạy trong cùng tab thì chạy thêm **đúng một** vòng sau khi vòng đó xong (gọi nhiều lần cũng chỉ thêm một), vì vòng đang chạy có thể đã qua bước push hoặc đã đọc `/me` cũ; promise của lần gọi xong khi vòng thêm xong. Vòng lỗi mà đã có yêu cầu chạy thêm thì vẫn chạy vòng thêm (`client/src/sync/coalesce.ts`).

**Nhiều dự án:** đầu mỗi vòng gọi `GET /api/me` để cập nhật danh sách dự án và vai trò (offline thì dùng bản đã lưu), xử lý thay đổi thành viên theo ADR 0002 §6 (hiện mới đánh dấu `removed` cho dự án không còn trong `/me` và ngừng đồng bộ nó; phần còn lại ở TV2-07), rồi chạy các bước dưới cho từng dự án đang `active`, dự án đang chọn trước. Mọi đường dẫn dưới đây đều có tiền tố `/api/projects/:projectId`.

**Nhiều tab:** mỗi vòng đồng bộ (gồm mọi dự án) chạy trong `navigator.locks.request('field-survey-sync', { ifAvailable: true }, ...)`; tab không lấy được khoá thì bỏ qua lần đó. Nhờ vậy chỉ một tab gửi request tại một thời điểm. Trình duyệt chưa có Web Locks thì chạy không khoá; gửi trùng vẫn an toàn nhờ idempotency key (ADR 0001). Tab khác vẫn thấy kết quả ngay vì UI đọc IndexedDB qua `liveQuery`.

1. Offline thì dừng.
2. **Push:** với mỗi op đến hạn, `PUT .../records/:id` kèm `Idempotency-Key: opId`.
   - `200/201`: xoá op; `baseData = data trả về`, `baseVersion = version trả về`; hết op thì `synced`.
   - `409`: gộp mọi op của phiếu, three-way merge (base = `baseData`, local = `data` mới nhất, remote = bản server). Không xung đột thì thay bằng một op mới chứa bản gộp, cập nhật base và **gửi lại ngay trong cùng vòng** (tối đa 3 lần 409 liên tiếp cho một phiếu, quá thì để vòng sau); có xung đột thì lưu `conflicts`, phiếu thành `conflict`. Sau khi người dùng giải quyết, base là bản server họ đã thấy, nên 409 lặp lại đi đúng quy tắc 5 (ADR 0001 quy tắc 7).
   - Lỗi mạng, timeout 10s, `5xx`, `408`, `429`: `attempts++`, `nextAttemptAt = now + nextRetryDelay(attempts)`.
   - `4xx` khác: op `failed`, phiếu `error`, hiển thị lỗi cho người dùng.
3. **Upload ảnh** (§5.6).
   - `403 not_member`: dừng dự án đó, đánh dấu `removed` (ADR 0002 §6).
4. **Pull:** `GET .../records?since=<cursor>` theo trang tới khi `hasMore = false` (§7); nếu `scope` trong response khác `scope` đã lưu thì đặt cursor về 0 trước; phiếu không có op chờ, không `draft` và không `conflict` thì ghi đè bằng bản server; lưu cursor mới.
5. **Form:** tải danh sách form mới nhất; tải thêm phiên bản form (`GET P/forms/:id/versions/:v`) mà phiếu trên máy đang dùng nếu máy chưa có. Quét mọi phiếu của dự án chứ không chỉ phiếu vừa pull, để trang điền phiếu thiếu bản form chỉ cần gọi `syncNow()`. Server trả `404` thì bỏ qua bản đó.
6. Hẹn giờ cho op hoặc ảnh sớm nhất đang trong backoff.

### 5.4 Backoff

`nextRetryDelay(n) = random trong [d/2, d]`, với `d = min(1s × 2^n, 5 phút)` (`shared/src/backoff.ts`, kiểu "equal jitter"). Jitter tránh mọi máy cùng retry khi server vừa sống lại. Nút "Đồng bộ" thủ công chạy ngay những op đã đến hạn.

### 5.5 Pull cursor và phạm vi

Server có bộ đếm toàn cục `seq`, tăng mỗi lần ghi bất kỳ phiếu nào; mỗi phiếu lưu `seq` lần ghi cuối. Pull trả phiếu **của dự án trong đường dẫn** có `seq > cursor`, sắp theo `seq`. Cách này không phụ thuộc đồng hồ thiết bị. Bộ đếm dùng chung cho mọi dự án là đủ, vì cursor chỉ cần tăng dần, không cần liên tục.

Điều kiện đúng: `seq` phải được cấp theo đúng thứ tự commit. SQLite đảm bảo điều này vì mọi transaction ghi chạy tuần tự (`BEGIN IMMEDIATE`). Xem §6.1 nếu đổi CSDL.

**Phạm vi pull theo vai trò trong dự án** (ADR 0002 §3):
- `surveyor`: chỉ nhận phiếu do chính mình tạo (`created_by` = người dùng của token). Giám sát viên sửa phiếu đó thì điều tra viên vẫn nhận được.
- `supervisor`: nhận mọi phiếu của dự án.
- 🆕 `owner`: như `supervisor` (`scope: 'all'`). Hạ `owner` xuống `supervisor` không đổi phạm vi; xuống `surveyor` thì đi luồng "hẹp lại" dưới đây.

Response có `scope: 'own' | 'all'`. Client lưu `meta.pull = { cursor, scope }` theo từng dự án; vai trò đổi làm `scope` đổi thì cursor về 0 (ADR 0001 quy tắc 10).

- `scope` đã lưu là phạm vi **rộng nhất** mà dữ liệu trên máy đang có. Rộng ra (`own` → `all`): pull lại từ cursor 0. Hẹp lại (`all` → `own`, bị hạ vai trò): không còn dữ liệu chưa gửi thì xoá dữ liệu dự án trên máy rồi pull lại từ 0; còn thì giữ `all` và xét lại ở vòng sau, phiếu của người khác tạm còn trên máy (ADR 0002 §6, `client/src/sync/membership.ts`).
- `403 not_member` khi push/pull: ngừng đồng bộ dự án đó, đánh dấu `removed`; vòng sau xử lý như bị rút.

Lý do: không tải dữ liệu cá nhân (tên chủ hộ, GPS, ảnh) của người khác về điện thoại, và giới hạn dung lượng mỗi máy. Hệ quả: hai điều tra viên cùng đến một hộ sẽ tạo hai phiếu riêng (trùng lặp nghiệp vụ, giám sát viên xử lý khi xuất), không phải xung đột. Xung đột thực tế chủ yếu là giữa điều tra viên và giám sát viên.

### 5.6 Đồng bộ ảnh

- **Hàng đợi:** chính bảng `attachments` (không dùng outbox), mỗi ảnh có `uploadState: 'pending' | 'uploading' | 'done' | 'failed'`, `attempts`, `nextAttemptAt`, `uploadedChunks`, `checksumFailures`, `createdAt`. `uploading` bị bỏ dở (đóng tab) thì vòng sau coi như `pending`.
- **Ảnh nào được upload:** chỉ ảnh **còn trong phiếu chưa xoá** (id nằm trong một trường của `data`). Ảnh đã bỏ khỏi trường, ảnh của phiếu chưa từng lưu hay phiếu đã xoá thì không upload, và cũng **không tính là dữ liệu chưa gửi** khi xét đăng xuất hay bị rút khỏi dự án (`hasUnsentData`): người dùng đã chủ động bỏ, nếu tính thì máy kẹt mãi ở "còn dữ liệu chưa gửi".
- **Thứ tự:** trong mỗi vòng, push phiếu trước, sau đó upload ảnh của những phiếu đã có trên server (`baseVersion > 0`), cũ trước mới sau, mỗi lần một ảnh. Server cho phép phiếu tham chiếu ảnh chưa xong; trang xem phiếu hiển thị "Ảnh đang tải lên".
- **Retry:** lỗi mạng, `5xx`, `408`, `429` dùng cùng `nextRetryDelay` như op; tiếp tục từ chunk thiếu theo `GET /status`.
- **Thiếu chunk hoặc sai hash:** `409 missing_chunks` thì hỏi lại `status` và gửi bù ngay; `422 checksum_mismatch` lần đầu thì gửi lại từ đầu ngay (server đã xoá chunk). Tối đa 3 lượt trong một vòng, quá thì chờ backoff.
- **Lỗi không retry được** (`413`, `415`, `422 checksum_mismatch` lần thứ hai, `4xx` khác): ảnh `failed`, phiếu hiện "Lỗi ảnh" kèm nút "Thử lại" và "Bỏ ảnh này". "Bỏ ảnh này" bỏ id khỏi phiếu qua `saveRecordLocally` (tạo op mới); phiếu đang xung đột thì không có nút này.
- **Nhãn phiếu:** "Đã đồng bộ" chỉ khi `syncState = synced` **và** mọi ảnh còn trong phiếu `done`. Phiếu đã đồng bộ: có ảnh lỗi thì "Lỗi ảnh", còn ảnh chưa lên thì "Đang tải ảnh (n)". Phiếu chưa đồng bộ thì nhãn theo `syncState` (§5.1), nhưng nút của ảnh lỗi vẫn hiện. Hàm thuần `displayState` (`client/src/sync/displayState.ts`). Trang điền phiếu hiện nhãn nhỏ trên từng ảnh: "Chờ tải lên", "Đang tải lên", "Lỗi".
- **Xoá ảnh khỏi phiếu:** chỉ bỏ id khỏi trường photo; blob cục bộ giữ tới khi người dùng dọn bộ nhớ.
- **Dọn rác ở server:** chunk tạm của ảnh chưa `complete` sau 7 ngày thì xoá. File đã hoàn tất không tự xoá, vì `record_history` có thể còn tham chiếu.

### 5.7 Xoá phiếu

Nút "Xoá phiếu" ở trang phiếu, luôn có hộp xác nhận "Xoá phiếu này? Không hoàn tác được trên máy." (bất biến 1: người dùng đã bấm xác nhận). Surveyor xoá được phiếu mình tạo, supervisor xoá được mọi phiếu (có code, TV1-17: nút ẩn với surveyor khi `createdBy` của phiếu đã biết và khác mình; chưa biết thì hiện, server vẫn chặn). Phiếu đang `conflict` không xoá được (chỉ đọc, §4.5). Hàm xoá nằm cạnh `saveRecordLocally` và chạy trong **một transaction Dexie** gồm `records`, `outbox`, `attachments`.

| Phiếu đang ở đâu | Cách nhận biết | Hành vi |
|---|---|---|
| Chưa bao giờ có thể đã tới server | `baseVersion = 0` và mọi op của phiếu có `attempts = 0` (kể cả phiếu nháp không có op) | Xoá hẳn trên máy: xoá phiếu, mọi op, mọi ảnh của phiếu. Không gửi gì lên server |
| Có thể đã tới server | `baseVersion > 0`, hoặc có op đã gửi ít nhất một lần (server có thể đã ghi mà mất response) | Đặt `deleted = true`, tạo op xoá theo quy tắc gộp §5.2 (op chưa gửi thì sửa op đó, op đã gửi thì thêm op mới phía sau). Phiếu biến khỏi danh sách; giữ trong IndexedDB tới khi op xoá được server xác nhận |

- **Dữ liệu trong op xoá:** `deleted: true`, `data` = dữ liệu hợp lệ mới nhất, để server không nhận dữ liệu chưa qua validate. Phiếu nháp: `data` của op chưa gửi nếu còn (mới hơn `baseData`), không thì `baseData`. Phiếu cũng nhận bản này và thôi là nháp, để nếu op xoá nhận `409` thì merge dùng bản hợp lệ chứ không dùng dữ liệu nháp.
- **Op cũ:** op `failed` bị bỏ (server đã từ chối, không lưu key), như khi sửa phiếu lỗi (§5.1).
- **Xung đột:** server đã có người sửa trong lúc mình xoá thì nhận `409` và đi theo ADR 0001 quy tắc 6 (hỏi giữ hay xoá, §4.5). Không tự quyết.
- **Ảnh của phiếu đã xoá:** ngừng upload (hàng đợi upload của TV3-06 phải bỏ qua phiếu `deleted`); blob chưa upload được xoá cùng lúc op xoá được server xác nhận, trong cùng transaction với việc xoá phiếu.
- **Sau khi xác nhận:** op xoá nhận `200/201` và phiếu không còn op nào thì phiếu và ảnh bị xoá khỏi máy. Pull sau đó nhận lại tombstone của chính phiếu này; pull **bỏ qua tombstone của phiếu máy không có** để không chèn lại. Phiếu máy đang có (không có thay đổi chưa gửi) thì vẫn nhận tombstone và bị ẩn khỏi danh sách.
- **Code:** `deleteRecordLocally` trong `client/src/sync/outbox.ts` (TV2-13); nút "Xoá phiếu" ở trang phiếu hỏi bằng `confirm()` của trình duyệt (đúng câu chữ trên) rồi gọi hàm này; TV1-13 thay bằng hộp thoại của app.
- Khôi phục phiếu đã xoá (bỏ tombstone) ngoài phạm vi MVP, trừ trường hợp người dùng chọn "Khôi phục" trong màn hình xung đột.

## 6. Mô hình dữ liệu

### 6.1 Server (SQLite, `server/src/db.ts`)

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `projects` | `id`, `name`, `archived`, `created_at`, `public` | ADR 0002; `public` (mặc định 0) từ migration 4, ADR 0003 §3 |
| `users` | `id`, `username`, `name`, `password_hash`, `token_hash`, `is_admin`, `disabled`, `created_at` | `username` duy nhất (index `users_username`, vì SQLite không cho `ADD COLUMN … UNIQUE`), lưu chữ thường; tài khoản cũ `username = id`. `password_hash` dạng `scrypt$<N>$<salt>$<hash>`, tài khoản cũ để trống (đăng nhập được sau `user:reset-password`). `token_hash` là cột cũ, **không còn đọc**; vẫn `NOT NULL UNIQUE` nên tài khoản tự đăng ký ghi giá trị giữ chỗ `unused:<uuid>` (không phải hex, không bao giờ trùng SHA-256 của token nào) |
| `sessions` | `token_hash`, `user_id`, `created_at`, `last_seen_at` | Mỗi lần đăng nhập một dòng, chỉ lưu SHA-256 của token (PK); FK `user_id`; index `(user_id)`. Không tự hết hạn; `last_seen_at` cập nhật mỗi request, chỉ để tham khảo |
| `memberships` | `project_id`, `user_id`, `role`, `added_at`, `added_by` | PK `(project_id, user_id)`; `role` ∈ `surveyor`, `supervisor`, `owner` (`CHECK`); FK tới `projects`, `users`; index `(user_id)`. `added_by`: ai thêm hoặc đổi vai trò lần cuối, không có FK (như `created_by`); dòng có từ trước migration 4 để trống |
| `forms` | `project_id`, `id`, `version`, `schema` (JSON), `created_at`, `created_by` | PK `(project_id, id, version)`; FK `project_id` |
| `records` | `id`, `project_id`, `form_id`, `form_version`, `data` (JSON), `version`, `deleted`, `created_by`, `updated_at`, `updated_by`, `seq` | Bản hiện tại; `id` duy nhất toàn hệ thống (để PUT vào id của dự án khác trả `404`); FK `project_id`; index `(project_id, seq)`, `(project_id, created_by, seq)`. Không FK tới `forms` (phiếu offline có thể tham chiếu phiên bản form chưa pull) và không FK từ `created_by`/`updated_by` tới `users` (người bị vô hiệu hoá vẫn giữ phiếu) |
| `record_history` | `record_id`, `project_id`, `version`, `data`, `deleted`, `updated_at`, `updated_by` | PK `(record_id, version)`; FK `record_id` → `records`; `project_id` nhắc lại từ `records` để mọi truy vấn dữ liệu dự án đều lọc cùng một cách; index `(project_id, record_id)` |
| `idempotency` | `key`, `project_id`, `record_id`, `request_hash`, `status`, `body`, `created_at` | PK chỉ là `key` (dùng lại key ở dự án khác phải bị phát hiện và trả `422`); index `(created_at)` để dọn sau 30 ngày |
| `attachments` *(migration 3, TV3-05)* | `id`, `project_id`, `record_id`, `mime_type`, `size`, `sha256`, `total_chunks`, `created_by`, `created_at`, `completed_at` | Dòng tạo lúc `complete`. Chunk tạm ở `uploads/<projectId>/<id>/<i>.part`, ghép xong thành `uploads/<projectId>/<id>/file`; `created_by` không có FK (như `records`) |
| `project_requests` *(migration 5, TV2-15)* | `id`, `user_id`, `name`, `note`, `status`, `created_at`, `decided_at`, `decided_by`, `reason`, `project_id` | Yêu cầu mở tổ chức (ADR 0003 §3). `id` UUID; `status` ∈ `pending`, `approved`, `rejected`, `cancelled` (`CHECK`); FK `user_id` → `users`, `project_id` → `projects` (chỉ có khi đã duyệt); index `(status, created_at)`, `(user_id, status)`. Giữ cả yêu cầu đã xử lý để người gửi đọc được lý do. `decided_by` là admin (duyệt, từ chối) hoặc chính người gửi (huỷ), không có FK |
| `meta` | `k`, `v` | Bộ đếm `seq` |

Mọi truy vấn dữ liệu dự án đi qua lớp truy cập nhận `ctx = { userId, projectId, role }` bắt buộc (ADR 0002 §3). Migration 2 (TV2-01), lớp `repo/` và middleware (TV2-02), migration 3 `attachments` (TV3-05), migration 4 tài khoản (TV2-14), migration 5 `project_requests` (TV2-15).

**Migration 4 (ADR 0003 §5, TV2-14)** thêm `users.username`, `users.password_hash`, bảng `sessions` (chép mỗi `users.token_hash` cũ thành một phiên để máy đang đăng nhập bằng token cũ không bị đẩy ra), `projects.public`, và **tạo lại `memberships`, chép nguyên dữ liệu** để `CHECK` có `owner` và thêm `added_by`. Đây là ngoại lệ thứ hai so với luật "chỉ thêm cột/bảng" (§12), đã được nhóm chấp nhận; migration đếm số dòng trước/sau và dừng nếu lệch.

**Migration 5 (TV2-15)** chỉ thêm bảng `project_requests` (bảng trên).

**Dữ liệu cũ khi nâng cấp** (ADR 0003 §5):
- **Admin đang là thành viên tổ chức** (kể cả tổ chức đã lưu trữ): migration 4 dừng ngay từ đầu, rollback (`user_version` giữ 3), báo lỗi liệt kê từng `userId (tên) – projectId – vai trò`; server không khởi động. Người vận hành tự xử lý (bỏ cờ admin và tạo tài khoản admin riêng, hoặc rút admin khỏi tổ chức) rồi khởi động lại. Không tự xoá quyền hay membership của ai. Có code.
- **Tổ chức chưa có Owner:** migration không tự chọn; supervisor vẫn làm việc bình thường (có test MG2). Admin chỉ định qua `PUT /admin/projects/:projectId/owners/:username` (có code, TV2-15) hoặc 🆕 màn hình A2 ("Chưa có Owner", TV1-16); `last_owner` chỉ chặn việc làm mất Owner cuối cùng (TV1-08).
- Ca kiểm thử MG1, MG2 (§10.1).

**Nếu đổi sang Postgres:** phần lớn SQL dùng lại được, nhưng cursor `seq` **không** còn đúng nếu chỉ dùng sequence: hai transaction song song có thể commit ngược thứ tự `seq`, và client pull giữa hai lần commit sẽ bỏ sót phiếu. Cần tuần tự hoá việc ghi (`pg_advisory_xact_lock` trên một khoá chung, đủ cho quy mô đồ án) hoặc đổi sang cursor dựa trên transaction id. Không nằm trong phạm vi 8 tuần.

### 6.2 Kiểu dùng chung

Định nghĩa ở `shared/src/types.ts`: `FormSchema`, `FieldDef` (thêm `hidden?: boolean`), `FieldValue`, `ServerRecord`, `RecordHistoryEntry`, `SaveFormRequest`, `PushRecordRequest` (bỏ `updatedBy`), `ConflictResponse`, `PullResponse` (thêm `scope`, `hasMore`), `ApiError`, `Role`, `MeResponse`, `ProjectSummary`, `AdminProject`, `UpdateProjectRequest`, `Member`, `DirectoryEntry`, `ProjectRequest`, `AdminProjectRequest`, `CreateProjectRequestBody`, `DecideProjectRequest`.

**Thay đổi ở bản 0.4:**

```ts
interface ServerRecord {
  id: string; formId: string; formVersion: number;
  data: RecordData; version: number; deleted: boolean;
  createdBy: string;       // userId người tạo (mới)
  createdByName: string;   // tên người tạo lúc đọc (mới)
  updatedAt: string;       // ISO 8601 UTC do server gán
  updatedBy: string;       // userId người sửa cuối
  updatedByName: string;   // tên người sửa cuối lúc đọc (mới)
}

interface RecordHistoryEntry {
  version: number; data: RecordData; deleted: boolean;
  updatedAt: string; updatedBy: string;
  updatedByName: string;   // mới
}
```

- **Vì sao gửi kèm tên:** màn hình xung đột cần hiện "**Lan** đã sửa…" (§4.5) ngay cả khi offline, và surveyor không được gọi `GET P/members`. Server ghép tên từ bảng `users` lúc trả response; client lưu theo bản ghi nên đọc được khi offline. Tên đổi sau đó thì bản đã tải về vẫn hiện tên cũ tới lần pull kế tiếp, chấp nhận được.
- **"(đã rời dự án)":** client tự thêm khi `createdBy` không có trong danh sách thành viên mà supervisor tải được; surveyor không cần (chỉ thấy phiếu của chính mình).
- `updatedAt` là ISO 8601 UTC; UI hiển thị theo múi giờ của máy, chỉ để đọc, không dùng để so thứ tự (bất biến 4).
- Có code (TV1-17 phần 1): server ghép tên bằng LEFT JOIN `users` ở mọi response có `ServerRecord`/`RecordHistoryEntry` (pull, PUT, `409`, `GET history`); không tìm thấy tài khoản thì tên là chuỗi rỗng, client hiện userId thay vào. Response PUT đã lưu theo `Idempotency-Key` khi replay trả tên tại lần ghi đầu. Có code (TV1-17 phần 2): client lưu `createdBy`, `createdByName` vào phiếu mỗi khi nhận bản server (push, pull, tự gộp, giải quyết xung đột), không đổi schema Dexie; response cũ thiếu trường thì giữ giá trị đang có. Phiếu tải về trước đó chưa có người tạo tới khi được ghi lại (không pull lại toàn bộ). Màn hình xung đột hiện `updatedByName` của lần sửa cuối, tên rỗng hoặc bản xung đột cũ thì hiện userId.

**Thay đổi theo ADR 0003, đã có code (TV2-14):**

```ts
type Role = 'surveyor' | 'supervisor' | 'owner';            // thứ hạng tăng dần

interface MeResponse {
  user: { id: string; username: string; name: string; isAdmin: boolean };  // thêm username
  projects: ProjectSummary[];
}

interface RegisterRequest { username: string; name: string; password: string }
interface LoginRequest { username: string; password: string }
interface AuthResponse { token: string; user: MeResponse['user'] }
```

Luật thân request nằm ở `shared/src/accountValidation.ts` để client báo lỗi giống server: `parseRegisterRequest` chuyển `username` về chữ thường rồi kiểm `^[a-z0-9._]{3,32}$`, cắt khoảng trắng hai đầu `name` (1–100 ký tự), `password` 8–128 ký tự, không cắt; `parseLoginRequest` chỉ kiểm kiểu và chuyển `username` về chữ thường.

**Theo ADR 0003** (có code: `Member`, `ProjectSettings` ở TV1-08; còn lại ở TV2-15):

```ts
interface DirectoryEntry { id: string; name: string }        // GET /api/directory

interface ProjectRequest {                                    // yêu cầu mở tổ chức của mình
  id: string; name: string; note?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason?: string; projectId?: string; createdAt: string;     // reason khi rejected, projectId khi approved
}
interface CreateProjectRequestBody { name: string; note?: string }       // POST /project-requests
interface AdminProjectRequest {                               // GET /admin/project-requests
  id: string; name: string; note?: string;
  user: { id: string; username: string; name: string }; createdAt: string;
}
type DecideProjectRequest = { decision: 'approve' } | { decision: 'reject'; reason: string };

interface Member { userId: string; username: string; name: string; role: Role; addedAt: string }
interface ProjectSettings { name: string; public: boolean }   // PATCH P/settings

interface AdminProject {                                      // ownerUsernames rỗng = chưa có Owner
  id: string; name: string; archived: boolean; createdAt: string;
  ownerUsernames: string[]; memberCount: number;
}
interface UpdateProjectRequest { archived: boolean }          // PATCH /admin/projects/:projectId
```

Luật thân request mở tổ chức ở `shared/src/projectRequestValidation.ts` để màn hình Tổ chức và trang quản trị kiểm giống server: `parseCreateProjectRequest` cắt khoảng trắng `name` (1–100 ký tự) và `note` (≤ 500, chỉ có khoảng trắng coi như không có); `parseDecideProjectRequest` bỏ qua `reason` khi duyệt, từ chối cần `reason` 1–500 ký tự sau khi cắt; `parseProjectRequestStatus` cho `?status=`. Hằng `MAX_PENDING_REQUESTS = 1`, `MAX_OWNED_PROJECTS = 3`.

`Member`, `ProjectSettings` cùng thân request `AddMemberRequest`, `UpdateMemberRequest`, `UpdateSettingsRequest` nằm ở `shared/src/types.ts`; luật thân request và `canAssignRole` (ai được thêm/đổi/rút vai trò nào) ở `shared/src/memberValidation.ts` để màn hình Thành viên kiểm giống server.

`CreateProjectRequest` (thân `POST /admin/projects` cũ) đã bỏ: tổ chức chỉ được tạo khi admin duyệt yêu cầu.

## 7. REST API

Base `/api`, JSON. Mọi request trừ `/health` cần `Authorization: Bearer <token>` (§9). Route theo dự án nằm dưới `/api/projects/:projectId` (viết tắt `P` trong bảng) và đi qua middleware kiểm tra thành viên (ADR 0002 §3). Các route `forms`, `records` (TV2-03) và `attachments` (TV3-05) đã theo dự án và có xác thực; `export` vẫn dùng đường dẫn cũ, chưa xác thực.

**Không theo dự án**

| Method | Đường dẫn | Mô tả | Vai trò | Trạng thái |
|---|---|---|---|---|
| GET | `/health` | Kiểm tra sống | – | Có |
| POST | `/auth/register` | Tạo tài khoản, đăng nhập luôn (ADR 0003 §1) | không cần token | Có |
| POST | `/auth/login` | Đăng nhập, cấp phiên cho máy này | không cần token | Có |
| POST | `/auth/logout` | Huỷ phiên hiện tại | mọi | Có |
| GET | `/me` | Người dùng hiện tại và danh sách dự án kèm vai trò (`owner`, `supervisor`, `surveyor`) | mọi | Có |
| GET | `/directory` | Tên các tổ chức công khai mình chưa thuộc | mọi | Có |
| GET/POST | `/project-requests` | Yêu cầu mở tổ chức của mình / gửi yêu cầu mới | mọi | Có |
| DELETE | `/project-requests/:id` | Huỷ yêu cầu đang chờ của mình | mọi | Có |
| GET | `/admin/project-requests?status=` | Yêu cầu mở tổ chức | admin | Có |
| POST | `/admin/project-requests/:id` | Duyệt (tạo tổ chức, người gửi là Owner) / từ chối kèm lý do | admin | Có |
| GET | `/admin/projects` | Liệt kê dự án kèm tên đăng nhập Owner, số thành viên | admin | Có |
| PATCH | `/admin/projects/:projectId` | Khoá (lưu trữ) / mở; tên do Owner đổi qua `P/settings` | admin | Có |
| PUT | `/admin/projects/:projectId/owners/:username` | Thêm/nâng người đó thành Owner (khi khách hàng mất tài khoản Owner) | admin | Có |
| ~~POST~~ | ~~`/admin/projects`~~, ~~`PUT /admin/projects/:projectId/members/:userId`~~ | Bỏ ở TV2-15: tổ chức chỉ tạo khi duyệt yêu cầu; chỉ định Owner thay cho chỉ định giám sát viên | – | Đã bỏ |
| GET | `/admin/users?q=` và `POST /admin/users/:id/disable \| reset-password \| revoke-sessions` | Quản lý tài khoản cho màn hình A3 | admin | 🆕 TODO TV2-17 (cắt được) |
| POST/DELETE | `/__test/faults` | Tiêm lỗi cho kiểm thử | – | Có; chỉ khi `ENABLE_TEST_ROUTES=1` |

**Theo dự án** (`P` = `/projects/:projectId`)

| Method | Đường dẫn | Mô tả | Vai trò | Trạng thái |
|---|---|---|---|---|
| GET | `P/members` | Danh sách thành viên `Member[]` | supervisor | Có |
| POST | `P/members` | Thêm bằng `{ username, role }`; supervisor chỉ thêm `surveyor` | supervisor | Có |
| PUT | `P/members/:userId` | Đổi vai trò `{ role }`; không hạ Owner cuối cùng | supervisor (chỉ surveyor), owner | Có |
| DELETE | `P/members/:userId` | Rút khỏi dự án; không rút Owner cuối cùng | supervisor (chỉ surveyor), owner | Có |
| GET | `P/settings` | `ProjectSettings` `{ name, public }`, để màn hình Thành viên hiện ô Công khai | owner | Có |
| PATCH | `P/settings` | `{ name?, public? }` | owner | Có |
| GET | `P/forms` | Phiên bản mới nhất của mỗi form | thành viên | Có |
| GET | `P/forms/:id/versions/:v` | Một phiên bản form | thành viên | Có |
| POST | `P/forms` | Lưu form từ builder. Thân `SaveFormRequest` (`{ id, title, fields }`; `version` client gửi bị bỏ qua), server đặt `version` = bản mới nhất + 1 trong cùng transaction, trả `201` + `FormSchema`. Sai kiểu `400 invalid_body`, sai luật §4.1 `400 invalid_form` | supervisor (🆕 owner đi qua theo thứ hạng) | Có |
| GET | `P/records?since=&limit=` | Pull theo cursor, lọc theo phạm vi §5.5; trả thêm `scope` | thành viên | Có (chưa có `hasMore`) |
| GET | `P/records/:id/history` | Lịch sử phiên bản | thành viên (trong phạm vi) | Có |
| PUT | `P/records/:id` | Ghi có điều kiện, cần `Idempotency-Key` | thành viên (trong phạm vi) | Có |
| GET | `P/attachments/:id/status` | Chunk đã nhận: `{ received: number[] }` (ảnh đã ghép thì đủ mọi chỉ số) | thành viên (trong phạm vi) | Có |
| PUT | `P/attachments/:id/chunks/:i` | Upload một chunk (`application/octet-stream`, ≤ 256 KB, `i` < 40). Chunk mới `201`, đã có `200` không ghi lại | thành viên | Có |
| POST | `P/attachments/:id/complete` | `{ recordId, totalChunks, mimeType, sha256 }` → ghép, kiểm SHA-256 và magic bytes, `201 { id, recordId, mimeType, size, sha256 }`; gọi lại cùng hash `200` | thành viên (phiếu trong phạm vi) | Có |
| GET | `P/attachments/:id` | Tải ảnh | thành viên (trong phạm vi) | Có |
| GET | `P/export/:formId?format=csv\|json&includeDeleted=` | Xuất CSV/JSON (§4.6) | supervisor, owner | Có |

**PUT /api/projects/:projectId/records/:id**

```http
PUT /api/projects/demo-yte/records/3f2c... HTTP/1.1
Authorization: Bearer <token>
Idempotency-Key: 9b1e...
Content-Type: application/json

{ "formId": "household-survey", "formVersion": 1, "baseVersion": 2,
  "data": { "householdName": "An", "members": 4 }, "deleted": false }
```

`updatedBy` không còn trong thân request; server lấy từ token.

| Kết quả | Thân |
|---|---|
| `201` tạo mới / `200` cập nhật | `ServerRecord` |
| `409 version_conflict` | `{ error, current: ServerRecord, history: RecordHistoryEntry[] }` |
| `400` | thiếu `Idempotency-Key` hoặc thân sai |
| `403 not_member` | không (còn) là thành viên dự án |
| `404` | `baseVersion > 0` nhưng phiếu không tồn tại, phiếu ngoài phạm vi của surveyor, hoặc `id` thuộc dự án khác |
| `422 idempotency_key_reused` | key đã dùng cho request khác (khác dự án, khác `recordId` hoặc khác nội dung) |

**GET /api/me**

```json
{
  "user": { "id": "u_7f3a...", "username": "lan", "name": "Lan", "isAdmin": false },
  "projects": [
    { "id": "demo-yte", "name": "Y tế xã Tân Lập", "role": "supervisor" },
    { "id": "demo-nongnghiep", "name": "HTX Nông nghiệp", "role": "surveyor" }
  ]
}
```

- Chỉ chứa dự án người dùng **đang** là thành viên và chưa lưu trữ. Dự án bị rút hoặc bị lưu trữ đơn giản là biến khỏi danh sách; client so với bản đã lưu để biết (ADR 0002 §6) và tự gắn trạng thái `removed` ở `field-survey-account`.
- `401 unauthorized` khi thiếu token, token sai hoặc tài khoản `disabled`.
- Kiểu: `MeResponse { user: { id; username; name; isAdmin }; projects: ProjectSummary[] }`, `ProjectSummary { id; name; role: Role }` (§6.2). Tài khoản do CLI cũ tạo mà chưa có `username` thì trả `id` (như migration 4 làm với tài khoản cũ).

**Tài khoản, yêu cầu mở tổ chức, thành viên (ADR 0003 §6).** Mọi dòng có code: `/auth/*` (TV2-14), `/directory`, `/project-requests`, `/admin/*` (TV2-15), `P/members`, `P/settings` (TV1-08).

| Method, đường dẫn | Thân request | Kết quả |
|---|---|---|
| `POST /auth/register` | `{ username, name, password }` | `201 AuthResponse`; `409 username_taken`; `400 invalid_body`; `429 too_many_requests` (đã có 5 tài khoản tạo thành công trong 60 phút gần nhất từ IP này; đăng ký hỏng không tính) |
| `POST /auth/login` | `{ username, password }` | `200 AuthResponse`; sai tên, sai mật khẩu, tài khoản chưa có mật khẩu hay bị khoá đều `401 invalid_credentials`; `429 too_many_requests` khi đã sai 10 lần trong 15 phút gần nhất theo tên hoặc theo IP (cửa sổ trượt; đăng nhập đúng không xoá bộ đếm; đang bị chặn thì mật khẩu đúng cũng `429`) |
| `POST /auth/logout` | – | `204`, xoá phiên của token đang gửi; phiên khác của cùng người giữ nguyên |
| `GET /directory` | – | `200 DirectoryEntry[]`: tổ chức `public`, chưa lưu trữ, mình chưa là thành viên |
| `POST /project-requests` | `{ name, note? }` | `201 ProjectRequest`; `409 project_limit_reached` (đang có 1 yêu cầu chờ, hoặc đã là Owner của 3 tổ chức chưa lưu trữ) |
| `GET /project-requests` | – | `200 ProjectRequest[]` của chính mình |
| `DELETE /project-requests/:id` | – | `204`; không phải của mình hoặc đã xử lý → `404` |
| `GET /admin/project-requests?status=pending` | – | `200 [{ id, name, note, user: { id, username, name }, createdAt }]` |
| `POST /admin/project-requests/:id` | `{ decision: 'approve' \| 'reject', reason? }` | Duyệt: `200 { projectId }`; một transaction tạo dự án (`id` = `p-` + 8 ký tự `a-z0-9`, không công khai) và membership `owner` cho người gửi, `added_by` = admin; admin **không** thành thành viên. Từ chối: `reason` bắt buộc. Không còn `pending` → `409 request_decided` |
| `PUT /admin/projects/:projectId/owners/:username` | – | `200`; không có dự án hoặc tên → `404`; tài khoản admin → `409 admin_account` |
| `POST P/members` | `{ username, role }` | `201 Member`; không có tên → `404 not_found`; `409 already_member`; `409 admin_account`; supervisor thêm vai trò khác `surveyor` → `403 forbidden` |
| `PUT P/members/:userId`, `DELETE P/members/:userId` | `{ role }` / – | `200` / `204`; `409 last_owner`; supervisor đụng vào supervisor/owner → `403 forbidden` |
| `GET P/settings`, `PATCH P/settings` | – / `{ name?, public? }` | `200 ProjectSettings`; không phải owner → `403 forbidden` |

- **`P/members`, `P/settings`** (có code, `server/src/routes/members.ts`): `POST` kiểm theo thứ tự thân sai `400` → vai trò vượt quyền `403` → không có tên `404` → tài khoản admin `409 admin_account` → đã là thành viên `409 already_member`. Tên đăng nhập cắt khoảng trắng, không phân biệt hoa thường. `PUT`/`DELETE`: `userId` không thuộc dự án này (kể cả người ở dự án khác) → `404`; người làm phải đụng được cả vai trò hiện tại lẫn vai trò mới, nên supervisor không tự rút hay đổi vai trò của mình. `PUT` giữ `added_at`, ghi `added_by` là người đổi; đổi sang đúng vai trò đang có thì không ghi gì. Kiểm `last_owner` và ghi trong cùng transaction. `GET` sắp Owner, supervisor, surveyor, rồi theo tên đăng nhập. `PATCH P/settings`: `name` cắt khoảng trắng, 1–100 ký tự; cần ít nhất một trường, sai → `400 invalid_body`.

- Mọi route theo tổ chức vẫn qua `requireMember`; `/directory`, `/project-requests` không có `:projectId` và không chạm form, phiếu, ảnh. T5 không có ngoại lệ.
- `requireAuth` tra token trong `sessions` (không còn `users.token_hash`), cập nhật `last_seen_at`; tài khoản `disabled` → `401`. Có code (TV2-14).
- Tên đăng nhập không tồn tại vẫn chạy scrypt trên một hash giả để thời gian trả lời không lộ tên nào đã có. Bộ đếm giới hạn tần suất nằm trong bộ nhớ tiến trình (khởi động lại thì xoá). Mỗi lần đăng nhập hoặc đăng ký được giữ chỗ trong bộ đếm ngay sau bước kiểm, trước khi chạy scrypt, nên gửi nhiều request cùng lúc cũng không vượt giới hạn; đăng nhập đúng hoặc đăng ký không thành thì trả lại lượt đó.
- Tài khoản admin đăng nhập được `/auth/login` để dùng trang quản trị; app khảo sát tự chặn (§4.9). Admin vẫn nhận `403 not_member` ở mọi `P/...` (T4, ADR 0003 Y8).

- **`/project-requests`, `/directory`** (có code, `server/src/routes/projectRequests.ts`, `directory.ts`): chỉ cần đăng nhập. `POST` kiểm theo thứ tự thân sai `400` → giới hạn `409 project_limit_reached`; kiểm và ghi trong cùng transaction. Tổ chức đã lưu trữ không tính vào giới hạn 3. `GET /project-requests` trả mọi yêu cầu của mình (kể cả đã huỷ), mới nhất trước. `DELETE` chỉ đổi trạng thái thành `cancelled`, không xoá dòng. `GET /directory` sắp theo tên.
- **`/admin/project-requests`** (có code, `server/src/routes/admin.ts`): `?status=` nhận `pending`, `approved`, `rejected`, `cancelled`, không có thì `pending`, lạ thì `400 invalid_body`; sắp cũ nhất trước. `POST`: thân sai `400` → không có yêu cầu `404` → không còn `pending` `409 request_decided`. Duyệt kiểm lại giới hạn 3 tổ chức của người gửi (có thể đã được thêm làm Owner ở nơi khác trong lúc chờ): vượt thì `409 project_limit_reached`, yêu cầu vẫn `pending`. Từ chối trả `200 {}`.
- **`/admin/projects`** (có code; chỉ `isAdmin`, người khác nhận `403 forbidden`): `GET` trả `AdminProject[]` gồm cả dự án đã lưu trữ, sắp theo `id`, `ownerUsernames` sắp theo tên. `PATCH` chỉ nhận đúng `{ archived: boolean }`; gửi thêm `name` hay `public` → `400 invalid_body`; không có dự án → `404`. `PUT …/owners/:username` không có thân: tên đăng nhập cắt khoảng trắng, không phân biệt hoa thường; thêm mới hoặc nâng lên `owner`, giữ `added_at`, ghi `added_by` = admin; đã là Owner thì không ghi gì; `200 { projectId, userId, role: 'owner' }`; chạy được cả khi dự án đang lưu trữ.
- Admin quản lý tổ chức nhưng **không** vì thế mà thành thành viên: duyệt yêu cầu hay chỉ định Owner xong vẫn nhận `403 not_member` khi gọi `P/...` (ca T4, Q7). `id` tổ chức mới do server sinh (`p-` + 8 ký tự `a-z0-9`), khớp mẫu id dự án `^[a-z0-9][a-z0-9-]{1,39}$` vì nằm trong URL và tên IndexedDB `field-survey-p-<id>` (§4.2).
- Thêm surveyor, đổi vai trò, rút thành viên là việc của supervisor, Owner qua `P/members`, không qua API admin.

**GET /api/projects/:projectId/records?since=&limit=** (pull)

```json
{ "records": [ /* ServerRecord, sắp theo seq tăng dần */ ], "cursor": 1234, "hasMore": true, "scope": "own" }
```

- `since` mặc định `0`; `limit` mặc định 500, tối đa 1000.
- `cursor` = `seq` của bản ghi cuối trong trang (bằng `since` nếu trang rỗng). Client gọi tiếp với `since = cursor` cho tới khi `hasMore = false`, và lưu cursor **sau mỗi trang** để mất mạng giữa chừng thì lần sau đi tiếp, không tải lại từ đầu.
- `hasMore` = còn bản ghi có `seq > cursor` trong phạm vi (server lấy `limit + 1` dòng để biết).
- Gồm cả tombstone (`deleted: true`) để máy khác biết phiếu đã bị xoá.

### 7.1 Mã lỗi

Dạng chung: `{ "error": "<mã>", "message"?: "<mô tả cho người phát triển>", "details"?: ... }`.

| HTTP | `error` | Khi nào | Client xử lý |
|---|---|---|---|
| 400 | `invalid_body` | Thân request sai kiểu | op `failed` |
| 400 | `missing_idempotency_key` | Thiếu header | lỗi lập trình, op `failed` |
| 400 | `invalid_form` | Form không qua validate (`details`: danh sách lỗi) | hiện lỗi trong builder |
| 401 | `unauthorized` | Thiếu hoặc sai token, phiên đã bị huỷ hoặc tài khoản bị khoá | dừng đồng bộ, yêu cầu đăng nhập lại |
| 401 | `invalid_credentials` | Sai tên đăng nhập hoặc mật khẩu (không phân biệt) | "Sai tên đăng nhập hoặc mật khẩu" |
| 403 | `not_member` | Không (còn) là thành viên dự án, hoặc dự án đã lưu trữ | dừng dự án, xử lý như bị rút (ADR 0002 §6) |
| 403 | `forbidden` | Là thành viên nhưng sai vai trò (vd. surveyor gọi export) | hiện lỗi; ẩn nút tương ứng |
| 404 | `not_found` | Không có tài nguyên, ngoài phạm vi, hoặc thuộc dự án khác (không phân biệt để không lộ thông tin) | op `failed` |
| 409 | `last_supervisor` 🕘 | Rút hoặc hạ vai trò giám sát viên cuối cùng | Chưa có code; **thay bằng `last_owner`** |
| 409 | `last_owner` | Rút hoặc hạ Owner cuối cùng của tổ chức | hiện lỗi ở màn hình Thành viên / A2 |
| 409 | `username_taken` | Đăng ký trùng tên đăng nhập (không phân biệt hoa thường) | hiện lỗi ở form tạo tài khoản |
| 409 | `already_member` | Thêm người đã là thành viên | hiện lỗi |
| 409 | `admin_account` | Thêm tài khoản admin vào tổ chức | hiện lỗi |
| 409 | `project_limit_reached` | Đang có 1 yêu cầu mở tổ chức chờ duyệt, hoặc đã là Owner của 3 tổ chức chưa lưu trữ (kiểm cả lúc gửi và lúc duyệt) | hiện lỗi ở màn hình Tổ chức / A1 |
| 409 | `request_decided` | Duyệt/từ chối yêu cầu không còn `pending` | tải lại danh sách A1 |
| 409 | `version_conflict` | `baseVersion` lệch | merge (§5.3) |
| 409 | `missing_chunks` | `complete` khi còn thiếu chunk (`details`: chỉ số thiếu) | upload phần thiếu |
| 413 | `payload_too_large` | Chunk hoặc ảnh quá giới hạn | ảnh `failed` |
| 415 | `unsupported_media_type` | Không phải JPEG/PNG/WebP | ảnh `failed` |
| 422 | `idempotency_key_reused` | Xem trên | op `failed` (lỗi lập trình) |
| 422 | `checksum_mismatch` | SHA-256 không khớp | upload lại từ đầu một lần, sau đó `failed` |
| 429 | `too_many_requests` | Quá giới hạn đăng nhập sai hoặc đăng ký (ADR 0003 §1) | "Thử lại sau ít phút" |
| 501 | `not_implemented` | Route chưa làm | – |
| 500 / 400 | `injected_fault` | Lỗi do route tiêm lỗi tạo ra (§10.1), chỉ khi `ENABLE_TEST_ROUTES=1` | như mã HTTP tương ứng |
| 5xx | `internal_error` | Lỗi server | retry theo backoff |

## 8. Xử lý lỗi

| Tình huống | Hành vi | Người dùng thấy |
|---|---|---|
| Offline | Không gửi; chờ sự kiện `online` | Nhãn "Ngoại tuyến", phiếu "Chờ đồng bộ" |
| Timeout / mất kết nối giữa chừng | Retry với cùng `opId`; server trả lại response cũ nếu đã ghi | Không thấy gì khác |
| `5xx`, `429` | Backoff, retry | Sau 5 lần: "Máy chủ đang lỗi, sẽ thử lại" (code chưa làm) |
| `401` | Dừng đồng bộ | "Phiên đăng nhập hết hạn, nhập lại mã" (🆕 "…, đăng nhập lại") |
| `403 not_member` | Dừng dự án đó | "Bạn không còn thuộc dự án X" (§4.7) |
| `409` gộp được | Tự gộp, gửi lại | Không thấy gì |
| `409` có xung đột | Chờ người dùng; phiếu chỉ đọc | "Cần xử lý xung đột" |
| `4xx` khác | Dừng op | "Lỗi" kèm chi tiết, nút "Thử lại" và "Xuất JSON phiếu này" |
| Ảnh lỗi không retry được | Dừng ảnh đó | "Lỗi ảnh", nút "Thử lại" / "Bỏ ảnh này" |
| IndexedDB đầy (`QuotaExceededError`) | Không lưu ảnh mới | "Bộ nhớ đầy: đồng bộ rồi dọn ảnh đã tải lên" |
| Trình duyệt không giải mã được ảnh (vd. HEIC trên Chrome Android) | Không lưu ảnh | "Không đọc được ảnh này. Hãy chụp lại hoặc chọn ảnh JPEG/PNG" |
| File nhập form không hợp lệ | Không đổi nội dung builder, không gửi | "File không phải JSON" / "File không đúng định dạng biểu mẫu" / lỗi luật lưu form (§4.1) |
| Phiếu dùng form version chưa có trên máy | Trang điền phiếu gọi `syncNow()`, bước 5 tải form version đó (§5.3) | Đang tải: "Đang tải biểu mẫu…"; offline hoặc tải không được: "Cần kết nối để mở phiếu này", có mạng lại thì tự thử lại |
| Phiếu chưa đồng bộ quá 24 giờ | Không đổi hành vi | Cảnh báo đầu trang (§5.2) |

## 9. Bảo mật và quyền riêng tư

Phạm vi đồ án giữ đơn giản:
- **Xác thực:**
  - **Bản mới (ADR 0003 §1; phía server có code ở TV2-14, client đăng nhập bằng tên + mật khẩu chờ TV2-16, TV1-14):** người dùng tự tạo tài khoản; mật khẩu băm bằng `scrypt` (`node:crypto`), so bằng `timingSafeEqual`. Mỗi lần đăng nhập server cấp một token phiên (32 byte ngẫu nhiên) cho máy đó, chỉ lưu SHA-256 trong `sessions`; phiên không tự hết hạn để máy offline lâu vẫn gửi được phiếu. Sai tên/mật khẩu cùng một lỗi; giới hạn đăng nhập sai và đăng ký theo §7. Giới hạn theo IP dùng `req.ip` với `trust proxy = loopback`: sau Caddy cùng máy là IP trong `X-Forwarded-For`, request đến thẳng cổng API từ máy khác thì header này bị bỏ qua. Mất máy: admin chạy `user:revoke-sessions`; quên mật khẩu: `user:reset-password`.
  - 🕘 **Bản cũ (client còn chạy tới TV2-16):** mỗi người dùng một token dài ngẫu nhiên, tạo bằng CLI ở server (§12); từ migration 4 token này được lưu thành một phiên trong `sessions`. Client nhập token một lần ở màn hình đầu tiên. Mất máy: quản trị thu hồi phiên bằng `user:revoke-sessions` (TV3-12 bỏ `user:rotate-token`).
  - Chung: token lưu trong `field-survey-account`, gửi qua `Authorization: Bearer`; `updatedBy` và `created_by` lấy từ token, không để client tự khai.
- **Phân quyền:**
  - 🆕 **Bản mới (ADR 0003 §2):** admin (người kiểm soát app) **không có quyền xem** dữ liệu tổ chức và không là thành viên tổ chức nào; dùng trang quản trị riêng. Trong mỗi tổ chức: `surveyor` chỉ đọc/ghi phiếu mình tạo (§5.5); `supervisor` đọc/ghi mọi phiếu, tạo form, xuất dữ liệu, thêm/rút điều tra viên; `owner` thêm quản lý giám sát viên/Owner, đổi tên, bật/tắt công khai. Dữ liệu thuộc về Owner.
  - 🕘 **Bản cũ (ADR 0002 §2):** `admin` quản lý dự án nhưng không đọc dữ liệu dự án nếu không là thành viên; trong mỗi dự án, `surveyor` chỉ đọc/ghi phiếu mình tạo, `supervisor` đọc/ghi mọi phiếu, tạo form, xuất dữ liệu, quản lý thành viên.
- **Cách ly dự án:** `projectId` chỉ lấy từ đường dẫn sau khi kiểm tra thành viên; id thuộc dự án khác trả `404`; bộ test T1–T5 (ADR 0002) chạy trong CI.
- **HTTPS bắt buộc** khi triển khai (service worker chỉ chạy trên HTTPS hoặc localhost).
- **CORS:** chỉ cho phép origin của app (`CORS_ORIGIN`), không mở `*`.
- **Dữ liệu trên máy:** IndexedDB không mã hoá; ghi rõ trong tài liệu người dùng, có nút "Xoá dữ liệu trên máy" (chỉ bật khi outbox rỗng và mọi ảnh đã `done`).
- **Upload:** giới hạn chunk 256 KB và ảnh 10 MB, kiểm tra MIME bằng magic bytes, tên file do server đặt.
- **Route tiêm lỗi** chỉ bật khi đặt rõ `ENABLE_TEST_ROUTES=1` (bật chủ động; quên cấu hình thì route tắt).
- **CSV injection:** escape ô bắt đầu bằng `= + - @` (§4.6).
- GPS là dữ liệu cá nhân: chỉ lấy khi người dùng bấm, không chạy nền; không tải phiếu của người khác về máy điều tra viên (§5.5).

## 10. Kiểm thử

| Mức | Công cụ | Vị trí | Chạy |
|---|---|---|---|
| Unit | Vitest | `shared/src/*.test.ts`, `client/src/**/*.test.ts` (hàm thuần phía client) | `npm test` |
| Integration API | Vitest + `fetch` vào server chạy cổng ngẫu nhiên, SQLite in-memory | `server/test/` | `npm test` |
| E2E | Playwright trên bản build (`vite preview`) để SW chạy như thật | `client/e2e/` | `npm run test:e2e` |
| Hiệu năng | Script seed 2.000 phiếu + Playwright đo thời gian | `client/e2e/perf/` | thủ công, tuần 6 |

### 10.1 Ma trận E2E bắt buộc

**Offline**

| # | Ca | Trạng thái |
|---|---|---|
| O1 | Tải app, offline, reload vẫn mở được, nhập phiếu, online thì đồng bộ | Có (`offline.spec.ts`) |
| O2 | Offline từ lúc mở app (đã cài trước đó), tạo 10 phiếu, online | Có (`offline-install.spec.ts`: tab mới mở khi đã mất mạng, server có đủ 10 phiếu, mỗi phiếu version 1) |
| O3 | Phiếu có ảnh khi offline, online thì ảnh lên đủ, nhãn chỉ thành "Đã đồng bộ" khi ảnh xong | Có (`upload.spec.ts`: 2 ảnh, SHA-256 khớp, thấy "Đang tải ảnh (2)" trước "Đã đồng bộ") |
| O4 | Đóng tab khi còn op, mở lại thì vẫn đồng bộ | Có (`offline-install.spec.ts`) |
| O5 | Lưu phiếu thiếu trường bắt buộc: thành "Nháp", không lên server; sửa đủ thì đồng bộ | Có (`draft.spec.ts`) |
| O6 | Hai tab cùng mở: mỗi op chỉ được gửi từ một tab | Có (`tabs.spec.ts`) |
| O7 | Xoá phiếu chưa từng gửi (tạo khi offline): bấm "Huỷ" thì phiếu còn; xác nhận thì phiếu, op, ảnh biến khỏi máy, online lên không có request nào cho phiếu đó (§5.7) | Có (`delete.spec.ts`; hộp xác nhận trong app, kiểm cả Huỷ và Esc) |
| O8 | Xoá phiếu đã đồng bộ: phiếu biến khỏi danh sách, server có `deleted: true`, máy khác pull thấy tombstone; phiếu bị xoá khỏi máy sau khi op xoá được xác nhận (§5.7) | Có (`delete.spec.ts`) |

**Conflict**

| # | Ca | Kỳ vọng | Trạng thái |
|---|---|---|---|
| C1 | Hai nơi sửa khác trường | Tự gộp, không hỏi | Có (unit; E2E `conflict.spec.ts`) |
| C2 | Hai nơi sửa cùng trường, khác giá trị | Màn hình conflict, chọn xong server có bản gộp | Có (`conflict.spec.ts`) |
| C3 | Hai nơi sửa cùng trường, cùng giá trị | Không hỏi | Unit có |
| C4 | Máy xoá, server sửa | Hỏi giữ hay xoá; nút Áp dụng khoá tới khi trả lời | Có (unit; E2E `delete-conflict.spec.ts`: "Giữ phiếu", "Vẫn xoá") |
| C5 | Máy sửa, server xoá | Hỏi khôi phục hay bỏ | Có (unit; E2E `delete-conflict.spec.ts`: "Khôi phục", "Bỏ") |
| C6 | Sửa ba lần liên tiếp khi offline | Một op, version server tăng 1 | Có (`conflict.spec.ts`) |
| C7 | Phiếu đang conflict, người dùng mở phiếu | Chỉ đọc, có banner dẫn tới màn hình xung đột; không tạo op | Có (`conflict.spec.ts` "C7"; `delete.spec.ts` không có nút Xoá) |
| C8 | Server đổi tiếp trong lúc người dùng đang chọn ở màn hình conflict | Khác trường: tự gộp; cùng trường: hiện conflict mới; không mất lựa chọn đã áp dụng | Có (`conflict.spec.ts`, hai ca) |

**Retry**

| # | Ca | Kỳ vọng | Trạng thái |
|---|---|---|---|
| R1 | Server trả 500 hai lần | Retry theo backoff, đúng một bản ghi | Có (`offline.spec.ts`) |
| R2 | Timeout (server giữ request 15s) | Hủy sau 10s, retry, không trùng | Có (`retry.spec.ts`) |
| R3 | Server ghi xong nhưng kết nối bị cắt trước response | Gửi lại cùng key, server trả `Idempotent-Replayed` | Có (integration `server/test/idempotency.test.ts`, E2E `retry.spec.ts`) |
| R4 | Mất mạng giữa lúc upload ảnh | Tiếp tục từ chunk thiếu | Có (`upload.spec.ts`: cắt trước và sau khi server ghi chunk 2) |
| R5 | `400` | Phiếu "Lỗi", không retry vô hạn | Có (`errors.spec.ts`, fault mode `"400"`) |
| R6 | Cùng `Idempotency-Key`, khác nội dung | `422 idempotency_key_reused` | Có (`server/test/records.test.ts`) |

**Phân quyền** (integration)

| # | Ca | Kỳ vọng | Trạng thái |
|---|---|---|---|
| A1 | Không có token | `401` | Có (`server/test/auth.test.ts` ở mức middleware, `server/test/records.test.ts` ở route thật) |
| A2 | Surveyor pull | Chỉ nhận phiếu mình tạo | Có (`server/test/records.test.ts`) |
| A3 | Surveyor gọi `POST P/forms` hoặc export | `403 forbidden` | Có (`server/test/forms.test.ts`; `server/test/export.test.ts`) |
| A4 | Rút hoặc hạ giám sát viên cuối cùng | `409 last_supervisor` | 🕘 Thay bằng A7 (`last_owner`) |
| A5 | Supervisor và Owner `POST P/forms`; surveyor | `201`; `403 forbidden` | Có (`server/test/forms.test.ts`); thứ hạng owner > supervisor ở mức middleware trong `server/test/auth.test.ts` |
| A6 | Một người là `owner` ở A, `surveyor` ở B: sửa form, `PATCH P/settings` ở A và B | `2xx` ở A; `403 forbidden` ở B | Có (`server/test/members.test.ts`), kiểm thêm `POST P/members` |
| A7 | Rút/hạ Owner cuối cùng | `409 last_owner` | Có (`server/test/members.test.ts`) |
| A8 | Admin chỉ định Owner bằng tên đăng nhập; người thường gọi | `200`; `403 forbidden` | Có (`server/test/admin.test.ts`) |

**Tài khoản, mở tổ chức, danh sách công khai, thành viên** (ADR 0003, Kiểm chứng). U1–U6, MG1, MG2, Q1–Q7, Q9, Q11, D1, D2, M1, M2 có test; các ca khác 🆕 chưa có code

| # | Mức | Ca | Kỳ vọng | Ticket |
|---|---|---|---|---|
| U1 | Integration | Đăng ký rồi gọi `/me` bằng token nhận được | `201`, `/me` đúng người, `projects: []` | Có (`server/test/accounts.test.ts`) |
| U2 | Integration | Đăng ký trùng tên (khác hoa thường) | `409 username_taken` | Có (`server/test/accounts.test.ts`) |
| U3 | Integration | Sai mật khẩu; sai tên đăng nhập | Cùng `401 invalid_credentials` | Có (`server/test/accounts.test.ts`) |
| U4 | Integration | Sai mật khẩu 11 lần trong 15 phút | Lần 11 nhận `429` kể cả mật khẩu đúng | Có (`server/test/accounts.test.ts`) |
| U5 | Integration | Hai phiên (hai máy) cùng gửi phiếu; đăng xuất một máy | Cả hai gửi được; máy kia không ảnh hưởng | Có (`server/test/accounts.test.ts`) |
| U6 | Integration | DB chỉ chứa hash | Không có mật khẩu/token gốc trong `users`, `sessions` | Có (`server/test/accounts.test.ts`) |
| U7 | E2E | Tạo tài khoản trên app, tải lại trang; offline lần đầu | Vẫn đăng nhập; báo cần mạng | TV1-14 |
| MG1 | Integration | DB `user_version = 3` có admin là thành viên tổ chức → `openDb` | Lỗi liệt kê tài khoản và tổ chức; `user_version` vẫn 3, dữ liệu không đổi | Có (`server/test/db.test.ts`) |
| MG2 | Integration | DB `user_version = 3` không có admin là thành viên → `openDb` | Lên 4; membership giữ nguyên; token cũ dùng được; supervisor vẫn dùng `P/...` khi tổ chức chưa có Owner | Có (`server/test/db.test.ts`) |
| Q1 | Integration | Gửi yêu cầu mở tổ chức | `201 pending`, chưa có tổ chức, `/me` rỗng | Có (`server/test/projectRequests.test.ts`) |
| Q2 | Integration | Admin duyệt | Tổ chức `p-xxxxxxxx`, người gửi là `owner`, admin không có membership | Có (`server/test/projectRequests.test.ts`) |
| Q3 | Integration | Từ chối kèm lý do; thiếu lý do | Người gửi đọc được lý do; `400 invalid_body` | Có (`server/test/projectRequests.test.ts`) |
| Q4 | Integration | Người thường gọi `/admin/project-requests…` | `403 forbidden` | Có (`server/test/projectRequests.test.ts`) |
| Q5 | Integration | Yêu cầu thứ hai khi đang chờ; khi đã là Owner 3 tổ chức | `409 project_limit_reached` | Có (`server/test/projectRequests.test.ts`) |
| Q6 | Integration | Duyệt lại yêu cầu đã xử lý; huỷ yêu cầu người khác | `409 request_decided`; `404` | Có (`server/test/projectRequests.test.ts`) |
| Q7 | Integration | Sau khi duyệt, admin gọi `P/forms`, `P/records` | `403 not_member` | Có (`server/test/projectRequests.test.ts`) |
| Q8 | E2E | Tạo tài khoản → gửi yêu cầu → admin duyệt (API) → sau một vòng đồng bộ thấy tổ chức với vai trò Owner, tạo được form | Như T6 | TV1-15 |
| Q9 | Integration | Thêm tài khoản admin vào tổ chức | `409 admin_account` | Có (`server/test/members.test.ts`) |
| Q10 | E2E | `/admin/`: tài khoản thường bị từ chối; admin duyệt ở A1, khoá ở A2; trang admin không có IndexedDB | Như mô tả | TV1-16 |
| Q11 | E2E | Đăng nhập app khảo sát bằng tài khoản admin | "Tài khoản quản trị dùng trang /admin", không tạo CSDL | Có (`client/e2e/account.spec.ts`, qua màn hình nhập mã; thêm ca token admin đã lưu từ trước) |
| D1 | Integration | `GET /directory` | Chỉ `id`, `name` của tổ chức công khai, chưa lưu trữ, mình chưa thuộc | Có (`server/test/projectRequests.test.ts`) |
| D2 | Integration | Supervisor/surveyor `PATCH P/settings`; Owner | `403`; `200` và tổ chức hiện/ẩn ở D1 | Có (`server/test/members.test.ts` kiểm quyền và cột `public`; vế hiện/ẩn ở D1 trong `server/test/projectRequests.test.ts`) |
| M1 | Integration | Supervisor thêm surveyor bằng tên đăng nhập; thêm supervisor | `201`; `403 forbidden` | Có (`server/test/members.test.ts`) |
| M2 | Integration | Owner thêm supervisor, Owner; tên không có; người đã là thành viên | `201`; `404`; `409 already_member` | Có (`server/test/members.test.ts`) |
| M3 | E2E | Owner thêm người bằng tên đăng nhập → sau một vòng đồng bộ người đó thấy tổ chức, gửi được phiếu | Như T6 | TV1-15 |

**Cách ly dự án và thay đổi thành viên:** ca T1–T10 ở [ADR 0002](adr/0002-multi-tenancy.md#kiểm-chứng) (T1–T5 integration, T6–T10 E2E). Fixture chung: hai dự án, ba người dùng (một chỉ ở dự án A, một ở cả hai với vai trò khác nhau, một admin không là thành viên). Đã có test integration cho T1–T4 trong `server/test/records.test.ts` (T3 trùng A2), T4 có thêm ca admin không là thành viên đọc form, phiếu trong `server/test/admin.test.ts` và ca sau khi duyệt yêu cầu (Q7); T5 chưa làm. E2E T7, T8, T9 và hạ vai trò có trong `client/e2e/membership.spec.ts`; màn hình Thành viên (thêm, lỗi, đổi vai trò, rút, `last_owner`, tự hạ, quyền supervisor, cài đặt tổ chức, offline) ở `client/e2e/members.spec.ts`; T7 kiểm cả banner, file Xuất JSON và "Xoá khỏi máy" (TV1-06). Bộ chọn dự án và đổi dự án offline ≤ 1 s (§11.2) ở `client/e2e/project-switcher.spec.ts`; T6 và T10 đầy đủ (mỗi dự án form và phiếu riêng, offline đổi qua lại) ở `client/e2e/projects.spec.ts`.

**API kiểm thử** (chỉ đăng ký khi `ENABLE_TEST_ROUTES=1`, file `server/src/routes/faults.ts`):

| Method | Đường dẫn | Thân / kết quả |
|---|---|---|
| POST | `/api/__test/faults` | `{ "mode", "count", "match"?, "chunkIndex"? }`: `count` request khớp tiếp theo bị lỗi |
| DELETE | `/api/__test/faults` | Tắt mọi lỗi đang chờ |
| GET | `/api/__test/stats` | `{ "requests": [{ "method", "path", "idempotencyKey"?, "status" }] }`: nhật ký request kể từ lần reset. `path` không gồm query; `status: 0` là kết nối bị cắt, client không nhận được response |
| DELETE | `/api/__test/stats` | Xoá nhật ký |
| PUT | `/api/__test/memberships/:projectId/:userId` | `{ "role": "surveyor" \| "supervisor" \| "owner" }`: thêm hoặc đổi vai trò, không cần token (E2E T7–T9). Có code, nhận cả `"owner"` |
| DELETE | `/api/__test/memberships/:projectId/:userId` | Rút khỏi dự án. Có code |
| PUT | `/api/__test/projects/:projectId` | `{ "name" }`: tạo dự án (không công khai, chưa có thành viên) nếu chưa có, có rồi thì đặt lại tên; `200 { id, name }`, id hoặc tên sai `400`. Thay `POST /admin/projects` đã bỏ, vì E2E cần đặt id `b-…` để dự án đứng trước `demo-…` trong `/me`. Có code (TV2-15) |
| POST | `/api/__test/seed-perf` | `{ "projectId", "userId", "count" }`: thêm `count` (1–20.000) phiếu của form mẫu do `userId` tạo, ghi như `PUT` thật; `201 { count }`; thân sai `400`, không có dự án hoặc người dùng `404`. Cho bộ đo `client/e2e/perf` (TV2-11), cùng hàm với `npm run seed:perf` |

| `mode` | Hành vi | Dùng cho |
|---|---|---|
| `"500"` | Không vào handler, trả `500 { error: 'injected_fault' }` | R1 |
| `"400"` | Không vào handler, trả `400 { error: 'injected_fault' }` | R5 |
| `"timeout"` | Giữ request 15 s rồi mới cho vào handler | R2 |
| `"drop"` | Cho vào handler, handler ghi xong thì huỷ socket thay vì gửi response | R3 |
| `"drop-before"` | Huỷ socket trước khi vào handler (hành vi `drop` của khung hiện tại) | mất mạng thuần |

- `match`: tiền tố đường dẫn **sau** `/api/projects/:projectId`, mặc định `"/records"`. Ví dụ `"/attachments"` để tiêm lỗi vào upload ảnh.
- `chunkIndex`: chỉ áp lỗi cho `PUT .../chunks/<chunkIndex>`, phục vụ R4 (cắt ở chunk thứ 2 thì `chunkIndex: 1`).
- Nhật ký `stats` chỉ ghi request dưới `/api/projects/`; dùng để kiểm "đúng một PUT cho mỗi `opId`" (O6) và "mỗi chunk chỉ ghi một lần" (R4).
- Có code đủ bảng trên (TV3-10, `server/src/routes/faults.ts`; test `server/test/faults.test.ts`). Thân `POST /faults` sai (mode lạ, `count` âm, `match` không bắt đầu bằng `/`, `chunkIndex` không phải số nguyên ≥ 0) trả `400 invalid_body`.
- Khi thêm `mode` mới thì thêm vào bảng này cùng PR.

Playwright `context.setOffline(true|false)` để bật/tắt mạng. Các test chạy tuần tự (`workers: 1`) vì dùng chung server. Khi chạy local, Playwright dùng lại server đang chạy ở cổng 3001 nếu có (`reuseExistingServer`); tắt `npm run dev` trước khi chạy E2E để không ghi vào DB thật.

### 10.2 CI

GitHub Actions: `npm ci`, `npm run typecheck`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:e2e`. Lưu `playwright-report/` làm artifact khi fail.

## 11. Yêu cầu phi chức năng

### 11.1 Trình duyệt và thiết bị hỗ trợ

| Nền tảng | Tối thiểu | Ghi chú |
|---|---|---|
| Android, Chrome | 120 | Nền tảng chính cho điều tra viên; thiết bị tham chiếu: máy tầm trung 3 GB RAM |
| iOS/iPadOS, Safari | 16.4 | Phải "Thêm vào màn hình chính" (§13); `storage.persist()` chỉ có từ 17 |
| Máy tính, Chrome/Edge | 120 | Cho giám sát viên |
| Firefox, Safari macOS | best-effort | Không chạy E2E |

Các API bắt buộc: Service Worker, IndexedDB, `crypto.randomUUID`, Web Locks, `crypto.subtle` (SHA-256). Nếu trình duyệt thiếu, app hiện thông báo "Trình duyệt không được hỗ trợ" thay vì chạy sai: kiểm khi mở app (`client/src/browserSupport.ts`), thiếu thì không chạy đồng bộ, không mở IndexedDB, không đăng ký SW, và ghi tên API thiếu để người dùng chụp gửi nhóm. Service Worker và `crypto.subtle` chỉ có trên HTTPS hoặc `localhost`, nên mở bản dev qua `http://<IP LAN>` cũng ra màn hình này.

### 11.2 Chỉ tiêu

| Chỉ tiêu | Mục tiêu | Đo bằng |
|---|---|---|
| Mở app offline (đã cài) tới khi nhập được | ≤ 3 s trên thiết bị tham chiếu | Playwright, CPU throttle 4× |
| Lưu một phiếu | ≤ 200 ms | Playwright |
| Danh sách 2.000 phiếu | Cuộn mượt, hiển thị ≤ 1 s | Hiển thị: Playwright (`client/e2e/perf/pull.spec.ts`, [perf.md](perf.md)); cuộn mượt: thủ công, chưa thử |
| Đồng bộ 100 phiếu không ảnh | ≤ 10 s ở mạng "Slow 3G" | Playwright network throttle |
| Đồng bộ 50 ảnh đã nén | ≤ 3 phút ở mạng 3G (1,6 Mbps) | Playwright network throttle |
| Pull lần đầu 5.000 phiếu (supervisor) | ≤ 30 s | Seed (`seed:perf`) + Playwright (`client/e2e/perf/pull.spec.ts`, [perf.md](perf.md)); truy vấn theo index có test `server/test/queryPlan.test.ts` |
| Dung lượng mỗi máy | Thiết kế cho tổng 2.000 phiếu + 500 ảnh (khoảng 250 MB) trên mọi dự án | `storage.estimate()` |
| Đổi dự án (đã tải) | ≤ 1 s, kể cả offline | Playwright (`project-switcher.spec.ts` với ít dữ liệu; `perf/pull.spec.ts` với 2.000 phiếu, [perf.md](perf.md)) |
| Số dự án mỗi người dùng | Tối đa 10 | Thiết kế |
| Kích thước ảnh sau nén | ≤ 600 KB | E2E `photo.spec.ts` (canvas chỉ có trong trình duyệt); unit test `fitWithin` |

## 12. Triển khai

- **Một tiến trình Node** phục vụ API; bản build client (`client/dist`) do reverse proxy phục vụ, cùng origin với `/api` (không cần CORS ở production).
- **HTTPS:** demo trên điện thoại thật cần HTTPS. Từ tuần 2 có môi trường staging: VPS hoặc máy nhóm, Caddy tự cấp chứng chỉ, hoặc Cloudflare Tunnel. Phụ trách: TV1 (xem team-plan).

**Biến môi trường (server)**

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3001` | Cổng API |
| `DB_PATH` | `data/survey.db` | File SQLite; `:memory:` cho test |
| `UPLOAD_DIR` | `uploads` | Thư mục ảnh (con theo `projectId`) |
| `PUBLIC_BASE_URL` | `http://localhost:3001` | Gốc URL ảnh trong CSV |
| `CORS_ORIGIN` | (không đặt = tắt CORS) | Origin được phép khi client và API khác origin (dev) |
| `ENABLE_TEST_ROUTES` | không đặt | `1` để bật `/api/__test/*` |

**Lệnh quản trị (CLI, chạy trên server)** (ADR 0003 §1, TV3-12)

Người dùng thường tự tạo tài khoản trên app; CLI để tạo admin và hỗ trợ. `--user` nhận tên đăng nhập (tài khoản tạo trước migration 4 có tên đăng nhập là `userId`).

| Lệnh | Tác dụng |
|---|---|
| `npm run user:add -w server -- --username dang --name "Đăng" [--admin]` | Tạo tài khoản, in mật khẩu tạm (12 ký tự chữ và số, không có `0 O 1 l I`) và `userId` **một lần**. Dùng để tạo admin đầu tiên |
| `npm run user:reset-password -w server -- --user <username>` | In mật khẩu tạm mới một lần; không thu hồi phiên đang có |
| `npm run user:revoke-sessions -w server -- --user <username>` | Thu hồi mọi phiên (mất máy) |
| `npm run user:disable -w server -- --user <username>` | Khoá tài khoản và thu hồi mọi phiên (mọi request nhận `401`) |
| `npm run seed:demo -w server` | Tạo hai dự án mẫu `demo-yte`, `demo-nongnghiep`; tài khoản `lan`, `minh`, `admin`, `chu` (Owner cả hai dự án) mật khẩu `demo-password`. Tới khi TV1-14/TV2-16 xong, mỗi tài khoản demo còn một phiên token cố định `demo-token-<tên>` vì màn hình đăng nhập vẫn nhận mã. Từ chối khi `NODE_ENV=production` |
| `npm run seed:perf -w server -- --project <id> --user <username> [--count 5000]` | Thêm phiếu mẫu vào một dự án có sẵn để đo hiệu năng ([perf.md](perf.md)); ghi như `PUT` thật trong một transaction. Từ chối khi `NODE_ENV=production` |
| ~~`user:rotate-token`~~ | Đã bỏ (không còn token theo người dùng) |

- **Sao lưu:** mỗi ngày chạy `VACUUM INTO 'backup/survey-<ngày>.db'` và sao chép thư mục `uploads/`; giữ 7 bản.
- **Migration CSDL server:** đánh số trong `db.ts` (`PRAGMA user_version`), chỉ thêm cột/bảng, không sửa câu lệnh cũ. Ngoại lệ đã được nhóm chấp nhận: migration 2 (tạo lại bảng dữ liệu, ADR 0002) và migration 4 (tạo lại `memberships` có chép dữ liệu, ADR 0003 §5).
- 🆕 **Trang quản trị** `/admin/` được build cùng `client/dist`; Caddy phục vụ như file tĩnh; TV1-16 phải kiểm tra `/admin/` không bị `try_files` đưa về `/index.html` của PWA (sửa Caddyfile nếu cần) và cập nhật [deploy.md](deploy.md).

## 13. Rủi ro và hạn chế

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Safari/iOS xoá IndexedDB sau 7 ngày không dùng (ITP) nếu không cài PWA | Mất phiếu chưa đồng bộ | Hướng dẫn "Thêm vào màn hình chính"; `storage.persist()`; cảnh báo khi có op tồn lâu |
| Người dùng xoá dữ liệu trình duyệt, gỡ app hoặc đổi máy khi còn phiếu chưa gửi | Mất phiếu chưa đồng bộ | Cảnh báo phiếu tồn > 24 giờ; nút "Xuất JSON" cho từng phiếu và cho toàn bộ phiếu chưa đồng bộ; tài liệu người dùng nhắc đồng bộ trước khi đổi máy |
| iOS không có Background Sync | Chỉ đồng bộ khi app đang mở | Đồng bộ khi mở app và khi `online`; nhãn trạng thái rõ ràng |
| Dung lượng IndexedDB hạn chế trên máy yếu | Không lưu được ảnh | Nén ảnh; hiển thị dung lượng; dọn ảnh đã lên server; chỉ pull phiếu của mình (§5.5) |
| Đồng hồ thiết bị sai | Thời gian hiển thị sai | Server tự gán `updatedAt`; pull dùng `seq`, không dùng giờ |
| Đổi schema form làm vỡ phiếu cũ | Phiếu không mở được | Phiên bản hoá form, cấm đổi `id`/`type`, xoá trường bằng `hidden`, server validate so với bản trước |
| Hai giám sát viên cùng sửa một form | Thay đổi nhãn/thứ tự của người lưu trước bị bản sau ghi đè | Chấp nhận (nhóm chốt khi làm TV1-04): bản lưu sau thành version mới; server vẫn từ chối nếu bản sau làm mất trường hoặc lựa chọn của bản trước, nên dữ liệu phiếu không mất |
| Nhiều tab cùng đồng bộ | Request trùng, race khi cập nhật base | Web Locks (§5.3); idempotency vẫn đảm bảo không ghi trùng |
| Hai điều tra viên cùng đến một hộ | Hai phiếu trùng nghiệp vụ | Chấp nhận; giám sát viên lọc khi xuất (hệ quả của §5.5) |
| Một truy vấn quên lọc `project_id` | Lộ dữ liệu giữa các tổ chức | Lớp truy cập bắt buộc `ctx`; `projectId` chỉ từ đường dẫn; test T5 duyệt mọi route; review hai người cho code server |
| Bị rút khỏi dự án khi còn phiếu chưa gửi | Phiếu không lên được | Không tự xoá; banner và nút Xuất JSON (ADR 0002 §6) |
| Lộ token (mất máy) | Người khác đọc dữ liệu các dự án của người đó | `user:revoke-sessions` / `user:disable`; token chỉ lưu hash ở server |
| 🆕 Đăng ký hàng loạt, đoán mật khẩu | Tài khoản rác, chiếm tài khoản | Giới hạn tần suất (§7.1 `429`), `scrypt`; mở tổ chức phải qua admin duyệt |
| 🆕 Người vận hành tò mò dữ liệu khách hàng | Lộ dữ liệu khảo sát | Admin không là thành viên tổ chức nào (`409 admin_account`), mọi `P/...` trả `403` (T4, Q7); trang quản trị không có đường tới dữ liệu |
| Phạm vi quá rộng với 3 người (thêm multi-tenancy) | Trễ tiến độ | Ưu tiên: sync và conflict > cách ly dự án > ảnh > export > builder; đã cắt kéo thả, so sánh ảnh, ZIP |

## 14. Câu hỏi mở

**Đã chốt** (ngày chốt ghi ở từng dòng; các dòng không ghi là 2026-10-07)

| Câu hỏi | Quyết định |
|---|---|
| Giám sát viên dùng giao diện nào? | Chính PWA, màn hình hiện theo vai trò (§2). 🆕 Admin dùng trang quản trị riêng `/admin/` (ADR 0003, 2026-10-12) |
| Phạm vi pull của điều tra viên? | Chỉ phiếu mình tạo (§5.5); giao việc theo khu vực để sau MVP |
| Export ZIP kèm ảnh? | Không trong MVP; CSV có URL ảnh |
| Nhiều tài khoản trên một máy? | Không; một tài khoản có nhiều dự án (ADR 0002) |
| Cấp và thu hồi token? | 🕘 CLI trên server, lưu hash trong `users` (§12). 🆕 Thay bởi P9: tài khoản tự tạo, phiên theo máy trong `sessions` |
| Phục vụ nhiều nhóm thế nào? | Nhiều tổ chức tách biệt trên một hệ thống, đơn vị cách ly là dự án (ADR 0002) |
| Luật validate phiếu (P4)? | Theo bảng §4.1: text bỏ khoảng trắng hai đầu rồi mới xét; ảnh bắt buộc chỉ cần có trên máy, chưa upload không làm phiếu thành nháp (Dương, 2026-10-09) |
| Trình bày danh sách phiếu (P7)? | Nhóm theo form; lọc theo trạng thái, supervisor lọc thêm theo người tạo; tìm theo tiêu đề (§4.8; Dương, 2026-10-09) |
| `ServerRecord` có tên người tạo/sửa không (P1)? | Có: thêm `createdBy`, `createdByName`, `updatedByName`, lịch sử thêm `updatedByName`, để màn hình xung đột hiện tên cả khi offline (§6.2; nhóm, 2026-10-10) |
| Định dạng `GET /api/me` (P2)? | Theo §7; dự án bị rút biến khỏi danh sách (nhóm, 2026-10-10) |
| Phân trang pull (P3)? | Có `hasMore`, client lưu cursor sau mỗi trang (§7; TV2 chốt, 2026-10-10) |
| Nhập mã người khác khi còn phiếu chưa gửi (P5)? | Từ chối, chỉ cho xuất JSON (§4.7; nhóm, 2026-10-10) |
| Xoá phiếu (P6)? | Xoá hẳn nếu chưa thể tới server, tombstone nếu có thể đã tới (§5.7). Phân công: TV2-13 (logic và đồng bộ, Hoàng), TV1-13 (nút xoá và hộp xác nhận, Dương) (nhóm, 2026-10-10) |
| API kiểm thử chung (P8)? | Một API dùng chung gồm `match`, `chunkIndex`, `400`, `stats` (§10.1); không ticket nào tự thêm mode riêng vào `faults.ts` (TV2 và TV3, 2026-10-10) |
| Tài khoản, Owner, trang quản trị (P9)? | Theo [ADR 0003](adr/0003-accounts-and-owner-role.md), chấp nhận 2026-10-12 (PR #21). Spec đã cập nhật với nhãn 🆕/🕘; ticket nhóm "Theo ADR 0003" ở [plan/](plan/README.md) |

**Đề xuất đã chốt (lưu lại nội dung gốc)**

| # | Đề xuất | Người đề xuất | Chi tiết |
|---|---|---|---|
| P9 | Tự tạo tài khoản (tên đăng nhập + mật khẩu, mỗi máy một phiên); tổ chức công khai chỉ hiện tên trong danh sách, không có xin tham gia; giám sát viên/Owner thêm người bằng tên đăng nhập; thêm vai trò `owner` (người đứng ra tạo tổ chức và sở hữu dữ liệu: sửa form, chỉ định giám sát viên, bật/tắt công khai); người dùng gửi yêu cầu mở tổ chức, admin (người kiểm soát app) duyệt; admin không xem được dữ liệu tổ chức và có trang quản trị riêng `/admin/`; một tài khoản thuộc được nhiều tổ chức với vai trò khác nhau. Thay thế một phần ADR 0002 §2, §7 | Hoàng, 2026-10-12 | [ADR 0003](adr/0003-accounts-and-owner-role.md); đã chấp nhận (PR #21) |

**Còn mở**

1. Nhóm lĩnh vực đầu tiên dùng thử là ai, form mẫu gì? Cần để làm dự án demo thật thay cho `demo-yte`/`demo-nongnghiep`.
2. Các lĩnh vực cần thêm loại trường nào (có/không, văn bản dài, min/max, điều kiện hiện trường đơn giản)? Mỗi loại cần cập nhật §4.1 và kiểm tra merge (ADR 0001 quy tắc 5).

## 15. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Dự án (project)** | Đơn vị cách ly dữ liệu: một nhóm/tổ chức với form, phiếu, ảnh, thành viên riêng |
| **Thành viên (membership)** | Quan hệ người dùng – dự án kèm vai trò `surveyor` hoặc `supervisor` (🆕 hoặc `owner`) |
| **Owner** 🆕 | Người đứng ra mở tổ chức (yêu cầu được admin duyệt) và sở hữu dữ liệu của nó; vai trò cao nhất trong tổ chức |
| **Admin** | Người kiểm soát app (nhóm phát triển), cờ `is_admin`. 🆕 Dùng trang quản trị riêng, không là thành viên và không xem được dữ liệu tổ chức nào |
| **Phiên (session)** 🆕 | Token cấp cho một máy sau khi đăng nhập; mỗi máy một phiên, không tự hết hạn |
| **Yêu cầu mở tổ chức** 🆕 | Đơn người dùng gửi để mở tổ chức mới; admin duyệt thì tổ chức được tạo và người gửi thành Owner |
| **Phạm vi (scope)** | Phần dữ liệu trong dự án mà người dùng được thấy: `own` (phiếu mình tạo) hoặc `all` |
| **Phiếu / bản ghi (record)** | Một lần điền form, định danh bằng UUID tạo ở client, thuộc đúng một dự án |
| **Op** | Một thao tác chờ gửi trong outbox (tạo/sửa/xoá phiếu), có `opId` |
| **Outbox** | Hàng đợi op bền vững trong IndexedDB |
| **Idempotency key** | `opId` gửi qua header; gửi lại cùng key thì server trả kết quả cũ, không ghi thêm |
| **Replay** | Server trả lại response đã lưu cho một key đã thấy (header `Idempotent-Replayed: true`) |
| **Version** | Số phiên bản phiếu do server cấp, tăng 1 mỗi lần ghi |
| **Base** (`baseData`, `baseVersion`) | Dữ liệu và version lần cuối client và server thống nhất; gốc của three-way merge |
| **Three-way merge** | So sánh base, bản của máy (local) và bản server (remote) theo từng trường |
| **Conflict trường** | Cùng một trường bị cả hai bên sửa thành giá trị khác nhau |
| **Conflict mức bản ghi** | Một bên xoá, bên kia sửa |
| **Tombstone** | Phiếu đã xoá nhưng vẫn giữ trên server (`deleted = 1`) để máy offline lâu vẫn biết |
| **Cursor / `seq`** | Số thứ tự thay đổi toàn cục; client lưu cursor để pull phần mới |
| **Nháp (draft)** | Phiếu lưu cục bộ chưa hợp lệ, không đồng bộ |
| **Backoff** | Khoảng chờ tăng dần giữa các lần retry |
