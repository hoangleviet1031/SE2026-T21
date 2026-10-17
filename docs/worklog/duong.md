# Worklog – Dương (TV1)

Quy ước ở [README.md](README.md).

## Việc mở

| Việc | Chặn bởi | Ghi chú |
|---|---|---|
| TV1-13: nút xoá phiếu và hộp xác nhận | TV2-13 (Hoàng) | design §5.7 |

## Nhật ký

| Ngày | Ticket | Loại | Việc đã làm | Ref | Trạng thái |
|---|---|---|---|---|---|
| 2026-10-17 | TV1-08 | feat | Phần 1: API `P/members` (thêm bằng tên đăng nhập, đổi vai trò, rút, `last_owner`, `admin_account`) và `PATCH P/settings`; test M1, M2, A6, A7, Q9, D2 | nhánh `feat/tv1-08-members-api` | chờ review |
| 2026-10-16 | TV1-10 | feat | Phần 2: Xuất/Nhập form JSON trong builder (nhập nạp vào builder thành form mới), form mới trùng mã báo "Mã biểu mẫu đã có trong dự án", `parseSaveFormRequest` chuyển sang shared; unit `formFile.test.ts`, `builder.test.ts`; E2E `form-import-export.spec.ts` | PR #33, design §4.1, §8 | xong |
| 2026-10-16 | TV1-10 | feat | Phần 1: trường ẩn không hiện ở phiếu mới, có giá trị thì hiện chỉ đọc; vòng đồng bộ tải bản form phiếu đang dùng mà máy chưa có, trang điền phiếu báo "Cần kết nối để mở phiếu này"; trường ẩn sai định dạng mở cho sửa; unit `formDisplay.test.ts`, E2E `form-version.spec.ts` | PR #32, design §4.1, §5.3, §8 | xong |
| 2026-10-14 | TV1-07 | feat | Phần 2b bổ sung: Đăng xuất xoá cache runtime `me`, `forms` của SW, giữ precache; tên cache dùng chung `swCaches.ts`; E2E trong `settings.spec.ts` | PR #28, design §4.7 | xong |
| 2026-10-14 | TV1-07 | feat | Phần 2b: màn hình "Trình duyệt không được hỗ trợ" khi thiếu API bắt buộc, `storage.persist()` sau khi lưu phiếu, hướng dẫn cài ở Cài đặt; unit + E2E | PR #28, design §4.2, §11.1 | xong |
| 2026-10-14 | TV1-07 | feat | Phần 2a: SW `prompt` + dải "Có phiên bản mới" (hỏi khi đang nhập phiếu), icon PNG/`apple-touch-icon`, runtime cache theo dự án, `/admin/` không qua SW; E2E `update.spec.ts` | PR #27, design §4.3 | xong |
| 2026-10-13 | TV1-04 | fix | Gọn UI sau khi thử staging: màu link, header 360px, builder bấm cả dòng/▲▼/gợi ý, "← Quay lại" ở trang điền phiếu, câu hướng dẫn Cài đặt theo ngữ cảnh; E2E `fill.spec.ts` | PR #26 | xong |
| 2026-10-13 | TV1-03 | fix | Mã form được có dấu `-`: form mẫu `household-survey` trước đây không lưu được bản mới từ builder; mã trường giữ luật cũ; test shared + server | PR #25 | xong |
| 2026-10-13 | TV1-04 | feat | Form builder `#/builder/<id>`, `#/builder/new`: 7 loại trường, lên/xuống, mã gợi ý từ nhãn, ẩn/xoá trường mới, xem trước, lưu bản mới qua `saveForm`; E2E `builder.spec.ts` | PR #24 | xong |
| 2026-10-13 | TV1-06 | feat | Bộ chọn dự án (vai trò, số đếm, "Đã rời", đổi offline ≤ 1 s), bỏ mặc định `demo-yte`, màn hình chưa có dự án, banner bị rút có Xuất JSON/Xoá khỏi máy; E2E `project-switcher.spec.ts`, T7 đủ | PR #23 | xong |
| 2026-10-12 | TV1-03 | feat | `validateFormSchema` trong `shared/` (id trường/form, option, so với bản trước) + 20 unit test; `POST P/forms` chỉ giám sát viên, version tự tăng trong transaction, `invalid_body`/`invalid_form`; 15 integration test gồm A3; thêm `SaveFormRequest`, design 0.4.14 | PR #19 | xong |
| 2026-10-12 | TV1-07 | feat | Phần 1: trang Cài đặt `#/settings` (tên, `userId`, dung lượng), Đăng xuất chỉ khi mọi dự án không còn dữ liệu chưa gửi, chạy trong Web Lock đồng bộ; lưu `me.user` vào `field-survey-account`; phác ui.md màn hình 8; E2E `settings.spec.ts`, unit `formatBytes` | PR #20 | xong |
| 2026-10-12 | TV1-05 | feat | Phiếu thiếu/sai lưu thành nháp, không tạo op, lỗi hiện dưới từng trường; engine giữ nháp sau push và pull không ghi đè nháp; E2E O5 | PR #17 | xong |
| 2026-10-12 | TV1-02 | fix | Nút trên iPhone trống chữ (Safari dùng màu chữ mặc định trùng nền trắng): đặt `color: inherit` cho `button` | PR #18 | xong |
| 2026-10-12 | TV1-01 | test | Cả 3 người cài app staging (Dương, Hoàng Android; Đại iPhone), tắt mạng mở lại vẫn chạy; iOS: icon chữ cái (thiếu PNG), nút "Tiếp tục" trống chữ | `feat/tv1-01-staging` | xong |
| 2026-10-12 | TV1-01 | feat | Staging HTTPS trên Azure + Caddy chạy `main`; `docs/deploy.md`, `scripts/deploy.sh` (sao lưu CSDL trước khi khởi động lại, kiểm `__test` 404). AI soạn tài liệu theo uỷ quyền của Dương | PR #12 | xong |
| 2026-10-11 | TV2-01, TV2-02, TV2-03 | review | Review nhánh lõi @7c5417a: typecheck, 109 test, 5 E2E xanh; SQL đều lọc `project_id`, `projectId` chỉ từ đường dẫn; 3 góp ý nhỏ (idempotency, `form_version`, `formId`) | `feat/tv2-multi-tenancy-core` | xong |
| 2026-10-10 | TV1-05 | feat | `validateRecord` trong `shared/` theo bảng §4.1 (7 loại trường, sai kiểu, ngày không tồn tại) + 45 unit test; thêm `FieldDef.hidden` | PR #7 | chờ review |
| 2026-10-10 | TV1-02 | feat | Màn hình nhập mã (stub): `auth.ts` get/set/clearToken trên bảng `meta`, chặn app khi chưa có mã, báo cần mạng khi offline; E2E `login.spec.ts`, `e2e/helpers.ts` `login()` | PR #6 | chờ review |
| 2026-10-10 | — | docs | Thêm ticket xoá phiếu TV2-13, TV1-13 và ca O7, O8; đưa bước ghi worklog vào CLAUDE.md, vibe-coding, mẫu PR | nhánh `docs/worklog-process` | chờ review |
| 2026-10-10 | — | docs | Chuyển P1, P2, P3, P5, P6, P8 sang "Đã chốt"; bỏ nhãn chờ chốt; design lên 0.4.1 | 702a666, PR #3 | xong |
| 2026-10-10 | — | quyết định | Nhóm chốt P1, P2, P3, P5, P6, P8 theo đề xuất | design §14 | xong |
| 2026-10-09 | — | docs | design lên 0.4: lấp chỗ hở spec (§3, §4.1, §4.7, §4.8, §5.7, §6.2, §7, §10.1); thêm `docs/ui.md`; thống nhất tên nhánh | bf2b577, PR #3 | xong |
| 2026-10-09 | — | quyết định | Chốt P4 (luật validate phiếu) và P7 (danh sách phiếu nhóm theo form, có bộ lọc) | design §14 | xong |
