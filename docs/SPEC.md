# SPEC — Yêu cầu chức năng, phi chức năng và tiêu chí chấp nhận

> Source of truth cho **hành vi** hệ thống. Chi tiết kỹ thuật: [SYNC.md](SYNC.md), [API.md](API.md), [DATA_MODEL.md](DATA_MODEL.md). Test tương ứng: [TESTING.md](TESTING.md).

## 1. Quy ước

- ID đánh số liên tục: `FR1`, `FR2`… (chức năng), `NFR1`… (phi chức năng), `AC1`… (tiêu chí chấp nhận). ID dùng để tham chiếu từ test và PR. Không đánh lại số yêu cầu đã có; yêu cầu mới lấy số kế tiếp, yêu cầu bị bỏ thì ghi *(đã bỏ)* thay vì xoá.
- Mức ưu tiên: mọi FR trong tài liệu này là **Must** cho MVP trừ khi ghi *(Should)* — *Should* có thể cắt nếu trễ tiến độ (xem [RISKS.md](RISKS.md)).
- "Phiếu" = response. "Thay đổi chưa sync" = response có op trong outbox ở trạng thái khác `done`.

## 2. Yêu cầu chức năng

### 2.1 Xác thực
| ID | Yêu cầu |
|---|---|
| FR1 | Đăng nhập bằng email/mật khẩu (cần online). Server trả JWT hạn **7 ngày**; client lưu token + thông tin user trong IndexedDB (`meta`). |
| FR2 | Khi token còn hạn, mở app offline vào thẳng màn hình chính, không cần mạng. |
| FR3 | Token hết hạn: vẫn điền/lưu/sửa offline bình thường; sync dừng với trạng thái "Cần đăng nhập lại"; đăng nhập lại xong sync tiếp, không mất dữ liệu. |
| FR4 | Logout bị chặn (thông báo rõ lý do) khi còn thay đổi chưa sync; nếu còn nháp thì cảnh báo nháp sẽ mất. Logout xoá toàn bộ IndexedDB. |
| FR5 | Phân quyền phía server: `surveyor` chỉ đọc/ghi phiếu do mình tạo; `admin` đọc/ghi mọi phiếu và dùng được form builder, export. Route admin ẩn với surveyor. |

### 2.2 Form builder
| ID | Yêu cầu |
|---|---|
| FR6 | Admin tạo form (tiêu đề, mô tả tuỳ chọn) → tự tạo version 1 ở trạng thái `draft`. |
| FR7 | Thêm field thuộc 7 loại: `text`, `textarea`, `number`, `date`, `single_choice`, `multi_choice`, `attachment`. Thuộc tính theo [DATA_MODEL §2](DATA_MODEL.md#2-form-schema-json). |
| FR8 | Sửa, xoá, sắp xếp field bằng nút ↑/↓ — chỉ khi version đang `draft`. |
| FR9 | Preview bằng chính renderer mà surveyor dùng. |
| FR10 | Publish: validate schema (≥ 1 field; label không rỗng; choice có ≥ 2 option, value không trùng) → version trở thành **bất biến**. Surveyor nhận ở lần pull kế tiếp. |
| FR11 | "Tạo version mới" clone version published mới nhất, **giữ nguyên field `id`**; mỗi form tối đa 1 version `draft` cùng lúc. |
| FR12 | Phiếu mới luôn dùng version published mới nhất; phiếu cũ vẫn gắn và được sửa theo version cũ. Nộp phiếu theo version cũ luôn hợp lệ. |

### 2.3 Điền phiếu
| ID | Yêu cầu |
|---|---|
| FR13 | Surveyor xem danh sách form khả dụng (từ IndexedDB, hoạt động offline). |
| FR14 | Renderer dựng form từ schema; validate phía client (Zod từ `shared`) trước khi lưu; lỗi hiển thị theo từng field. |
| FR15 | Phiếu mới được autosave thành **nháp** (debounce 1 s). Nháp chỉ nằm local, không sync; có thể mở tiếp hoặc xoá. |
| FR16 | "Lưu" phiếu → validate → trạng thái "Chờ đồng bộ", tạo op trong outbox. |
| FR17 | Sửa phiếu đã lưu (chờ đồng bộ hoặc đã đồng bộ) → "Lưu" → tạo/gộp op. Không cho sửa phiếu đang "Xung đột" (phải giải quyết trước) hoặc đang "Lỗi" ngoài luồng sửa lỗi. |
| FR18 | Xoá phiếu (có xác nhận). Phiếu chưa từng gửi lên server → xoá hẳn ở local; ngược lại → tạo op xoá. |
| FR19 | Danh sách phiếu với badge: **Nháp / Chờ đồng bộ / Đã đồng bộ / Xung đột / Lỗi** (tương ứng `syncState` `draft/pending/synced/conflict/failed`). |

### 2.4 Offline storage
| ID | Yêu cầu |
|---|---|
| FR20 | Sau lần tải đầu online, app mở được khi offline (reload, tab mới, PWA đã cài). |
| FR21 | Form, phiếu, file đính kèm, outbox lưu trong IndexedDB, bền qua reload/đóng trình duyệt/khởi động lại máy. |
| FR22 | Gọi `navigator.storage.persist()` sau đăng nhập; màn hình hàng đợi hiển thị dung lượng đã dùng/ước tính quota. |
| FR23 | Chỉ báo online/offline luôn hiển thị trên header. |
| FR24 | Khi có bản app mới: hiện thông báo "Có phiên bản mới — Tải lại"; **không** tự reload; không mất dữ liệu chờ đồng bộ. |
| FR25 | PWA cài đặt được (manifest, icon, `display: standalone`). |

### 2.5 Sync queue
| ID | Yêu cầu |
|---|---|
| FR26 | Mọi thay đổi (tạo/sửa/xoá phiếu, thêm file) được ghi vào outbox **trong cùng transaction** với dữ liệu. |
| FR27 | Tự sync khi: có sự kiện `online`, mở app/tab trở lại visible, mỗi **30 s** khi online, bấm "Đồng bộ ngay". |
| FR28 | Lỗi tạm thời (mạng, timeout, 5xx, 429) được retry tự động theo backoff; khi offline không tính lượt thử. |
| FR29 | Lỗi vĩnh viễn (400/403/404/413/415/422) → phiếu ở trạng thái "Lỗi" kèm thông điệp; user sửa rồi lưu lại, hoặc "Huỷ thay đổi" (quay về bản đã đồng bộ). |
| FR30 | Gửi lại một thao tác bao nhiêu lần cũng không tạo bản ghi trùng hay áp dụng hai lần. |
| FR31 | Màn hình hàng đợi: từng op (loại, phiếu, trạng thái, số lần thử, lỗi gần nhất, thời điểm thử kế tiếp) + nút "Thử lại ngay". Sau 5 lần thử thất bại hiển thị cảnh báo nổi bật. |
| FR32 | Pull thay đổi từ server: form version mới, phiếu của mình bị sửa/xoá bởi admin hoặc thiết bị khác. |
| FR33 | Chỉ một tab thực hiện sync tại một thời điểm. |
| FR34 | Header hiển thị số thay đổi chờ và "Đồng bộ lần cuối lúc …". |

### 2.6 Attachments
| ID | Yêu cầu |
|---|---|
| FR35 | Field `attachment`: chụp ảnh (camera sau) hoặc chọn file; tối đa `maxFiles` (≤ **5**) file/field. |
| FR36 | Ảnh được nén ở client (cạnh dài ≤ 1600 px, JPEG) và phải ≤ **1.5 MB** sau nén; PDF ≤ **5 MB**. MIME cho phép: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Vượt giới hạn → báo lỗi ngay, không lưu. |
| FR37 | Xem trước file khi offline (Blob trong IndexedDB). |
| FR38 | File được upload **trước** op của phiếu tham chiếu nó; retry độc lập; kèm SHA-256 để server kiểm tra toàn vẹn. |
| FR39 | Sau khi server xác nhận: ảnh giữ thumbnail local, bỏ bản đầy đủ; xem bản đầy đủ khi online. |
| FR40 | Gỡ file khỏi phiếu = bỏ id khỏi giá trị field (file trên server giữ nguyên, không dọn trong MVP). |

### 2.7 Conflict
| ID | Yêu cầu |
|---|---|
| FR41 | Phát hiện conflict khi version trên server khác `baseVersion` của thay đổi local. |
| FR42 | Hai bên sửa **khác field** (hoặc cùng field cùng giá trị) → tự gộp, gửi lại, và thông báo "Đã tự gộp thay đổi của {người}" kèm chi tiết field nào lấy từ ai. |
| FR43 | Hai bên sửa **cùng field khác giá trị** → phiếu vào "Xung đột". Màn hình conflict hiển thị với **mỗi field xung đột**: giá trị gốc, giá trị của tôi (+ thời điểm), giá trị trên server (+ người sửa, thời điểm); chọn "Giữ của tôi" / "Giữ của server". Phải chọn đủ mới gửi được. Field đã tự gộp hiển thị riêng, chỉ đọc. |
| FR44 | Sửa offline nhưng server đã xoá: "Khôi phục bằng bản của tôi" hoặc "Chấp nhận xoá". |
| FR45 | Xoá offline nhưng server đã sửa: hiển thị thay đổi của server, chọn "Vẫn xoá" hoặc "Giữ bản server". |
| FR46 | Phiếu xung đột chỉ chặn sync của chính nó; phiếu khác vẫn sync. Menu có badge số xung đột. |
| FR47 | Mọi quyết định (tự gộp và thủ công) được ghi vào `conflict_log` trên server. |
| FR48 | Lời giải thích bằng tiếng Việt, dùng **label field**, **tên người**, **giờ địa phương**. Ví dụ: *"Bạn đổi 'Số nhân khẩu' 4 → 5 lúc 10:02 (offline). Admin Nguyễn A đổi 4 → 6 lúc 10:15."* |

### 2.8 Export
| ID | Yêu cầu |
|---|---|
| FR49 | Admin chọn form + version → tải **CSV**: UTF-8 có BOM, phân cách dấu phẩy, 1 dòng/phiếu; cột meta (`response_id, created_by, created_at, updated_at, version`) + 1 cột/field (header = label); `multi_choice` nối bằng `"; "`; `attachment` là URL nối bằng `" \| "`; `date` dạng `YYYY-MM-DD`; bỏ phiếu đã xoá. |
| FR50 | **JSON**: schema của version + mảng phiếu (`data` nguyên dạng) + metadata file đính kèm. |
| FR51 | Export chỉ gồm dữ liệu đã lên server; UI ghi rõ điều này. |

### 2.9 Admin quản lý phiếu
| ID | Yêu cầu |
|---|---|
| FR52 | Danh sách phiếu theo form version, phân trang, lọc theo surveyor. |
| FR53 | Chi tiết phiếu + lịch sử: các revision (ai, khi nào, field nào đổi) và các bản ghi `conflict_log`. |
| FR54 | Sửa/xoá phiếu online với kiểm tra version. Nếu nhận 409: báo "Phiếu vừa được thay đổi — tải lại" (admin **không** có merge; admin online nên hiếm gặp). |

## 3. Yêu cầu phi chức năng

| ID | Nhóm | Yêu cầu |
|---|---|---|
| NFR1 | Hiệu năng | Mở app offline < 3 s (điện thoại tầm trung, sau lần tải đầu). Lưu phiếu < 500 ms. Sync 100 phiếu + 20 ảnh (~400 KB/ảnh) < 60 s ở mạng 10 Mbps xuống / 5 Mbps lên. |
| NFR2 | Tin cậy | 0 phiếu mất, 0 phiếu trùng trong toàn bộ test matrix. Crash/reload ở bất kỳ thời điểm nào không để dữ liệu nửa vời (mọi ghi local là transaction). |
| NFR3 | Tương thích | Chrome/Edge Android & desktop (2 bản mới nhất): đầy đủ. Safari iOS ≥ 16.4: E1–E3 đạt. Firefox desktop: best-effort. Màn hình ≥ 360 px. |
| NFR4 | Bảo mật | HTTPS; mật khẩu bcrypt; JWT HS256; phân quyền kiểm tra ở server cho mọi endpoint; validate Zod ở server; kiểm tra MIME bằng magic bytes + giới hạn kích thước; endpoint test chỉ bật khi `NODE_ENV=test`. Token lưu trong IndexedDB (chấp nhận rủi ro XSS; cấm `dangerouslySetInnerHTML`). |
| NFR5 | Usability | Mobile-first, vùng chạm ≥ 44 px, UI tiếng Việt. Conflict UI: 3/3 người thử ngoài nhóm giải thích đúng chuyện gì xảy ra và giải quyết < 2 phút. |
| NFR6 | Kiểm thử được | Backoff, interval, timeout cấu hình được qua env; server có fault injection ở môi trường test; test đặt tên theo test ID. |
| NFR7 | Bảo trì | TypeScript `strict`; mọi hằng số ở `packages/shared/src/constants.ts`; hợp đồng API định nghĩa bằng Zod dùng chung. |
| NFR8 | Quan sát | Server log JSON (pino) kèm `opId`, `userId`, `responseId`; client lưu `lastError` trên từng op. |

## 4. Giá trị chuẩn (constants)

Mọi tài liệu và code dùng các giá trị sau. Đổi giá trị = sửa bảng này + `constants.ts` trong cùng PR.

| Hằng số | Giá trị |
|---|---|
| `JWT_TTL` | 7 ngày |
| `SYNC_INTERVAL` | 30 s (khi online) |
| `BACKOFF_BASE` / `BACKOFF_FACTOR` / `BACKOFF_CAP` | 2 s / ×2 / 5 phút, jitter nhân `random(0.5, 1)` |
| `RETRY_WARN_AFTER` | 5 lần thử |
| `REQUEST_TIMEOUT_JSON` / `REQUEST_TIMEOUT_UPLOAD` | 30 s / 120 s |
| `PULL_LIMIT` | 200 bản ghi/trang |
| `MAX_FILES_PER_FIELD` | 5 |
| `IMAGE_MAX_EDGE` / `IMAGE_MAX_BYTES` | 1600 px / 1.5 MB (sau nén) |
| `FILE_MAX_BYTES` (PDF) | 5 MB |
| `THUMBNAIL_MAX_EDGE` | 256 px |
| `ALLOWED_MIME` | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| `DRAFT_AUTOSAVE_DEBOUNCE` | 1 s |
| `TEXT_MAX_LENGTH` / `TEXTAREA_MAX_LENGTH` | 500 / 5 000 ký tự |

## 5. Màn hình

| ID | Màn hình | Vai trò | Offline |
|---|---|---|---|
| S1 | Đăng nhập | cả hai | ✗ |
| S2 | Trang chủ surveyor: tab "Form" và tab "Phiếu của tôi" (có badge trạng thái) | surveyor | ✓ |
| S3 | Điền / sửa phiếu | surveyor | ✓ |
| S4 | Hàng đợi đồng bộ (op, lỗi, dung lượng, "Đồng bộ ngay") | surveyor | ✓ |
| S5 | Danh sách xung đột + chi tiết giải quyết | surveyor | ✓ (gửi quyết định khi online) |
| S6 | Danh sách form (admin) | admin | ✗ |
| S7 | Form builder + preview + publish | admin | ✗ |
| S8 | Danh sách phiếu, chi tiết, lịch sử, sửa/xoá, export | admin | ✗ |

Header chung: chỉ báo online/offline, số thay đổi chờ, badge xung đột, thông báo phiên bản mới.

## 6. Tiêu chí chấp nhận (Acceptance criteria)

| ID | Given / When / Then | FR | Test |
|---|---|---|---|
| AC1 | **Given** đã đăng nhập và mở app một lần online, **when** tắt mạng và reload, **then** app hiển thị danh sách form và phiếu. | FR20, FR2 | E1 |
| AC2 | **Given** offline, **when** điền phiếu có 1 ảnh và bấm Lưu rồi reload, **then** phiếu và ảnh còn, badge "Chờ đồng bộ". | FR16, FR37, FR21 | E2 |
| AC3 | **Given** 3 phiếu chờ đồng bộ, **when** có mạng, **then** trong 1 chu kỳ sync cả 3 thành "Đã đồng bộ", server có đúng 3 phiếu, ảnh tải được. | FR27, FR38 | E3 |
| AC4 | **Given** phiếu đã đồng bộ, **when** sửa/xoá offline rồi có mạng, **then** server version tăng / có tombstone. | FR17, FR18 | E4, E5 |
| AC5 | **Given** server lỗi 500 hai lần, **when** sync, **then** lần 3 thành công, không bản trùng, UI hiển thị số lần thử. | FR28, FR31 | R2 |
| AC6 | **Given** server đã ghi nhưng response bị mất, **when** client gửi lại, **then** server trả kết quả cũ và chỉ có 1 bản ghi / 1 revision. | FR30 | R3 |
| AC7 | **Given** server trả 422, **when** sync, **then** phiếu "Lỗi" với thông điệp, không retry tự động. | FR29 | R4 |
| AC8 | **Given** token hết hạn và có phiếu chờ, **when** có mạng, **then** sync dừng, yêu cầu đăng nhập; sau đăng nhập phiếu đồng bộ đủ. | FR3 | R5 |
| AC9 | **Given** surveyor sửa field X offline và admin sửa field Y, **when** surveyor có mạng, **then** phiếu có cả X và Y, thông báo đã tự gộp, `conflict_log.auto_merged = true`. | FR42, FR47 | C1 |
| AC10 | **Given** hai bên sửa cùng field khác giá trị, **when** sync, **then** phiếu "Xung đột", màn hình hiển thị cả hai giá trị, người và thời điểm; chọn xong thì server lưu đúng giá trị đã chọn và có `conflict_log`. | FR43, FR48 | C3 |
| AC11 | **Given** server đã xoá phiếu mà tôi sửa offline, **when** sync, **then** hiện lựa chọn khôi phục/chấp nhận xoá và kết quả đúng lựa chọn. | FR44 | C4 |
| AC12 | **Given** tôi xoá offline phiếu mà server đã sửa, **when** sync, **then** hiện thay đổi của server và lựa chọn vẫn xoá/giữ bản server. | FR45 | C5 |
| AC13 | **Given** form có 5 field đủ loại và 10 phiếu, **when** admin export CSV, **then** file mở bằng Excel hiển thị đúng tiếng Việt, 10 dòng, cột khớp FR49. | FR49 | integration export |
| AC14 | **Given** admin publish version 2 trong khi surveyor offline còn phiếu theo version 1, **when** sync, **then** phiếu v1 được chấp nhận; phiếu mới sau pull dùng v2. | FR12 | C8 |

## 7. Definition of Done

**Mỗi PR / task:**
- Có ≥ 1 review approve; lint + typecheck sạch; CI xanh.
- Logic mới có unit hoặc integration test; thay đổi chạm offline/sync/conflict có E2E tương ứng.
- Cập nhật tài liệu nếu thay đổi hành vi hoặc hợp đồng (SPEC/API/DATA_MODEL/SYNC/ADR).
- Thay đổi UI surveyor đã thử trên điện thoại thật.

**MVP (v1.0):**
- 6 tính năng bắt buộc chạy trên staging HTTPS, demo được trên Android Chrome; iOS Safari đạt E1–E3.
- Toàn bộ E1–E6, C1–C9, R1–R8 tự động và xanh trong CI; Playwright report là artifact CI.
- ADR-001 ở trạng thái **Accepted**; README có bảng evidence trỏ tới test/ADR/CI run.
- Suite E2E xanh 10 lần liên tiếp; AC1 … AC14 đạt; NFR1, NFR5 đã đo và ghi kết quả vào README.
