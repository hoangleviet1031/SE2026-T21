# Yêu cầu: user story, tiêu chí chấp nhận và truy vết

- **Phiên bản:** 0.3 (2026-10-23)
- **Liên quan:** vấn đề, kết quả mong muốn và phạm vi ở [design.md §1](design.md#1-mục-tiêu-và-phạm-vi); người dùng, mâu thuẫn và kịch bản ở [§2](design.md#2-người-dùng-và-kịch-bản-chính); kịch bản chất lượng ở [§11.4](design.md#114-kịch-bản-chất-lượng); mã test ở [§10.1](design.md#101-ma-trận-e2e-bắt-buộc) và [ADR 0002](adr/0002-multi-tenancy.md#kiểm-chứng).

File này nối **vấn đề → kết quả → story → tiêu chí → test → ticket/PR**, để mỗi người trả lời được "yêu cầu này vì sao có và repo chứng minh nó ở đâu" (Lecture 03). Spec chi tiết vẫn ở design.md; ở đây chỉ ghi hành vi người dùng thấy được.

Story viết **sau** khi phần lớn đã có code, để truy vết lại những gì đã làm, không phải yêu cầu mới. Người dùng và nhu cầu là **giả định** của nhóm, chưa phỏng vấn nhóm khảo sát thật (design §1 "Giả định", §14 câu 1).

**Quy ước:** `US-xx` là story; mã test như design §10.1. "Mức" theo MoSCoW ở design §1. Đổi hành vi thì sửa story và tiêu chí cùng PR với design.md, thêm dòng vào "Lịch sử" cuối file.

## Kết quả mong muốn (từ design §1)

| Mã | Kết quả | Story phục vụ |
|---|---|---|
| K1 | Không mất phiếu: mọi phiếu đã lưu trên máy lên server đúng một lần | US-01, US-02, US-03, US-04, US-06 |
| K2 | Không ghi đè âm thầm: hai nơi cùng sửa thì người dùng thấy và tự chọn | US-05, US-06 |
| K3 | Không phải nhập lại: giám sát viên có dữ liệu dạng bảng ngay từ app | US-07, US-08 |
| K4 | Không lẫn dữ liệu giữa các tổ chức, kể cả với người vận hành | US-09, US-10, US-11, US-12 |

## User story

### US-01 · Nhập phiếu khi không có mạng · Must

*Là điều tra viên, tôi muốn mở app và nhập phiếu khi không có mạng, để làm việc ở nơi không có sóng mà không phải ghi giấy rồi nhập lại.*

- **Given** app đã cài và đã mở một lần khi có mạng, **when** tôi mở app lúc không có mạng, **then** app mở được và tôi tạo được phiếu mới.
- **Given** tôi đã lưu 10 phiếu khi offline, **when** có mạng trở lại, **then** server có đủ 10 phiếu, mỗi phiếu version 1, và nhãn đổi thành "Đã đồng bộ".
- **Given** còn phiếu chưa gửi, **when** tôi đóng tab rồi mở lại, **then** phiếu vẫn còn và tự đồng bộ khi có mạng.

### US-02 · Lưu nháp khi phiếu chưa đủ · Must

*Là điều tra viên, tôi muốn lưu phiếu dù còn thiếu trường bắt buộc, để không mất phần đã nhập khi phải đi tiếp; giám sát viên thì muốn chỉ nhận phiếu đủ.*

- **Given** phiếu thiếu trường bắt buộc, **when** tôi bấm Lưu, **then** phiếu lưu với nhãn "Nháp", hiện danh sách lỗi và không lên server.
- **Given** phiếu nháp, **when** tôi sửa cho đủ rồi Lưu, **then** phiếu thành "Chờ đồng bộ" và lên server ở vòng đồng bộ kế tiếp.

### US-03 · Ảnh kèm phiếu lên đủ · Must

*Là điều tra viên, tôi muốn chụp ảnh và lấy GPS cho phiếu khi offline, và biết chắc ảnh đã lên server.*

- **Given** phiếu có 2 ảnh lưu khi offline, **when** có mạng, **then** cả 2 ảnh lên server với SHA-256 khớp, và nhãn hiện "Đang tải ảnh (2)" trước khi thành "Đã đồng bộ".
- **Given** đang tải một ảnh thì mất mạng, **when** có mạng lại, **then** chỉ gửi phần còn thiếu, mỗi phần chỉ ghi một lần.
- **Given** ảnh chụp 4–6 MB, **when** lưu vào phiếu, **then** ảnh sau nén ≤ 600 KB (trừ ảnh quá nhiều chi tiết, vẫn được lưu).
- **Given** chưa cho phép quyền vị trí (hoặc máy không lấy được vị trí trong 30 s), **when** bấm "Lấy vị trí", **then** thấy câu hướng dẫn (design §8) và giá trị trường không đổi.

### US-04 · Đồng bộ không trùng khi mạng hoặc server lỗi · Must

*Là điều tra viên, tôi muốn phiếu lên đúng một lần dù mạng chập chờn hay server lỗi, để giám sát viên không phải lọc trùng.*

- **Given** server trả 500 hai lần, **when** app thử lại, **then** server có đúng một bản ghi cho phiếu đó.
- **Given** server đã ghi nhưng kết nối bị cắt trước khi trả lời, **when** app gửi lại cùng `Idempotency-Key`, **then** server trả lại kết quả cũ, không ghi thêm.
- **Given** hai tab cùng mở, **when** cả hai đồng bộ, **then** mỗi thao tác chỉ được gửi từ một tab.
- **Given** server từ chối phiếu (`400`), **when** vòng đồng bộ chạy, **then** phiếu hiện "Lỗi", không thử lại vô hạn.

### US-05 · Xử lý khi hai nơi cùng sửa · Must

*Là điều tra viên hoặc giám sát viên, tôi muốn biết khi người khác cũng sửa phiếu tôi đang sửa, và tự chọn giá trị giữ lại thay vì để máy chọn hộ.*

- **Given** hai nơi sửa hai trường khác nhau, **when** đồng bộ, **then** phiếu tự gộp, không hỏi.
- **Given** hai nơi sửa cùng một trường khác giá trị, **when** đồng bộ, **then** màn hình xung đột hiện tên người sửa, giá trị trước đó, của tôi, trên máy chủ; không chọn sẵn; chọn xong thì server có bản gộp.
- **Given** phiếu đang xung đột, **when** tôi mở phiếu, **then** phiếu chỉ đọc, có banner dẫn tới màn hình xung đột.
- **Given** tôi đang chọn ở màn hình xung đột, **when** server đổi tiếp, **then** khác trường thì tự gộp, cùng trường thì hiện xung đột mới, lựa chọn đã áp dụng không mất.

### US-06 · Xoá phiếu an toàn · Must

*Là người tạo phiếu (hoặc giám sát viên), tôi muốn xoá phiếu nhập nhầm mà không làm mất phiếu người khác vừa sửa.*

- **Given** phiếu chưa từng gửi, **when** tôi bấm Xoá rồi Huỷ (hoặc Esc), **then** phiếu còn nguyên; xác nhận thì phiếu, op, ảnh biến khỏi máy và không có request nào lên server.
- **Given** phiếu đã đồng bộ, **when** tôi xoá, **then** server có `deleted: true`, máy khác pull thấy phiếu đã xoá.
- **Given** tôi xoá còn người khác sửa cùng phiếu (hoặc ngược lại), **when** đồng bộ, **then** app hỏi giữ hay xoá, nút Áp dụng khoá tới khi tôi trả lời.
- **Given** tôi là điều tra viên, **when** mở phiếu người khác tạo, **then** không có nút Xoá.

### US-07 · Tạo và sửa form an toàn · Must (xuất/nhập form: Could)

*Là giám sát viên hoặc Owner, tôi muốn tạo form cho lĩnh vực của mình và sửa form giữa đợt khảo sát mà phiếu cũ vẫn mở được.*

- **Given** tôi là supervisor hoặc Owner, **when** tạo form có đủ 7 loại trường rồi Lưu, **then** điều tra viên thấy form sau vòng đồng bộ kế tiếp.
- **Given** form đã có phiếu, **when** tôi thêm trường hoặc ẩn trường, **then** form lên version mới và phiếu cũ vẫn mở bằng version cũ.
- **Given** bản sửa đổi `type` hoặc bỏ trường cũ, **when** lưu, **then** server từ chối `400 invalid_form`.
- **Given** tôi là điều tra viên, **when** gọi lưu form, **then** `403 forbidden`.

### US-08 · Xuất dữ liệu · Must (CSV), Should (JSON)

*Là giám sát viên hoặc Owner, tôi muốn xuất phiếu của tổ chức ra CSV mở được bằng Excel, để tổng hợp mà không phải nhập lại.*

- **Given** dự án có phiếu tạo bằng form v1 và v2, **when** xuất CSV, **then** cùng nằm trong một file, cột khớp đúng, tiếng Việt không lỗi font.
- **Given** ô chữ bắt đầu bằng `=`, `+`, `-`, `@`, **when** xuất CSV, **then** ô được thêm tiền tố để Excel không chạy công thức.
- **Given** tôi là điều tra viên, **when** gọi xuất, **then** `403 forbidden`.

### US-09 · Một người, nhiều tổ chức, không lẫn dữ liệu · Must

*Là người làm cho hai tổ chức với vai trò khác nhau, tôi muốn đổi qua lại kể cả khi offline mà không thấy lẫn dữ liệu.*

- **Given** tôi thuộc tổ chức A và B, **when** đổi tổ chức khi offline, **then** đổi trong ≤ 1 s, mỗi bên chỉ thấy form và phiếu của mình.
- **Given** tôi không thuộc tổ chức B, **when** gọi bất kỳ API nào của B, **then** không route nào trả `2xx`; id thuộc tổ chức khác trả `404`.
- **Given** tôi bị rút khỏi tổ chức khi còn phiếu chưa gửi, **when** đồng bộ, **then** phiếu không bị xoá, có banner kèm "Xuất JSON" và "Xoá khỏi máy" (hỏi xác nhận).

### US-10 · Tự tạo tài khoản và mở tổ chức · Must

*Là khách hàng mới, tôi muốn tự tạo tài khoản và gửi yêu cầu mở tổ chức, để bắt đầu mà không phải chờ nhóm phát triển tạo tay.*

- **Given** tên đăng nhập chưa có, **when** tôi tạo tài khoản, **then** tôi đăng nhập luôn; tải lại trang vẫn đăng nhập.
- **Given** tên đã có (khác hoa thường), **when** tạo tài khoản, **then** `409 username_taken`, báo "Tên đăng nhập đã có người dùng".
- **Given** sai mật khẩu 11 lần trong 15 phút, **when** đăng nhập lần nữa, **then** `429` kể cả mật khẩu đúng.
- **Given** phiên của máy bị thu hồi, **when** app gọi server, **then** về màn hình Đăng nhập với "Phiên đăng nhập hết hạn, đăng nhập lại", dữ liệu trên máy giữ nguyên.
- **Given** tôi gửi yêu cầu mở tổ chức và admin duyệt, **when** vòng đồng bộ kế tiếp, **then** tôi thấy tổ chức với vai trò Owner và tạo được form.

### US-11 · Quản lý thành viên · Must

*Là Owner hoặc giám sát viên, tôi muốn thêm người vào tổ chức bằng tên đăng nhập và đổi vai trò, mà không để tổ chức mất người quản lý.*

- **Given** tôi là supervisor, **when** thêm điều tra viên bằng tên đăng nhập, **then** `201`; thêm giám sát viên thì `403 forbidden`.
- **Given** tôi là Owner, **when** thêm người đã là thành viên hoặc tên không có (kể cả tài khoản bị khoá), **then** `409 already_member` hoặc `404`.
- **Given** tổ chức chỉ còn một Owner, **when** rút hoặc hạ Owner đó, **then** `409 last_owner`.
- **Given** tôi vừa được thêm, **when** vòng đồng bộ kế tiếp, **then** tôi thấy tổ chức và gửi được phiếu.
- **Given** máy chủ lỗi (`5xx`), **when** tôi mở hoặc thao tác ở Thành viên, **then** báo "Máy chủ đang lỗi, thử lại sau" (khi tải có nút "Thử lại"), không kẹt ở "Đang tải…".

### US-12 · Admin duyệt tổ chức mà không xem dữ liệu · Must (màn hình Tài khoản A3: Could)

*Là khách hàng, tôi muốn chắc rằng người vận hành app không đọc được dữ liệu khảo sát của tổ chức mình; người vận hành vẫn cần duyệt tổ chức và hỗ trợ khi mất tài khoản Owner.*

- **Given** admin đã duyệt tổ chức, **when** admin gọi `P/forms`, `P/records`, **then** `403 not_member`; admin không là thành viên tổ chức nào.
- **Given** tài khoản admin, **when** đăng nhập vào app khảo sát, **then** báo "Tài khoản quản trị dùng trang /admin", không tạo CSDL nào.
- **Given** tài khoản thường, **when** đăng nhập `/admin/`, **then** bị từ chối và phiên vừa cấp bị huỷ; trang admin không dùng IndexedDB.
- **Given** admin, **when** từ chối yêu cầu mà không ghi lý do, **then** `400 invalid_body`.

## Truy vết

Mỗi dòng: tiêu chí (theo thứ tự gạch đầu dòng trong story) → test chứng minh → ticket và PR. Chỗ **chưa có test** in đậm; thêm test thì sửa dòng đó.

| Story | Tiêu chí | Test | Ticket / PR |
|---|---|---|---|
| US-01 | Mở và nhập khi offline | O1 `offline.spec.ts` | khung ban đầu |
| US-01 | 10 phiếu offline lên đủ, version 1 | O2 `offline-install.spec.ts` | TV1-11 (#43) |
| US-01 | Đóng tab vẫn đồng bộ | O4 `offline-install.spec.ts` | TV1-11 (#43) |
| US-02 | Nháp không lên server; sửa đủ thì đồng bộ | O5 `draft.spec.ts`; unit `shared/src/recordValidation.test.ts` | TV1-05 (#7, #17) |
| US-03 | Ảnh lên đủ, nhãn "Đang tải ảnh" trước "Đã đồng bộ" | O3 `upload.spec.ts` | TV3-06 (#37), TV3-10 (#40) |
| US-03 | Mất mạng giữa lúc tải ảnh | R4 `upload.spec.ts` | TV3-05 (#30), TV3-10 (#40) |
| US-03 | Ảnh sau nén ≤ 600 KB | `photo.spec.ts`; unit `fitWithin` (`client/src/media/compress.test.ts`) | TV3-03 (#31) |
| US-03 | Lấy GPS khi offline | Unit luật `gps` trong `recordValidation.test.ts`. **Chưa có E2E bấm lấy GPS** | TV1-05; E2E: TV3-14 |
| US-03 | Không lấy được vị trí → câu hướng dẫn | `gps-errors.spec.ts`; unit `client/src/gps.test.ts` | TV1-12 (#69, b2 p1 #70) |
| US-04 | 500 hai lần → một bản ghi | R1 `offline.spec.ts` | TV2-09 (#16) |
| US-04 | Cắt kết nối sau khi ghi → replay | R3 `server/test/idempotency.test.ts`, `retry.spec.ts`; R2 timeout `retry.spec.ts`; R6 `records.test.ts` | TV2-08 (#15) |
| US-04 | Hai tab không gửi trùng | O6 `tabs.spec.ts` | TV2-06 (#13) |
| US-04 | `400` → "Lỗi", không thử lại vô hạn | R5 `errors.spec.ts` | TV2-09 (#16) |
| US-05 | Khác trường tự gộp | C1 unit `merge.test.ts`, `conflict.spec.ts`; C3 unit | TV2-10 (#34) |
| US-05 | Cùng trường → màn hình xung đột, không chọn sẵn | C2 `conflict.spec.ts` (cả ca bấm chỗ trống trong ô lựa chọn) | TV3-07 (#41); ô lựa chọn TV1-12 (b2 p3) |
| US-05 | Phiếu xung đột chỉ đọc | C7 `conflict.spec.ts` (cả ca không có hàng nút, ô chụp ảnh) | TV2-10 (#34), TV3-07 (#41), TV1-12 (b2 p3) |
| US-05 | Server đổi tiếp lúc đang chọn | C8 `conflict.spec.ts`; C6 sửa 3 lần một op | TV2-10 (#34) |
| US-06 | Xoá phiếu chưa gửi, Huỷ/Esc | O7 `delete.spec.ts` | TV2-13 (#35), TV1-13 (#42), TV1-12 (#58) |
| US-06 | Xoá phiếu đã đồng bộ → tombstone | O8 `delete.spec.ts` | TV2-13 (#35) |
| US-06 | Xoá vs sửa → hỏi | C4, C5 `delete-conflict.spec.ts`; unit `autoMergedNote` (`client/src/conflictView.test.ts`) | TV3-08 (#47); bỏ câu "đã được gộp" TV1-12 (b2 p3) |
| US-06 | Điều tra viên không xoá phiếu người khác | `record-owner.spec.ts` | TV1-17 (#44, #45) |
| US-07 | Tạo form 7 loại trường | `builder.spec.ts` (cả hàng nút dính đáy, khung lỗi trong khung nhìn, Xem trước, TV1-12 b2 p4; kéo thả, huỷ kéo, tự cuộn, TV1-12 b2 p8); unit `moveFieldTo`, `selectionAfterMove` (`builder.test.ts`), `dropIndex` (`fieldDrag.test.ts`); A5 `forms.test.ts`. **Chưa có E2E "điều tra viên thấy form sau vòng đồng bộ"** (builder.spec kiểm ở chính máy giám sát viên) | TV1-03 (#19), TV1-04 (#24); E2E: TV3-14 |
| US-07 | Sửa form lên version mới, phiếu cũ mở bằng version cũ | `builder.spec.ts`, `form-version.spec.ts` | TV1-04 (#24), TV1-10 (#32) |
| US-07 | Đổi `type`/bỏ trường → `400 invalid_form` | `server/test/forms.test.ts`; unit `formValidation.test.ts` | TV1-03 (#19) |
| US-07 | Điều tra viên lưu form → `403` | A3 `forms.test.ts` | TV1-03 (#19) |
| US-08 | v1 và v2 cùng file, cột đúng, BOM | `export.spec.ts`; `server/test/export.test.ts` | TV3-09 (#48); nút [Xuất ▾] TV1-12 (b2 p2 #71, mất mạng thì đóng b2 p3) |
| US-08 | Chống CSV injection | `server/test/csv.test.ts` | TV3-09 (#48) |
| US-08 | Điều tra viên xuất → `403` | A3 `export.test.ts` | TV3-09 (#48) |
| US-09 | Đổi tổ chức offline ≤ 1 s, không lẫn | T6, T10 `projects.spec.ts`; `project-switcher.spec.ts` | TV1-06 (#23), TV1-11 (#43) |
| US-09 | Người ngoài không gọi được route nào | T1–T5 `server/test/isolation.test.ts` | TV3-04 (#29) |
| US-09 | Bị rút còn phiếu chưa gửi | T7, T8, T9 `membership.spec.ts` | TV2-07 (#14), TV1-06 (#23) |
| US-10 | Tạo tài khoản, tải lại vẫn đăng nhập | U1 `accounts.test.ts`; U7 `login.spec.ts` (cả mất mạng nền vàng, lỗi nhập chữ đỏ, tab công tắc); `settings.spec.ts` (thanh dung lượng, Đăng xuất bị khoá); unit `usagePercent` (`formatBytes.test.ts`) | TV2-14 (#36), TV1-14 (#53); giao diện TV1-12 (b2 p6) |
| US-10 | Trùng tên → `409 username_taken` | U2 `accounts.test.ts` | TV2-14 (#36) |
| US-10 | Sai 11 lần → `429` | U4 `accounts.test.ts` | TV2-14 (#36) |
| US-10 | Phiên bị thu hồi → về Đăng nhập, báo hết phiên, giữ dữ liệu | `api-errors.spec.ts` | TV1-12 (#62) |
| US-10 | Gửi yêu cầu, được duyệt, thành Owner | Q1, Q2 `projectRequests.test.ts`; Q8 `orgs.spec.ts` (cả dòng yêu cầu hai dòng, ngoại tuyến không có khối công khai); unit `requestStatusKind` (`orgs.test.ts`) | TV2-15 (#49), TV1-15 (#54); giao diện TV1-12 (b2 p5) |
| US-11 | Supervisor thêm surveyor; không thêm supervisor | M1 `members.test.ts` | TV1-08 (#38) |
| US-11 | Đã là thành viên / tên không có / tài khoản bị khoá | M2 và ca tài khoản bị khoá `members.test.ts` | TV1-08 (#38), TV1-12 (#62) |
| US-11 | Owner cuối cùng | A7 `members.test.ts`; `members.spec.ts` (cả dòng thành viên hai dòng) | TV1-08 (#38, #39); giao diện TV1-12 (b2 p5) |
| US-11 | Người mới thêm thấy tổ chức, gửi được phiếu | M3 `orgs.spec.ts` | TV1-08 (#39), TV1-15 (#54) |
| US-11 | Máy chủ lỗi ở Thành viên | `api-errors.spec.ts` (cả Tổ chức, builder lưu form, Xuất) | TV1-12 (#62, #68, b2 p5: Thử lại ngoài vùng alert, Tổ chức ẩn khối công khai) |
| US-12 | Admin không đọc được dữ liệu | Q7 `projectRequests.test.ts`; T4 `isolation.test.ts`, `admin.test.ts` | TV2-15 (#49) |
| US-12 | Tài khoản admin vào app khảo sát | Q11 `account.spec.ts` | TV2-16 (#50), TV1-14 (#53) |
| US-12 | Tài khoản thường vào `/admin/` | Q10 `admin.spec.ts` (cả hàng mở rộng từ chối/Đổi Owner, focus, màu lỗi theo loại) | TV1-16 (#55, #56); giao diện TV1-12 (b2 p7) |
| US-12 | Từ chối thiếu lý do | Q3 `projectRequests.test.ts` | TV2-15 (#49) |

Commit của từng tiêu chí xem trong PR tương ứng (`gh pr view <số> --json commits`).

## Lịch sử

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 0.1 | 2026-10-22 | Bản đầu: 12 story viết lại từ spec và code đã có, kèm bảng truy vết (Lecture 03) |
| 0.2 | 2026-10-22 | TV1-12 a2: US-10 thêm tiêu chí hết phiên (`401`); US-11 thêm tài khoản bị khoá vào tiêu chí `404` và tiêu chí máy chủ lỗi |
| 0.3 | 2026-10-23 | TV1-12 b1: US-03 thêm tiêu chí không lấy được vị trí |
