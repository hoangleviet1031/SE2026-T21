# Worklog – Dương (TV1)

Quy ước ở [README.md](README.md).

## Việc mở

| Việc | Chặn bởi | Ghi chú |
|---|---|---|

## Nhật ký

| Ngày | Ticket | Loại | Việc đã làm | Ref | Trạng thái |
|---|---|---|---|---|---|
| 2026-10-23 | TV1-12 | feat | b1 trạng thái và chữ còn thiếu: trang chủ rỗng, "← Quay lại" ở Builder/Cài đặt, "Đang tải…" ở Tổ chức, báo lỗi GPS + chờ 30 s + "Đang lấy vị trí…" (trường GPS là nhóm), chữ phụ lúc đang gửi (`BusyNote`); E2E `gps-errors.spec.ts`, `ui-states.spec.ts`, ca đang gửi ở `api-errors.spec.ts`, unit `gps.test.ts`; tech-debt N10–N12; design 0.5.45, ui 0.2.17, requirements 0.3 | PR #69 | xong |
| 2026-10-22 | TV1-12 | fix | a3 lỗi lẻ: Xuất gặp mã lỗi không xử lý (vd. `404`) báo "Máy chủ đang lỗi, thử lại sau" thay vì "Xuất thất bại (mã N)" (design §8); E2E `api-errors.spec.ts` ca 404, `account.spec.ts` kiểm `export-note` "Đã tải 1 file." và ca không còn phiếu; ui.md 0.2.16 màn hình 1 bỏ câu "màn hình 9 chưa có" | PR #68 | xong |
| 2026-10-22 | TV1-19 | ops | Phần 3: bật sao lưu hằng ngày trên staging theo `deploy.md`: `UPLOAD_DIR` ra `~/survey-data/uploads` (0 ảnh, sửa unit bằng `sed`), timer `survey-backup` 03:00 giờ VN, chạy thử đạt (0.1 MB), kéo bản đầu về máy; `deploy.md` ghi kết quả + cách `sed`; N2 → Đã trả | PR #67 | xong |
| 2026-10-22 | TV1-19 | ops | Phần 2: diễn tập quay lại bản trước trên staging (8d93233 → f5dba4f → 8d93233), 19 s / 21 s; QS5 có số đo, `deploy.md` 2a thêm vòng chờ health và `git switch main`; N3 → Đã trả; design 0.5.43 | PR #64 | xong |
| 2026-10-22 | TV1-19 | docs | Phần 1: gỡ dòng IP tĩnh khỏi bảng máy trong `deploy.md` (giữ `azureuser`, tên miền) | PR #63 | xong |
| 2026-10-22 | TV1-12 | feat | a2: Thành viên, Tổ chức, builder lưu form, Xuất báo "Máy chủ đang lỗi, thử lại sau" khi 5xx (`ServerError`, `apiFailureText`); 401 về Đăng nhập kèm "Phiên đăng nhập hết hạn, đăng nhập lại" (N5); bỏ nhãn 🆕/🕘 ui.md (N4); server từ chối thêm tài khoản bị khoá (404); E2E `api-errors.spec.ts`; design 0.5.42, ui 0.2.15, requirements 0.2 | PR #62 | xong |
| 2026-10-22 | — | docs | Chia việc chưa ai nhận theo MVP: ticket TV1-19, TV2-18, TV2-19, TV3-13…TV3-16 (dòng Mức MoSCoW); TV1-12 chuyển tài liệu người dùng sang TV3-16, rà khả năng tiếp cận sang TV3-15; tech-debt trỏ ticket; design 0.5.41 §1; team-plan lộ trình tuần 8, thứ tự cắt | PR #61 | xong |
| 2026-10-22 | — | docs | Chỉnh tài liệu theo slide Lecture 01–05: design 0.5.37–0.5.39 (ghi lại chỗ cũ, vấn đề/giả định/MoSCoW, mâu thuẫn, kịch bản chất lượng, 3 góc nhìn kiến trúc, sở hữu dữ liệu); thêm requirements.md, tech-debt.md; deploy rollback; quy trình team-plan | PR #59 | xong |
| 2026-10-19 | TV1-12 | fix | Phần a1: mọi `window.confirm` → hộp trong app `ConfirmDialog` (Đăng xuất, đổi vai trò/rút, Tải lại, Xoá khỏi máy) + E2E đổi theo, ca Esc; hộp Xoá phiếu đóng khi phiếu thành xung đột (E2E); chữ "…và Owner…"; Xuất JSON khi bị từ chối báo kết quả; docs chữ cũ | PR #58 | xong |
| 2026-10-19 | TV1-07 | feat | Cài đặt hiện tên đăng nhập thay mã người dùng (ADR 0003); `accountUsername` dùng chung với màn hình Tổ chức (máy cũ chưa có username → userId) + unit; E2E `settings.spec.ts` đổi testid, thêm ca user cũ | PR #57 | xong |
| 2026-10-19 | TV1-16 | feat | Phần 2: A1 duyệt/từ chối (lý do bắt buộc), A2 khoá/mở + Đổi Owner, "Yêu cầu (n)"; lỗi API admin (401/403 về đăng nhập, 5xx, mất mạng); denylist SW khớp `/admin`; E2E Q10 đủ; deploy.md Caddyfile có khối `/admin/*` | PR #56 | xong |
| 2026-10-19 | TV1-16 | feat | Phần 1: khung trang quản trị `/admin/` (Vite hai trang, đăng nhập admin bằng `sessionStorage`, tài khoản thường bị từ chối, Đăng xuất; precache và manifest không có trang admin); E2E Q10 một phần | PR #55 | xong |
| 2026-10-19 | TV1-15 | feat | Màn hình Tổ chức (danh bạ, mở tổ chức mới, yêu cầu của mình, Huỷ), trang chủ khi chưa thuộc tổ chức nào, "Tổ chức khác…" ở bộ chọn; E2E Q8, M3 | PR #54 | xong |
| 2026-10-19 | TV1-14 | feat | Màn hình Đăng nhập / Tạo tài khoản thay màn hình nhập mã; kiểm form ở `loginForm.ts` + unit; Xuất JSON khi bị từ chối đổi tài khoản; E2E U7, Q11 qua màn hình mới | PR #53 | xong |
| 2026-10-19 | — | test | E2E T10 chờ cả form của hai dự án về máy rồi mới offline (vòng đồng bộ tải phiếu trước form), hết chập chờn khi chạy cả bộ | PR #52 | xong |
| 2026-10-17 | — | fix | Vòng đồng bộ: `syncNow()` gọi lúc đang chạy thì chạy thêm đúng một vòng (`coalesce.ts` + unit), bỏ `syncAfterChange`; sửa E2E O8 kẹt "Chờ đồng bộ" (trước 5/30 hỏng, sau 30/30) | PR #46, design §5.3 | xong |
| 2026-10-17 | TV1-17 | feat | Phần 2: phiếu trên máy lưu `createdBy`, `createdByName` theo server; màn hình xung đột hiện tên người sửa; surveyor không thấy "Xoá phiếu" ở phiếu người khác tạo (`canDeleteRecord` + unit); E2E `record-owner.spec.ts`, `conflict.spec` kiểm tên | PR #45, design §5.7, §6.2 | xong |
| 2026-10-17 | TV1-17 | feat | Phần 1: `ServerRecord` thêm `createdBy`, `createdByName`, `updatedByName`, lịch sử thêm `updatedByName`; server ghép tên từ `users` lúc đọc (pull, PUT, 409, history); integration `recordNames.test.ts`; thêm mục ticket TV1-17 | PR #44, design §6.2 | xong |
| 2026-10-17 | TV1-11 | test | E2E O2 (mở app đã cài khi offline từ đầu, 10 phiếu), O4 (đóng tab khi còn op) trong `offline-install.spec.ts`; T6 (được thêm vào dự án mới), T10 (offline đổi qua lại hai dự án) trong `projects.spec.ts`; không sửa code app | PR #43, design §10.1 | xong |
| 2026-10-17 | TV1-13 | feat | Hộp xác nhận xoá phiếu trong app (`ConfirmDialog`, `<dialog>` + Esc = Huỷ) thay `window.confirm`, giữ câu chữ §5.7; E2E O7 bấm nút trong hộp thoại (thêm Esc), `conflict.spec` đổi cách bấm xoá | PR #42 | xong |
| 2026-10-17 | TV1-08 | feat | Phần 2: màn hình Thành viên (thêm, đổi vai trò, rút, tên và công khai tổ chức cho Owner), thêm `GET P/settings`, Owner thấy Sửa form; E2E members.spec | PR #39 | xong |
| 2026-10-17 | TV1-08 | feat | Phần 1: API `P/members` (thêm bằng tên đăng nhập, đổi vai trò, rút, `last_owner`, `admin_account`) và `PATCH P/settings`; test M1, M2, A6, A7, Q9, D2 | PR #38 | xong |
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
