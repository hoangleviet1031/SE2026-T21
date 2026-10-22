# Báo cáo kiểm thử

- **Phiên bản:** 0.1 nháp (2026-10-22)
- **Người viết:** Đại (TV3, Quality owner), ticket [TV3-11](plan/tv3-conflict-media-test.md)
- **Bản được kiểm:** `main` ở commit `5a9891d` (sau PR #59)
- **Liên quan:** ma trận ca ở [design.md §10.1](design.md#101-ma-trận-e2e-bắt-buộc), ca cách ly ở [ADR 0002](adr/0002-multi-tenancy.md#kiểm-chứng), chỉ tiêu ở [§11.2](design.md#112-chỉ-tiêu), story ở [requirements.md](requirements.md), nợ ở [tech-debt.md](tech-debt.md)

File này trả lời: hệ thống đã được kiểm chứng tới đâu, bằng chứng nằm ở file nào, và còn gì chưa đạt hoặc chưa kiểm. Đây là **bản nháp**: chỗ đánh dấu ⏳ còn chờ số liệu (hiệu năng TV2-11, thử trên điện thoại thật), và trạng thái cuối được chốt lại sau khi đóng băng tính năng.

## 1. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| Ca bắt buộc trong ma trận (§10.1 + T1–T10) | **64/64 đạt**, A4 bỏ theo ADR 0003 (thay bằng A7) |
| Test tự động | 678 unit và integration (shared 130, server 377, client 171), 113 E2E trong 29 file, không ca nào `skip` |
| CI (2026-10-07 → 2026-10-22) | 178 lần chạy: 145 xanh, 32 bị huỷ vì có push mới hơn, **0 đỏ**; trung bình 1,9 phút |
| Chỉ tiêu hiệu năng §11.2 | 2/10 có số đo (ảnh ≤ 600 KB, đổi dự án ≤ 1 s); còn lại ⏳ TV2-11 |
| Điện thoại thật | ⏳ chưa ghi kết quả (§7) |
| User story | 12/12 story có test; 2 tiêu chí còn thiếu E2E (§4) |

## 2. Phương pháp

### 2.1 Các mức kiểm thử

| Mức | Công cụ | Kiểm cái gì | Vị trí |
|---|---|---|---|
| Unit | Vitest | Hàm thuần: `threeWayMerge`, backoff, validate phiếu/form/tài khoản, CSV escape, dựng bảng xuất, trạng thái hiển thị, luật ảnh, bộ lọc | `shared/src/*.test.ts`, `client/src/**/*.test.ts`, `server/test/csv.test.ts`, `exportTable.test.ts` |
| Integration | Vitest + `fetch` vào server thật cổng ngẫu nhiên, SQLite `:memory:` | Route, phân quyền, cách ly dự án, idempotency, migration, CLI | `server/test/*.test.ts`, fixture `server/test/fixtures.ts` |
| E2E | Playwright, Chromium | Luồng người dùng trên **bản build** (`vite preview`) để service worker chạy như production; API in-memory có dữ liệu demo | `client/e2e/*.spec.ts` |

Phần lớn logic nằm ở unit và integration (chạy dưới 15 giây); E2E giữ cho các ca chỉ kiểm được khi có trình duyệt thật: offline, service worker, IndexedDB, nhiều tab, nén ảnh bằng canvas, tải file.

### 2.2 Tạo điều kiện lỗi

Mạng chập chờn không chờ được nó tự xảy ra, nên server có API kiểm thử `/api/__test/*` (chỉ bật khi `ENABLE_TEST_ROUTES=1`, design §10.1):

- `POST /api/__test/faults` làm `count` request khớp tiếp theo bị lỗi: `500`, `400`, giữ 15 s (`timeout`), **ghi xong rồi cắt kết nối** (`drop`, cho R3), cắt trước khi vào handler (`drop-before`). `match` chọn đường dẫn (vd. `/attachments`), `chunkIndex` chọn đúng chunk ảnh (R4).
- `GET /api/__test/stats` trả nhật ký request (method, đường dẫn, `Idempotency-Key`, mã trả về, `0` là bị cắt). Test dùng nó để khẳng định **số lần** chứ không chỉ kết quả cuối: mỗi `opId` chỉ một `PUT` (O6), mỗi chunk chỉ ghi một lần (R4), phiếu xoá trước khi gửi không có request nào (O7, T7).
- Mất mạng ở phía trình duyệt bằng `context.setOffline`.

### 2.3 Chống "xanh giả"

Test xanh chỉ có nghĩa khi nó đỏ được lúc code sai:

- **Thử phá code có chủ đích:** R4 được thử bằng cách tạm sửa client gửi lại mọi chunk; test đỏ, khôi phục code thì xanh (TV3-10).
- **Không để dữ liệu chuẩn bị che lỗi:** T5 tạo dữ liệu mẫu thẳng qua lớp `repo` thay vì gọi HTTP trong `beforeAll`, vì nếu chính route đang kiểm bị hỏng thì bước chuẩn bị đã lỗi theo và ca kiểm thật không chạy tới (TV3-04).
- **Khẳng định tiền điều kiện:** R4 kiểm ảnh nén > 256 KB (nhiều hơn một chunk) trước khi kiểm việc gửi tiếp; nếu ảnh nhỏ thì ca này vô nghĩa và test báo lỗi.
- **T5 tự liệt kê route** từ router Express thay vì danh sách viết tay, nên thêm route mới mà quên middleware thì test tự bắt.
- Không `waitForTimeout`; chờ bằng `expect(...).toHaveText(..., { timeout })`. Không sửa test cũ để nó qua (CLAUDE.md "Kiểm thử").

### 2.4 Môi trường

| | CI | Máy dev |
|---|---|---|
| Hệ điều hành | `ubuntu-latest` (GitHub Actions) | Windows 11 |
| Node | 22 | 22.13+ |
| Trình duyệt E2E | Chromium do Playwright cài | Chromium do Playwright cài |
| Dữ liệu | SQLite `:memory:`, `SEED_DEMO=1` | như CI |

E2E chạy tuần tự (`workers: 1`) vì dùng chung một server và cơ chế tiêm lỗi toàn cục.

## 3. Ma trận ca kiểm thử

Mọi ca dưới đây **đạt** trên `main` ở commit `5a9891d` (`npm test`, `npm run test:e2e` xanh). Cột "Mức": U = unit, I = integration, E = E2E.

### 3.1 Offline

| # | Ca | Mức | Bằng chứng | Kết quả |
|---|---|---|---|---|
| O1 | Tải app, offline, reload vẫn mở, nhập phiếu, online thì đồng bộ | E | `offline.spec.ts` | Đạt |
| O2 | Mở app lần đầu khi đã mất mạng (đã cài), tạo 10 phiếu, online | E | `offline-install.spec.ts` | Đạt |
| O3 | Phiếu có ảnh offline, online thì ảnh lên đủ, "Đã đồng bộ" chỉ khi ảnh xong | E | `upload.spec.ts` (2 ảnh, SHA-256 khớp, thấy "Đang tải ảnh (2)") | Đạt |
| O4 | Đóng tab khi còn op, mở lại vẫn đồng bộ | E | `offline-install.spec.ts` | Đạt |
| O5 | Thiếu trường bắt buộc → "Nháp", không lên server; sửa đủ thì đồng bộ | E, U | `draft.spec.ts`; `shared/src/recordValidation.test.ts` | Đạt |
| O6 | Hai tab: mỗi op chỉ gửi từ một tab | E | `tabs.spec.ts` | Đạt |
| O7 | Xoá phiếu chưa gửi: Huỷ/Esc giữ phiếu; xác nhận thì không có request nào | E | `delete.spec.ts` | Đạt |
| O8 | Xoá phiếu đã đồng bộ → tombstone, máy khác thấy | E | `delete.spec.ts` | Đạt |

### 3.2 Xung đột

| # | Ca | Mức | Bằng chứng | Kết quả |
|---|---|---|---|---|
| C1 | Hai nơi sửa khác trường → tự gộp | U, E | `shared/src/merge.test.ts`; `conflict.spec.ts` | Đạt |
| C2 | Cùng trường khác giá trị → màn hình xung đột, server có bản gộp | E, U | `conflict.spec.ts`; `client/src/conflictView.test.ts` | Đạt |
| C3 | Cùng trường cùng giá trị → không hỏi | U | `merge.test.ts` | Đạt |
| C4 | Máy xoá, server sửa → hỏi; Áp dụng khoá tới khi trả lời | U, E | `conflictView.test.ts`; `delete-conflict.spec.ts` | Đạt |
| C5 | Máy sửa, server xoá → hỏi khôi phục hay bỏ | U, E | `conflictView.test.ts`; `delete-conflict.spec.ts` | Đạt |
| C6 | Sửa ba lần offline → một op, version +1 | E, U | `conflict.spec.ts`; `client/src/sync/coalesce.test.ts` | Đạt |
| C7 | Phiếu đang xung đột: chỉ đọc, có banner, không tạo op | E | `conflict.spec.ts`; `delete.spec.ts` | Đạt |
| C8 | Server đổi tiếp lúc đang chọn | E | `conflict.spec.ts` (hai ca: khác trường, cùng trường) | Đạt |

### 3.3 Thử lại

| # | Ca | Mức | Bằng chứng | Kết quả |
|---|---|---|---|---|
| R1 | Server trả 500 hai lần → backoff, đúng một bản ghi | E | `offline.spec.ts` | Đạt |
| R2 | Server giữ 15 s → huỷ sau 10 s, thử lại, không trùng | E | `retry.spec.ts` | Đạt |
| R3 | Ghi xong nhưng cắt kết nối → gửi lại cùng key, `Idempotent-Replayed` | I, E | `server/test/idempotency.test.ts`; `retry.spec.ts` | Đạt |
| R4 | Mất mạng giữa lúc tải ảnh → gửi tiếp từ chunk thiếu | E, I | `upload.spec.ts` (cắt trước và sau khi ghi chunk 2); `server/test/attachments.test.ts` | Đạt |
| R5 | `400` → "Lỗi", không thử lại vô hạn | E | `errors.spec.ts` | Đạt |
| R6 | Cùng key khác nội dung → `422 idempotency_key_reused` | I | `server/test/records.test.ts` | Đạt |

### 3.4 Phân quyền

| # | Ca | Mức | Bằng chứng | Kết quả |
|---|---|---|---|---|
| A1 | Không token → `401` | I | `auth.test.ts`, `records.test.ts` | Đạt |
| A2 | Surveyor pull chỉ nhận phiếu mình tạo | I | `records.test.ts` | Đạt |
| A3 | Surveyor lưu form hoặc xuất → `403` | I | `forms.test.ts`, `export.test.ts` | Đạt |
| A4 | ~~Rút giám sát viên cuối cùng~~ | – | Bỏ theo ADR 0003, thay bằng A7 | Bỏ |
| A5 | Supervisor, Owner lưu form `201`; surveyor `403` | I | `forms.test.ts`, `auth.test.ts` | Đạt |
| A6 | Owner ở A, surveyor ở B | I | `members.test.ts` | Đạt |
| A7 | Rút/hạ Owner cuối cùng → `409 last_owner` | I, E | `members.test.ts`; `members.spec.ts` | Đạt |
| A8 | Admin chỉ định Owner; người thường gọi → `403` | I | `admin.test.ts` | Đạt |

### 3.5 Tài khoản, mở tổ chức, danh sách công khai, thành viên (ADR 0003)

| # | Ca | Mức | Bằng chứng | Kết quả |
|---|---|---|---|---|
| U1 | Đăng ký rồi `/me` | I | `accounts.test.ts` | Đạt |
| U2 | Trùng tên khác hoa thường → `409 username_taken` | I | `accounts.test.ts` | Đạt |
| U3 | Sai mật khẩu và sai tên cùng `401 invalid_credentials` | I | `accounts.test.ts` | Đạt |
| U4 | Sai 11 lần trong 15 phút → `429` | I | `accounts.test.ts`, `rateLimit.test.ts` | Đạt |
| U5 | Hai phiên, đăng xuất một máy | I | `accounts.test.ts` | Đạt |
| U6 | DB chỉ chứa hash | I | `accounts.test.ts` | Đạt |
| U7 | Tạo tài khoản trên app, tải lại; offline lần đầu | E | `login.spec.ts` | Đạt |
| MG1 | Migration từ DB có admin là thành viên → báo lỗi, không đổi dữ liệu | I | `db.test.ts` | Đạt |
| MG2 | Migration bình thường lên `user_version = 4` | I | `db.test.ts` | Đạt |
| Q1–Q7 | Gửi, duyệt, từ chối, quyền, giới hạn, trạng thái yêu cầu mở tổ chức; admin không đọc được dữ liệu | I | `projectRequests.test.ts` | Đạt |
| Q8 | Tạo tài khoản → gửi yêu cầu → được duyệt → thấy tổ chức với vai trò Owner | E | `orgs.spec.ts` | Đạt |
| Q9 | Thêm admin vào tổ chức → `409 admin_account` | I | `members.test.ts` | Đạt |
| Q10 | Trang `/admin/` | E | `admin.spec.ts` | Đạt |
| Q11 | Tài khoản admin đăng nhập app khảo sát | E | `account.spec.ts` | Đạt |
| D1 | `GET /directory` chỉ có tổ chức công khai | I | `projectRequests.test.ts` | Đạt |
| D2 | Ai được `PATCH P/settings` | I | `members.test.ts`, `projectRequests.test.ts` | Đạt |
| M1 | Supervisor thêm surveyor; không thêm supervisor | I | `members.test.ts` | Đạt |
| M2 | Owner thêm; tên không có; đã là thành viên | I | `members.test.ts` | Đạt |
| M3 | Người mới được thêm thấy tổ chức, gửi được phiếu | E | `orgs.spec.ts` | Đạt |

### 3.6 Cách ly dự án (ADR 0002)

| # | Ca | Mức | Bằng chứng | Kết quả |
|---|---|---|---|---|
| T1 | Thành viên A gọi API của B → `403 not_member` | I | `isolation.test.ts` | Đạt |
| T2 | `PUT` vào B với id đã có ở A → `404`, A không đổi | I | `isolation.test.ts`, `records.test.ts` | Đạt |
| T3 | Surveyor chỉ nhận phiếu mình; supervisor nhận tất cả | I | `isolation.test.ts`, `records.test.ts` | Đạt |
| T4 | Admin không là thành viên đọc phiếu → `403` | I | `isolation.test.ts`, `admin.test.ts` | Đạt |
| T5 | Mọi route theo dự án với token người ngoài: không route nào `2xx` | I | `isolation.test.ts` (tự liệt kê route) | Đạt |
| T6 | Được thêm vào dự án mới khi đang có dữ liệu dự án khác | E | `projects.spec.ts` | Đạt |
| T7 | Bị rút khi còn phiếu chưa gửi: phiếu còn, banner, Xuất JSON, không gửi request | E | `membership.spec.ts` | Đạt |
| T8 | Bị rút khi không còn gì chưa gửi: CSDL dự án bị xoá | E | `membership.spec.ts` | Đạt |
| T9 | Nâng surveyor → supervisor: cursor về 0, thấy phiếu người khác | E | `membership.spec.ts` | Đạt |
| T10 | Offline, đổi qua lại hai dự án | E | `projects.spec.ts`, `project-switcher.spec.ts` | Đạt |

### 3.7 Ngoài ma trận

E2E còn kiểm các luồng không có mã ca: trình duyệt thiếu API và xin giữ bộ nhớ (`browser-support.spec.ts`), builder và phiên bản form (`builder.spec.ts`, `form-version.spec.ts`, `form-import-export.spec.ts`), trang điền phiếu (`fill.spec.ts`), ảnh và nén (`photo.spec.ts`), tách CSDL theo dự án trên máy (`storage.spec.ts`), cập nhật bản mới của app (`update.spec.ts`), trang Cài đặt và Đăng xuất (`settings.spec.ts`), điều tra viên không xoá được phiếu người khác (`record-owner.spec.ts`), xuất CSV/JSON (`export.spec.ts`).

## 4. Truy vết user story

Bảng đầy đủ tiêu chí → test → PR ở [requirements.md "Truy vết"](requirements.md#truy-vết). Tóm tắt theo story:

| Story | Kết quả mong muốn | Ca chính | Tiêu chí | Còn thiếu |
|---|---|---|---|---|
| US-01 Nhập phiếu offline | K1 | O1, O2, O4 | 3/3 | |
| US-02 Lưu nháp | K1 | O5 | 2/2 | |
| US-03 Ảnh lên đủ | K1 | O3, R4, ảnh ≤ 600 KB | 3/4 | **Chưa có E2E bấm lấy GPS** (chỉ unit luật `gps`); bù bằng thử trên điện thoại thật (§7, P4) |
| US-04 Không trùng khi lỗi | K1 | R1–R6, O6 | 4/4 | |
| US-05 Hai nơi cùng sửa | K2 | C1–C3, C6–C8 | 4/4 | |
| US-06 Xoá an toàn | K1, K2 | O7, O8, C4, C5 | 4/4 | |
| US-07 Tạo, sửa form | K3 | A3, A5 | 3/4 | **Chưa có E2E "điều tra viên thấy form sau vòng đồng bộ"** (`builder.spec.ts` chỉ kiểm trên máy giám sát viên) |
| US-08 Xuất dữ liệu | K3 | A3, export | 3/3 | |
| US-09 Nhiều tổ chức | K4 | T1–T10 | 3/3 | |
| US-10 Tài khoản, mở tổ chức | K4 | U1–U7, Q1, Q2, Q8 | 4/4 | |
| US-11 Thành viên | K4 | M1–M3, A7 | 4/4 | |
| US-12 Admin không xem dữ liệu | K4 | T4, Q3, Q7, Q10, Q11 | 4/4 | |

Kịch bản chất lượng (design §11.4): QS1 (R1, R2, R3, O2), QS2 (C1, C2, C4, C5, C8) và QS3 (T1–T5, Q7) đã có test đạt; QS4 (mở offline ≤ 3 s) chờ TV2-11; QS5 (khôi phục bản trước) chưa diễn tập (N3).

## 5. Số liệu CI

Workflow [.github/workflows/ci.yml](../.github/workflows/ci.yml) chạy trên mọi PR và mỗi lần push lên `main`: `npm ci` → `typecheck` → `npm test` → cài Chromium → `test:e2e`; lưu `playwright-report/` khi lỗi. `main` được bảo vệ: chỉ merge qua PR có CI xanh.

Số liệu lấy từ GitHub Actions API ngày 2026-10-22 (⏳ cập nhật lần cuối ở tuần 8):

| | Số lần |
|---|---|
| Tổng số lần chạy (2026-10-07 → 2026-10-22) | 178 (120 từ PR, 58 từ push lên `main`) |
| Xanh | 145 |
| Bị huỷ | 32 (do `concurrency: cancel-in-progress`: push tiếp lên cùng nhánh thì lần cũ bị huỷ, không phải lỗi) |
| Đỏ | 0 |
| Đang chạy lúc lấy số | 1 |
| Push lên `main` | 57 xanh, 1 bị huỷ |
| Thời gian một lần xanh | trung bình 1,9 phút, dài nhất 4,2 phút |

Không có lần nào đỏ: mỗi người chạy `typecheck`, `npm test` và E2E liên quan trên máy trước khi push (quy trình "Khi xong một ticket" trong CLAUDE.md, `/self-check`), nên CI đóng vai lưới an toàn cuối thay vì nơi phát hiện lỗi chính. Mặt trái: số liệu CI không cho thấy bao nhiêu lỗi đã được test bắt ở máy dev.

Số test trên `main` ở commit `5a9891d`:

| Workspace | File | Test | Thời gian (máy dev) |
|---|---|---|---|
| `shared` (unit) | 6 | 130 | < 1 s |
| `server` (integration, một ít unit) | 23 | 377 | khoảng 12 s |
| `client` (unit) | 21 | 171 | khoảng 2 s |
| `client/e2e` (E2E) | 29 | 113 | vài phút (gồm build) |

## 6. Hiệu năng

Mục tiêu do nhóm tự đặt theo thiết bị tham chiếu (máy Android tầm trung 3 GB RAM, design §11.1). ⏳ Số đo các dòng "Chờ" lấy từ `docs/perf.md` của TV2-11 (chưa có).

| Chỉ tiêu | Mục tiêu | Số đo | Nguồn | Kết quả |
|---|---|---|---|---|
| Mở app offline (đã cài) tới khi nhập được | ≤ 3 s, CPU throttle 4× | ⏳ | TV2-11 | Chờ |
| Lưu một phiếu | ≤ 200 ms | ⏳ | TV2-11 | Chờ |
| Danh sách 2.000 phiếu | hiển thị ≤ 1 s, cuộn mượt | ⏳ | TV2-11 (thủ công) | Chờ |
| Đồng bộ 100 phiếu không ảnh | ≤ 10 s, Slow 3G | ⏳ | TV2-11 | Chờ |
| Đồng bộ 50 ảnh đã nén | ≤ 3 phút, 3G 1,6 Mbps | ⏳ | TV2-11 | Chờ |
| Pull lần đầu 5.000 phiếu (supervisor) | ≤ 30 s | ⏳ | TV2-11 | Chờ |
| Dung lượng mỗi máy | 2.000 phiếu + 500 ảnh (khoảng 250 MB) | ⏳ | TV2-11 | Chờ |
| Đổi dự án đã tải, kể cả offline | ≤ 1 s | < 1 s | `project-switcher.spec.ts` (khẳng định bằng `timeout: 1000`, không ghi số cụ thể) | Đạt |
| Số dự án mỗi người dùng | tối đa 10 | – | Thiết kế, không đo | – |
| Kích thước ảnh sau nén | ≤ 600 KB | ≤ 600 KB với ảnh 4 MB | `photo.spec.ts`; unit `fitWithin` | Đạt |

## 7. Thử trên điện thoại thật

⏳ Chưa làm. Thử trên staging `https://se2026-t21.koreacentral.cloudapp.azure.com` sau lần deploy cuối trước đóng băng. E2E chỉ chạy Chromium trên máy tính, nên phần này là bằng chứng duy nhất cho camera, GPS, cài PWA và Safari iOS.

### 7.1 Thiết bị

| Mã | Máy | Hệ điều hành | Trình duyệt | Người thử | Ngày |
|---|---|---|---|---|---|
| M1 | ⏳ | Android ⏳ | Chrome ⏳ | | |
| M2 | ⏳ (nếu nhóm có iPhone) | iOS ⏳ | Safari ⏳ | | |
| M3 | Máy tính (vai giám sát viên) | ⏳ | Chrome/Edge ⏳ | | |

### 7.2 Kịch bản

Đăng nhập bằng tài khoản thật trên staging (không có `seed:demo`). Kết quả ghi: Đạt / Không đạt (kèm mô tả, ảnh chụp màn hình) / Không áp dụng.

| # | Kịch bản | Kỳ vọng | M1 | M2 |
|---|---|---|---|---|
| P1 | Mở app, cài lên màn hình chính (Android: "Cài đặt ứng dụng"; iOS: Chia sẻ → "Thêm vào màn hình chính") | Có biểu tượng, mở ra không có thanh địa chỉ | ⏳ | ⏳ |
| P2 | Bật chế độ máy bay, mở app từ biểu tượng | Mở được, thấy danh sách phiếu và form | ⏳ | ⏳ |
| P3 | Vẫn offline, tạo 3 phiếu (một phiếu thiếu trường bắt buộc) | 2 phiếu "Chờ đồng bộ", 1 phiếu "Nháp" | ⏳ | ⏳ |
| P4 | Offline, bấm lấy GPS ở trường vị trí | Có toạ độ (GPS không cần mạng); từ chối quyền thì báo rõ, vẫn lưu được phiếu | ⏳ | ⏳ |
| P5 | Offline, chụp 2 ảnh bằng camera | Ảnh hiện trong phiếu; dung lượng hiển thị ≤ 600 KB mỗi ảnh | ⏳ | ⏳ |
| P6 | Tắt chế độ máy bay | Nhãn qua "Đang tải ảnh (2)" rồi "Đã đồng bộ"; máy tính (M3) thấy phiếu và mở được ảnh | ⏳ | ⏳ |
| P7 | Tạo phiếu offline, vuốt tắt app, bật mạng, mở lại app | Phiếu tự đồng bộ | ⏳ | ⏳ |
| P8 | Điện thoại offline sửa trường X; M3 sửa cùng trường X khác giá trị; điện thoại bật mạng | Màn hình xung đột hiện tên người sửa, không chọn sẵn; chọn xong M3 thấy bản gộp | ⏳ | ⏳ |
| P9 | Tài khoản ở hai tổ chức: tải cả hai, offline đổi qua lại | Đổi gần như tức thì, không lẫn form và phiếu | ⏳ | ⏳ |
| P10 | Đang tải ảnh thì bật chế độ máy bay, vài giây sau tắt | Ảnh lên đủ, không phải tải lại từ đầu | ⏳ | ⏳ |
| P11 | Deploy bản mới khi app đang mở | Hiện thông báo có bản mới; tải lại không mất phiếu chưa gửi | ⏳ | ⏳ |
| P12 | M3: Xuất CSV, mở bằng Excel | Tiếng Việt đúng, phiếu form v1 và v2 cùng file, ảnh là đường dẫn mở được | ⏳ (M3) | – |
| P13 | Đọc chữ và bấm nút ngoài trời nắng, một tay | Đọc được nhãn trạng thái, bấm trúng nút (gợi ý cho N8) | ⏳ | ⏳ |

Riêng iOS: ghi thêm phiên bản Safari, có cần "Thêm vào màn hình chính" để giữ dữ liệu không (design §13), và việc chỉ đồng bộ khi app đang mở (không có Background Sync).

### 7.3 Kết quả

⏳ Ghi tóm tắt và lỗi phát hiện (nếu có, kèm số issue/PR sửa).

## 8. Lỗi đã biết và phần chưa kiểm

### 8.1 Lỗi và nợ còn tồn

Tại thời điểm viết, không có lỗi mở nào làm hỏng ca trong ma trận. Những chỗ người dùng có thể thấy sai hoặc vận hành còn hở, lấy từ [tech-debt.md](tech-debt.md):

| # | Vấn đề | Ảnh hưởng tới người dùng hoặc kiểm chứng | Ưu tiên | Trạng thái |
|---|---|---|---|---|
| N2 | Chưa sao lưu hằng ngày, ảnh chưa có trong bản sao lưu | Hỏng đĩa staging thì mất phiếu và ảnh | Cao | ⏳ |
| N1 | Server không ghi log theo request | Sự cố staging khó dò, không có tỉ lệ 5xx sau deploy | Vừa | ⏳ |
| N3 | Chưa diễn tập quay lại bản trước | QS5 chưa kiểm chứng | Vừa | ⏳ |
| N5 | Bị thu hồi phiên chỉ quay về màn hình Đăng nhập, không có câu giải thích | Người dùng không hiểu vì sao bị đẩy ra | Vừa | ⏳ |
| N6 | Danh sách phiếu chưa lọc theo người tạo, chưa có ô tìm | Supervisor khó tìm phiếu khi dự án lớn | Thấp | ⏳ |
| N7 | `seed:demo` tạo token cố định | Chỉ ảnh hưởng bản dev | Thấp | Đang trả ở nhánh `fix/n7-demo-tokens` |
| N8 | Chưa kiểm khả năng tiếp cận | Nắng khó đọc, trình đọc màn hình chưa thử | Thấp | ⏳ |

### 8.2 Phần chưa có kiểm thử tự động

| Phần | Vì sao | Bù bằng |
|---|---|---|
| Safari iOS, Firefox | E2E chỉ chạy Chromium (design §11.1: Firefox, Safari macOS best-effort) | Thử tay P1–P13 trên iPhone (§7) |
| Camera, GPS thật | Trình duyệt headless không có; E2E dùng file ảnh tạo sẵn | P4, P5 |
| Nhiều người dùng cùng lúc, tải cao | Ngoài phạm vi đồ án; server SQLite một tiến trình | Pull 5.000 phiếu ở TV2-11 |
| Điều tra viên thấy form mới sau vòng đồng bộ | Chưa viết E2E hai vai (§4, US-07) | A5 integration và đồng bộ form trong các E2E khác |
| Lấy GPS trong E2E | Chưa viết (§4, US-03) | Unit luật `gps`, P4 |
| Khả năng tiếp cận (tương phản, cỡ nút) | Chưa có công cụ kiểm trong E2E (N8) | E2E chọn ô theo nhãn nên các ô có E2E đều có nhãn; P13 |
| Khôi phục bản trước trên staging | Chưa diễn tập (N3) | – |

## 9. Việc còn lại để chốt báo cáo

- [ ] Điền §6 từ `docs/perf.md` khi TV2-11 xong.
- [ ] Thử P1–P13 trên điện thoại thật, điền §7.
- [ ] Sau đóng băng tính năng: chạy lại toàn bộ test trên commit cuối, cập nhật số ở §1, §3, §5.
- [ ] Cập nhật §8 theo tech-debt và lỗi tìm được khi thử tay.

## Lịch sử

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 0.1 | 2026-10-22 | Bản nháp: phương pháp, ma trận 64 ca với bằng chứng, truy vết story, số liệu CI, khung hiệu năng và kịch bản thử trên điện thoại thật |
