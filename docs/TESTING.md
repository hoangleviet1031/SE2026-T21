# TESTING — Chiến lược kiểm thử và GitHub evidence

> Evidence bắt buộc của đề tài: **Offline E2E · conflict cases · sync retry tests · ADR consistency model**. Tài liệu này định nghĩa từng ca, nằm ở đâu và chứng minh điều gì. Hành vi mong đợi lấy từ [SPEC.md](SPEC.md) và [SYNC.md](SYNC.md).

## 1. Nguyên tắc

1. **Logic quyết định được unit test trước** (merge, phân loại lỗi, backoff, coalescing) — nhanh, ổn định, phủ nhiều ca.
2. **Server được integration test với PostgreSQL thật** — version check, idempotency, pull cursor phụ thuộc transaction thật.
3. **E2E chứng minh hành vi người dùng** trên production build có service worker — ít nhưng đúng kịch bản.
4. Mỗi test mang **test ID** trong tên (`E1`, `C3`, `R2` …) để truy vết tới SPEC/ADR/README.
5. Không `sleep` cố định: chờ theo trạng thái (UI hoặc API); thời gian dùng `page.clock` hoặc cấu hình backoff ngắn.
6. Playwright `retries: 0` — test flaky phải sửa, không che.

## 2. Các tầng test

| Tầng | Công cụ | Vị trí | Owner | Chạy trong CI |
|---|---|---|---|---|
| Unit — shared | Vitest | `packages/shared/test` | B (merge/sync), C (schema/DTO) | ✓ |
| Unit — web offline | Vitest + `fake-indexeddb` + fetch giả | `apps/web/src/offline/**/*.test.ts` | B | ✓ |
| Component (tuỳ chọn) | Vitest + Testing Library | `apps/web/src/features/**` | A | ✓ |
| Integration — API | Vitest + Fastify `inject()` + PostgreSQL | `apps/api/test` | C | ✓ (service Postgres) |
| E2E | Playwright (Chromium; WebKit cho E1–E3) | `e2e/tests` | Infra/fixtures: C. Test: owner tính năng — B (E1–E5, R5–R8), A (E6, C1, C3–C5), C (R1–R4) | ✓ |
| Thủ công | Thiết bị thật, usability, hiệu năng | checklist §9 | cả nhóm | ✗ (ghi kết quả vào README) |

## 3. Môi trường E2E

- **Build web ở chế độ test**: production build (có SW) với `VITE_SYNC_INTERVAL_MS=1000`, `VITE_BACKOFF_BASE_MS=200`, `VITE_BACKOFF_CAP_MS=2000`; phục vụ bằng `vite preview` với proxy `/api` tới API.
- **API** chạy `NODE_ENV=test`; mỗi test gọi `POST /api/__test__/reset` trong `beforeEach`.
- **Fixtures** (`e2e/fixtures`):
  - `devices` — mỗi "thiết bị" là một `browser.newContext()` riêng (IndexedDB riêng); `admin` thao tác qua API hoặc UI.
  - `offline` — `goOffline(ctx)` = `context.setOffline(true)`; `waitForSwReady(page)`; `waitForSyncState(page, id, state)`; `readOutbox(page)` (đọc IndexedDB qua `page.evaluate`).
  - `faults` — chèn lỗi bằng `context.route('**/api/...')`:
    - lỗi HTTP: `route.fulfill({ status: 500 })` N lần đầu;
    - lỗi mạng: `route.abort('failed')`;
    - **mất response sau khi server đã ghi**: `await route.fetch()` (server commit) rồi `route.abort('failed')`;
    - treo: không gọi `continue` cho tới khi test cho phép.
- **Spike Tuần 1 (bắt buộc)** phải xác nhận: (1) reload offline chạy được với SW, (2) `context.route` chặn được request `/api` khi SW đang hoạt động. Nếu (2) không ổn định → làm endpoint dự phòng `POST /api/__test__/faults` ([API §10](API.md#10-test-only-chỉ-khi-node_envtest)).

## 4. Offline E2E (E1–E6)

| ID | Kịch bản | Assertion chính | File |
|---|---|---|---|
| E1 | Đăng nhập online, chờ SW ready + pull xong → offline → reload | Header "Offline"; danh sách form & phiếu hiển thị; không lỗi mạng trên UI | `offline/e1-shell.spec.ts` |
| E2 | Offline: điền phiếu có 1 ảnh (file fixture) → Lưu → reload | Phiếu còn, dữ liệu đúng, ảnh preview hiển thị, badge "Chờ đồng bộ", outbox có 1 `upload` + 1 `upsert` | `offline/e2-capture.spec.ts` |
| E3 | Offline tạo 3 phiếu (1 có ảnh) → online | Cả 3 "Đã đồng bộ"; qua API: đúng 3 phiếu, version 1, ảnh `GET` được, sha256 khớp; outbox rỗng | `offline/e3-sync.spec.ts` |
| E4 | Phiếu đã sync → offline sửa 2 lần → online | Server version = 2 (hai lần sửa được gộp thành 1 op); dữ liệu = lần sửa cuối | `offline/e4-edit.spec.ts` |
| E5 | Phiếu đã sync → offline xoá → online | API: phiếu `deleted = true`; local không còn phiếu | `offline/e5-delete.spec.ts` |
| E6 | Có op chờ (offline) → deploy bản build mới (đổi hash) → mở lại | Banner "Có phiên bản mới"; sau "Tải lại" op và dữ liệu còn nguyên, sync thành công | `offline/e6-sw-update.spec.ts` |

E1–E3 chạy thêm trên WebKit (xấp xỉ Safari; kết quả iOS thật kiểm tay theo §9).

## 5. Conflict cases (C1–C9)

"A" = surveyor trên thiết bị A; "Admin" sửa qua API/UI admin. Mọi ca bắt đầu từ một phiếu đã đồng bộ ở version 1.

| ID | Thiết lập | Kết quả mong đợi | Unit | Integ | E2E |
|---|---|---|---|---|---|
| C1 | A offline sửa field X; Admin sửa field Y; A online | Tự gộp: server có X của A, Y của Admin, version 3; thông báo "Đã tự gộp"; `conflict_log.auto_merged = true` | ✓ | | ✓ |
| C2 | A và Admin cùng sửa field X thành cùng giá trị | Không conflict, không ghi thêm; phiếu = bản server | ✓ | | |
| C3 | A và Admin sửa field X khác giá trị | Phiếu "Xung đột"; S5 hiển thị base/của tôi/của server + tên Admin + giờ; chọn "Giữ của tôi" → server = giá trị A; biến thể chọn "Giữ của server" → không ghi dữ liệu, có log | ✓ | ✓ | ✓ |
| C4 | Admin xoá; A offline sửa | Dialog "Khôi phục / Chấp nhận xoá"; Khôi phục → server hết tombstone, data = A; Chấp nhận → local mất phiếu, có log `accept_delete` | ✓ | ✓ | ✓ |
| C5 | A offline xoá; Admin sửa | Dialog hiển thị thay đổi của Admin; "Vẫn xoá" → tombstone; "Giữ bản server" → local = server, có log `keep_server` | ✓ | ✓ | ✓ |
| C6 | A offline sửa field X hai lần (gộp op), Admin sửa X | Base dùng cho merge = dữ liệu version 1 (không phải lần sửa đầu); conflict đúng 1 field | ✓ (repo + merge) | | |
| C7 | A thêm ảnh vào field ảnh; Admin gỡ/đổi ảnh cùng field | Conflict ở field ảnh; chọn một bên, tập id đúng bên đã chọn | ✓ | | |
| C8 | Admin publish version 2 khi A offline có phiếu mới theo version 1 | Phiếu v1 được chấp nhận (200); sau pull, phiếu mới của A dùng v2 | | ✓ | |
| C9 | A gửi quyết định conflict, nhưng Admin sửa tiếp trước khi op tới | 409 lần nữa → conflict mới với base = version đã thấy lần trước; không mất giá trị nào; chỉ quyết định **được áp dụng** mới có `conflict_log` (quyết định bị 409 bị rollback cùng transaction) | ✓ | ✓ | |

Unit merge: `packages/shared/test/merge.test.ts` (bảng ca từ [SYNC §8](SYNC.md#8-merge-3-way)); E2E: `e2e/tests/conflict/c{1,3,4,5}-*.spec.ts`.

## 6. Sync retry (R1–R8)

| ID | Kỹ thuật chèn lỗi | Kết quả mong đợi | Unit | E2E |
|---|---|---|---|---|
| R1 | `setOffline(true)`, tạo 2 phiếu, tua `page.clock` qua nhiều chu kỳ | Không có request nào; `attempts = 0`; online → sync ngay | ✓ | ✓ |
| R2 | `fulfill 500` hai lần đầu cho `PUT /responses/:id` | `attempts = 3`, khoảng cách lần thử tăng; server 1 phiếu, 1 revision | ✓ | ✓ |
| R3 | Lần đầu `route.fetch()` rồi `abort` (server đã commit) | Lần gửi lại cùng `Idempotency-Key`; server trả kết quả cũ; **1 phiếu, 1 revision**, op xoá khỏi outbox | ✓ | ✓ |
| R4 | `fulfill 422 VALIDATION_FAILED` | Op `failed`, không gửi lại sau khi tua thời gian; UI hiển thị lỗi; "Sửa lại" → thành công với `opId` mới | ✓ | ✓ |
| R5 | Ghi token hết hạn vào `meta` (lấy từ `/__test__/token`), tạo phiếu offline, online | 401 → "Cần đăng nhập lại", engine dừng; đăng nhập → phiếu đồng bộ, không mất | ✓ | ✓ |
| R6 | `fulfill 503` hai lần đầu cho `PUT /attachments/:id` | `PUT /responses/:id` **không** được gửi trước khi upload thành công (ghi lại thứ tự request); cuối cùng đồng bộ đủ | ✓ | ✓ |
| R7 | Treo `PUT` (a: chưa tới server; b: sau `route.fetch()`), rồi `page.reload()` | Sau reload op `in_flight` → `pending`, gửi lại **cùng `Idempotency-Key`**; server 1 phiếu | ✓ | ✓ |
| R8 | Hai page cùng context (chung IndexedDB), cùng online | Mỗi `opId` chỉ được gửi 1 lần (đếm request theo `Idempotency-Key`) | | ✓ |

Unit: `packages/shared/test/{classify,backoff}.test.ts`, `apps/web/src/offline/sync/*.test.ts`; E2E: `e2e/tests/retry/r*-*.spec.ts`.

## 7. Integration API (ngoài C/R)

| Nhóm | Kiểm tra |
|---|---|
| Auth & quyền | Login đúng/sai; token hết hạn → 401; surveyor gọi API admin → 403; surveyor sửa phiếu người khác → 403 |
| Forms | Sửa version đã publish → 409 `FORM_VERSION_IMMUTABLE`; 1 draft/form (`DRAFT_EXISTS`); clone giữ field `id`; schema sai → 422 `SCHEMA_INVALID` |
| Responses | Tạo v1; cập nhật đúng base; base lệch → 409 kèm revisions đúng thứ tự; xoá → tombstone; khôi phục; xoá tombstone cùng version → 200 không đổi version |
| Idempotency | Gửi lại cùng key → cùng body, vẫn 1 revision; cùng key khác body → 422 `IDEMPOTENCY_KEY_REUSED` |
| Attachments | Upload; upload lại cùng hash → 200 không ghi lại; khác hash → 422; hash sai → 422; quá cỡ → 413; magic bytes sai → 415; phiếu tham chiếu file chưa có → 422 `ATTACHMENT_MISSING`; URL ký hết hạn → 401 |
| Pull | Phân trang theo cursor; chỉ phiếu của mình; có tombstone; **N ghi song song rồi pull toàn bộ không bỏ sót** |
| Export | CSV có BOM, header = label, multi_choice nối `"; "`, attachment là URL, bỏ tombstone; JSON đúng cấu trúc (AC13) |
| Conflict log | `resolution` trong PUT/DELETE ghi `conflict_log`; `POST /conflict-resolutions` idempotent theo `conflictId` |

## 8. Truy vết yêu cầu → test

| Yêu cầu | Test |
|---|---|
| FR20, FR2 | E1 |
| FR21, FR16, FR37 | E2 |
| FR26, FR27, FR38 | E3, R6 |
| FR17, FR18 | E4, E5, unit coalescing |
| FR24 | E6 |
| FR28 | R1, R2 |
| FR29 | R4 |
| FR30 | R3, R7, integration idempotency |
| FR33 | R8 |
| FR3 | R5 |
| FR5 | integration auth & quyền |
| FR41–FR48 | C1–C9 |
| FR10, FR11, FR12 | integration forms, C8 |
| FR49, FR50 | integration export |
| NFR1, NFR5 | thủ công §9 |

## 9. Kiểm thử thủ công (Tuần 7–8)

- **Thiết bị thật**: Android Chrome (bắt buộc), iOS Safari ≥ 16.4 (nếu nhóm có máy), Chrome desktop. Checklist: chế độ máy bay, chụp ảnh bằng camera, cài PWA, mở lại sau 1 ngày, E1–E3 bằng tay trên iOS.
- **Usability conflict UI** (NFR5): 3 người ngoài nhóm, kịch bản C3 + C4 có sẵn; đạt khi cả 3 tự nói đúng "chuyện gì đã xảy ra" và giải quyết < 2 phút. Ghi nhận vấn đề → sửa trước freeze.
- **Hiệu năng** (NFR1): Chrome DevTools throttle tuỳ chỉnh 10 Mbps xuống / 5 Mbps lên; seed 100 phiếu + 20 ảnh (~400 KB) offline; bấm online; đo tới khi outbox rỗng. Đo thời gian mở app offline trên điện thoại tầm trung. Ghi kết quả vào README.

## 10. CI và evidence

Workflow `.github/workflows/ci.yml` (tạo Tuần 1):

```
lint + typecheck ─► unit (shared, web) ─► integration (api + postgres service) ─► e2e (chromium; webkit E1–E3)
                                                                                     └─ upload artifact: playwright-report/, traces
```

- Chạy trên mọi PR và push lên `main`; `main` được bảo vệ, cần CI xanh.
- Evidence trong README: bảng **Evidence → file test → link CI run gần nhất → artifact report**.
- Trước release: chạy E2E 10 lần liên tiếp (workflow `workflow_dispatch` với matrix lặp) — tất cả xanh.
