# PLAN — Roadmap 8 tuần, milestone và deliverables

> Vai trò A/B/C: [TEAM.md](TEAM.md). Phân công chi tiết theo gói việc và khối lượng: **§7**. Tiêu chí "xong": [SPEC §7](SPEC.md#7-definition-of-done). Test ID: [TESTING.md](TESTING.md). Rủi ro & thứ tự cắt scope: [RISKS.md](RISKS.md).

**Lịch đề xuất** (chờ xác nhận, §6): Tuần 1 bắt đầu **Thứ Hai 05/10/2026** → Tuần 8 kết thúc **Chủ Nhật 29/11/2026**.

| Tuần | Ngày | Chủ đề | Milestone |
|---|---|---|---|
| 1 | 05/10 – 11/10 | Nền tảng | **M0** Foundation |
| 2 | 12/10 – 18/10 | Form + lõi offline | |
| 3 | 19/10 – 25/10 | Offline capture | **M1** Offline capture |
| 4 | 26/10 – 01/11 | Sync | **M2** Sync |
| 5 | 02/11 – 08/11 | Attachments + staging | |
| 6 | 09/11 – 15/11 | Conflict + export | **M3** Feature complete |
| 7 | 16/11 – 22/11 | Hardening + đủ test matrix | **M4** Feature freeze |
| 8 | 23/11 – 29/11 | Release | **M5** v1.0 + demo |

## 1. Roadmap theo tuần

Mã trong ngoặc (`A4`, `B7`, `C12` …) là gói việc ở §7.1.

### Tuần 1 — Nền tảng
| Owner | Việc |
|---|---|
| A | Wireframe 8 màn S1–S8, ưu tiên S3, S4, S5 (A1); khung Vite + React + Mantine + Router, header online/offline (A2); vite-plugin-pwa: precache, navigateFallback, manifest, prompt update (A3) |
| B | **Spike** (B1): Playwright + prod build — (1) reload offline với SW, (2) `context.route` chặn `/api` khi SW hoạt động, (3) Dexie lưu Blob qua reload; code spike thành `playwright.config.ts` + helper offline. Rà soát SYNC/ADR (B2); bắt đầu Dexie schema (B3) |
| C | `git init`, monorepo pnpm, TS strict, ESLint/Prettier, CI lint + typecheck, CODEOWNERS (C1); Fastify + Prisma + PostgreSQL qua Docker Compose, `.env.example` (C2); hợp đồng Zod theo [API.md](API.md) (C3) |
| Cả nhóm | Duyệt toàn bộ docs, chốt §6 |

**Deliverable:** repo + CI xanh; kết quả spike ghi trong PR; wireframe; API contract (Zod) merge.

### Tuần 2 — Form + lõi offline
| Owner | Việc |
|---|---|
| A | Form builder S6–S7: 7 loại field, ↑/↓, sửa/xoá, preview, publish; dùng MSW mock (A4) |
| B | Dexie schema v1 + repositories (B3); outbox + quy tắc coalescing (B4, bắt đầu); `threeWayMerge` + `explain` + unit (B5, bắt đầu — hàm thuần, không phụ thuộc API) |
| C | Hoàn tất contract (C3); auth + seed (C4); API forms/form-versions: bất biến khi publish, 1 draft/form, clone giữ field id (C5) |

**Deliverable:** admin tạo & publish form trên API thật; merge có unit test đầu tiên.

### Tuần 3 — Offline capture
| Owner | Việc |
|---|---|
| A | Renderer + validate (S3), danh sách phiếu + badge (S2), autosave nháp (A5) |
| B | Hoàn tất outbox + unit từng dòng [SYNC §3.2](SYNC.md#32-hành-động-local--outbox-mỗi-dòng-là-một-transaction-dexie) (B4); hoàn tất merge/explain + unit C1–C7 (B5); **E2E E1, E2** (B6) |
| C | `PUT/DELETE /responses/:id`: version, revisions, idempotency, advisory lock (C6); `/__test__/reset`, `/__test__/token` (C7); integration 409 + replay (C8) |

**Deliverable / M1:** điền & lưu phiếu offline, sống qua reload; E1, E2 xanh trong CI. SYNC.md chốt (sau đó đổi phải qua PR). Kiểu `ConflictRecord` + output `explain` chốt → A có dữ liệu mẫu cho S5.

### Tuần 4 — Sync
| Owner | Việc |
|---|---|
| A | S4 hàng đợi (op, lỗi, lần thử kế, "Thử lại ngay", "Đồng bộ ngay"), header số thay đổi chờ, banner đăng nhập lại (A6); S8 admin: danh sách + chi tiết (A7, phần 1) |
| B | Sync engine: trigger, Web Lock, `nextOp` (FIFO + dependsOn), dispatch, classify, backoff, reset `in_flight`, pull & apply + unit R1–R4 (B7); **E2E E3** (B8) |
| C | `GET /sync/pull` (C9) — **đầu tuần**, B cần cho pull; integration auth, forms, pull (C10); Playwright fixtures `devices`, `faults`, `api` (C11) |

**Deliverable / M2:** offline → online sync không conflict chạy được; E3 + unit R1–R4 + integration pull xanh.

### Tuần 5 — Attachments + staging
| Owner | Việc |
|---|---|
| A | S8 admin: lịch sử, sửa/xoá (A7, phần 2); field attachment: camera, chọn file, nén, thumbnail, preview, gỡ file (A8); dựng khung S5 với dữ liệu mẫu (A9, bắt đầu) |
| B | Hoàn tất engine (B7); attachments trong Dexie, op upload + `dependsOn` (B9); **E2E E4, E5** (B10) |
| C | **Deploy staging HTTPS** (C12); **E2E R1–R4** (C13); API attachments: sha256, size, magic bytes, `StorageAdapter`, URL ký (C14, phần 1) |

**Deliverable:** ảnh chụp offline lên server; staging truy cập được từ điện thoại; E4, E5, R1–R4 xanh.

### Tuần 6 — Conflict + export
| Owner | Việc |
|---|---|
| A | S5 hoàn chỉnh: danh sách xung đột, so sánh từng field + lời giải thích, mine/theirs, dialog xoá-vs-sửa, thông báo tự gộp (A9); **E2E E6** (A10) |
| B | Xử lý 409: merge, tự gộp, tạo conflict, op `resolution`, op mới sau quyết định (B11); bắt đầu R5–R6 (B12) |
| C | Hoàn tất attachments API (C14); export CSV/JSON (C15); `conflict_log`, `POST /conflict-resolutions`, `GET /responses/:id/history` (C16) |

**Deliverable / M3:** đủ 6 tính năng bắt buộc demo được trên staging.

### Tuần 7 — Hardening + đủ test matrix (feature freeze cuối tuần)
| Owner | Việc |
|---|---|
| A | **E2E C1, C3, C4, C5** (A11); usability test conflict UI với 3 người (A12); export UI (A13) |
| B | **E2E R5–R8** + hardening: quota, reload giữa sync, token hết hạn (B12); ADR-001 → **Accepted**, cập nhật ADR-002/003 (B13) |
| C | Integration attachments, export, conflict C3–C5, C8, C9 (C17); CI: Playwright report artifact, WebKit E1–E3, chạy E2E 10 lần; test thiết bị thật Android/iOS (C18) |

**Deliverable / M4:** toàn bộ E1–E6, C1–C9, R1–R8 xanh; ADR-001 Accepted; không thêm tính năng sau mốc này.

### Tuần 8 — Release
| Owner | Việc |
|---|---|
| A | Dữ liệu seed demo, kịch bản demo (§5), quay video dự phòng (A14) |
| Cả nhóm | Gói "Release chung" (§7.1): bug bash, sửa lỗi phần mình, cập nhật docs phần mình, 2 buổi tổng duyệt demo; B đo NFR1, C cập nhật bảng evidence README; tag `v1.0.0` |

**Deliverable / M5:** v1.0 trên staging, demo sẵn sàng, evidence đầy đủ.

## 2. Milestones

| Mốc | Cuối tuần | Tiêu chí qua mốc (kiểm tra được) |
|---|---|---|
| M0 Foundation | 1 | CI xanh trên `main`; spike (1)(2)(3) có kết luận; contract Zod merge; §6 đã chốt |
| M1 Offline capture | 3 | E1, E2 xanh trong CI; integration 409 + replay xanh; unit merge C1–C7 xanh |
| M2 Sync | 4 | E3, unit R1–R4, integration pull xanh; sync chạy trên máy dev |
| M3 Feature complete | 6 | 6 tính năng bắt buộc demo được **trên staging HTTPS**; E1–E5, R1–R4 xanh |
| M4 Freeze | 7 | Toàn bộ test matrix xanh; E2E 10 lần liên tiếp xanh; ADR-001 Accepted; usability 3/3 |
| M5 Release | 8 | DoD MVP ([SPEC §7](SPEC.md#7-definition-of-done)) đạt; tag v1.0.0 |

Trượt mốc → trong buổi Thứ Sáu áp dụng cơ chế cân bằng ở §7.4, sau đó mới đến thứ tự cắt ở [RISKS §3](RISKS.md#3-thứ-tự-cắt-scope-khi-trễ).

## 3. Dependencies

| Việc | Phụ thuộc | Cách tháo gỡ song song |
|---|---|---|
| Mọi việc UI/sync | API contract Zod (C3, T1) | A dùng MSW mock tới T3 |
| Merge/explain (B5, T2) | Chỉ cần form schema Zod | Hàm thuần — làm sớm để giảm rủi ro R-01 |
| Sync engine (B7, T4) | `PUT/DELETE /responses` (C6, T3), `/sync/pull` (C9, đầu T4) | B unit test engine với fetch giả |
| E2E offline (B6, T3) | Spike prod build + SW (B1, T1) | — (đường găng) |
| E2E sync/retry (B8, C13) | Fixtures (C11, T4) | B dùng helper từ spike cho E1/E2 trước |
| Attachments client (B9, T5) | Outbox `dependsOn` (B7), API attachments (C14) | Contract upload chốt T1 |
| Conflict UI (A9, T5–T6) | `ConflictRecord` + `explain` (B5, cuối T3) | A dựng S5 với dữ liệu mẫu |
| Xử lý 409 (B11, T6) | `conflict_log` API (C16, T6) | B gửi `resolution` theo contract, C làm song song |
| Conflict E2E (A11, T7) | S5 (A9) + 409 (B11) xong T6 | Admin sửa phiếu qua API thay vì UI |
| Test thiết bị thật (C18, T7) | Staging HTTPS (C12, T5) | — |

## 4. Deliverables tổng hợp

| Loại | Deliverable | Vị trí |
|---|---|---|
| Sản phẩm | PWA + API chạy trên staging HTTPS | URL staging (README) |
| Evidence | Offline E2E E1–E6 | `e2e/tests/offline` + CI artifact |
| Evidence | Conflict cases C1–C9 | `packages/shared/test`, `apps/api/test`, `e2e/tests/conflict` |
| Evidence | Sync retry R1–R8 | `packages/shared/test`, `apps/web/src/offline`, `e2e/tests/retry` |
| Evidence | ADR consistency model | [ADR/consistency-model.md](ADR/consistency-model.md) (Accepted) |
| Tài liệu | README, docs/*, kết quả NFR | repo |
| Demo | Kịch bản + dữ liệu seed + video dự phòng | `docs/` + release assets |

## 5. Kịch bản demo (~7 phút)

1. **Admin (laptop)**: tạo form "Khảo sát hộ gia đình" (số nhân khẩu, nguồn nước, ghi chú, ảnh nhà) → publish.
2. **Điện thoại (surveyor)**: mở app online → form xuất hiện. Bật **chế độ máy bay** → reload app vẫn chạy.
3. Điền 2 phiếu mới có chụp ảnh → badge "Chờ đồng bộ". Sửa một phiếu cũ (đã đồng bộ trước đó): đổi "Số nhân khẩu" và "Ghi chú".
4. **Admin** sửa cùng phiếu cũ đó: đổi "Số nhân khẩu" (khác giá trị) và "Nguồn nước".
5. Điện thoại tắt chế độ máy bay → 2 phiếu mới đồng bộ kèm ảnh; phiếu cũ: "Nguồn nước" và "Ghi chú" **tự gộp**, "Số nhân khẩu" **xung đột** → mở S5 đọc lời giải thích → chọn giá trị.
6. **Admin** mở lịch sử phiếu: thấy revisions + bản ghi conflict (ai quyết định gì) → **export CSV** mở bằng Excel.
7. Mở GitHub: CI xanh, Playwright report (E/C/R), ADR-001.

## 6. Quyết định cần team xác nhận

Chốt trong **Tuần 1** (trước M0). Nếu không có phản hồi, áp dụng mặc định.

| # | Quyết định | Mặc định trong tài liệu | Hạn |
|---|---|---|---|
| 1 | Gán người thật cho A / B / C | B = người mạnh nhất về logic bất đồng bộ | Ngày 1 |
| 2 | Ngày bắt đầu và ngày demo/nộp thực tế | 05/10/2026 → 29/11/2026 | Ngày 1 |
| 3 | Frontend React hay Vue (theo kỹ năng thực tế của nhóm) | React 19 + Mantine | Ngày 2 |
| 4 | Hạ tầng staging: VM nào, domain nào, ai quản lý | 1 VM (Student Pack/Azure for Students) + Caddy | Tuần 1 |
| 5 | Admin được sửa phiếu của điều tra viên — hợp lệ về nghiệp vụ với giảng viên? (đây là nguồn conflict chính trong demo) | Có | Tuần 1 |
| 6 | Surveyor chỉ thấy phiếu do mình tạo; không có phân công khảo sát | Có | Tuần 1 |
| 7 | Nháp chỉ lưu local, không đồng bộ (mất máy = mất nháp) | Chấp nhận | Tuần 1 |
| 8 | JWT 7 ngày, không refresh token, lưu trong IndexedDB | Chấp nhận | Tuần 1 |
| 9 | Giới hạn file: ≤ 5 file/field, ảnh ≤ 1.5 MB sau nén, PDF ≤ 5 MB, chỉ ảnh + PDF | Như trên | Tuần 2 |
| 10 | Định dạng CSV: 1 file/version, dấu phẩy, BOM, `"; "` và `" \| "` | Như trên | Tuần 4 |
| 11 | Baseline trình duyệt và thiết bị demo (nhóm có iPhone không?) | Android Chrome bắt buộc, iOS ≥ 16.4 best-effort | Tuần 1 |
| 12 | Repo GitHub: tên, public/private, quyền cho giảng viên xem CI/evidence | Private + mời giảng viên | Tuần 1 |
| 13 | Ngôn ngữ: UI & docs tiếng Việt; code, commit, tên test tiếng Anh (+ test ID) | Như trên | Tuần 1 |
| 14 | Năng lực mỗi người/tuần (§7.2 giả định 15 giờ) và ước lượng giờ của từng gói việc §7.1 | 15 h/tuần; ước lượng như §7.1 | Tuần 1 |

## 7. Phân công và cân bằng khối lượng

### Nguyên tắc
1. **Tổng giờ mỗi người ngang nhau** (chênh ≤ 5%), tính theo gói việc có ước lượng giờ. Mỗi người có ~8 giờ dự phòng trong 8 tuần.
2. **Ai làm tính năng thì viết E2E của tính năng đó.** C sở hữu hạ tầng test (fixtures, CI, chạy lặp), không viết hết mọi E2E.
3. **Cân cả độ khó, không chỉ số giờ.** B giữ phần rủi ro cao nhất (engine, merge, 409) nên không nhận UI hay hạ tầng. A và C nhận thêm E2E và PWA config để bù.
4. **Mỗi người chạm ít nhất hai tầng** (A: UI + E2E; B: offline + E2E; C: API + CI/deploy + E2E retry) để giảm rủi ro khi thiếu người.

So với phân vai ban đầu (A ≈ 97h, B ≈ 92h, C ≈ 122h), các gói sau đã được chuyển:

| Gói việc | Từ | Sang | Lý do |
|---|---|---|---|
| PWA config: SW, manifest, prompt update | B | A | Thuộc app shell; giảm tải B |
| E2E E1–E5 | C | B | B hiểu rõ trạng thái sync cần assert |
| E2E R5–R8 | C | B | Gắn với hardening edge case của engine |
| E2E E6, C1, C3, C4, C5 | C | A | A làm S5, nắm UI và selector |
| Merge/explain | B (T5) | B (T2–T3) | Làm sớm để giảm rủi ro R-01, và để A có dữ liệu mẫu sớm |
| Deploy staging | C (T4) | C (T5) | C ở T4 đã đủ tải với pull + fixtures |

### 7.1 Gói việc (work packages)

Ước lượng tính bằng giờ làm việc thực, đã gồm unit test và review của chính gói. Review PR của người khác nằm trong dự phòng.

**A — Frontend (112h)**
| Mã | Gói việc | Giờ | Tuần |
|---|---|---|---|
| A1 | Wireframe S1–S8 | 6 | 1 |
| A2 | Khung web, layout, header online/offline | 4 | 1 |
| A3 | PWA: vite-plugin-pwa, manifest, icon, prompt update (FR24, FR25) | 5 | 1 |
| A4 | Form builder S6–S7 + preview + publish | 16 | 2 |
| A5 | Renderer, validate, danh sách phiếu, nháp (S2–S3) | 14 | 3 |
| A6 | S4 hàng đợi + header sync + banner đăng nhập lại | 8 | 4 |
| A7 | S8 admin: danh sách, chi tiết, lịch sử, sửa/xoá | 10 | 4–5 |
| A8 | UI attachment: camera, nén, thumbnail, preview | 8 | 5 |
| A9 | Conflict UI S5 | 14 | 5–6 |
| A10 | E2E E6 | 2 | 6 |
| A11 | E2E C1, C3, C4, C5 | 8 | 7 |
| A12 | Usability test conflict UI (3 người) | 4 | 7 |
| A13 | Export UI | 2 | 7 |
| A14 | Seed demo, kịch bản demo, video dự phòng | 5 | 8 |
| — | Release chung | 6 | 8 |

**B — Offline/Sync (112h)**
| Mã | Gói việc | Giờ | Tuần |
|---|---|---|---|
| B1 | Spike offline + Playwright config nền + helper offline | 6 | 1 |
| B2 | Rà soát SYNC.md / ADR | 2 | 1 |
| B3 | Dexie schema + repositories | 8 | 1–2 |
| B4 | Outbox + coalescing + unit | 12 | 2–3 |
| B5 | `threeWayMerge` + `explain` + unit C1–C7 | 12 | 2–3 |
| B6 | E2E E1, E2 | 3 | 3 |
| B7 | Sync engine + unit R1–R4 | 20 | 4–5 |
| B8 | E2E E3 | 2 | 4 |
| B9 | Attachments client: Blob, op upload, `dependsOn` | 8 | 5 |
| B10 | E2E E4, E5 | 3 | 5 |
| B11 | Xử lý 409: tự gộp, conflict record, op `resolution` | 12 | 6 |
| B12 | E2E R5–R8 + hardening (quota, reload giữa sync, token hết hạn) | 14 | 6–7 |
| B13 | ADR-001 → Accepted, cập nhật ADR-002/003 | 4 | 7 |
| — | Release chung (+ đo NFR1) | 6 | 8 |

**C — Backend + QA/DevOps (112h)**
| Mã | Gói việc | Giờ | Tuần |
|---|---|---|---|
| C1 | Monorepo, CI lint/typecheck, CODEOWNERS | 6 | 1 |
| C2 | Khung API + Prisma + Docker Compose | 5 | 1 |
| C3 | API contract Zod (`shared/schemas`) | 6 | 1–2 |
| C4 | Auth + seed | 5 | 2 |
| C5 | Forms / form-versions API | 8 | 2 |
| C6 | `PUT/DELETE /responses`: version, idempotency, revisions, advisory lock | 12 | 3 |
| C7 | Endpoint test-only | 2 | 3 |
| C8 | Integration 409 + replay | 3 | 3 |
| C9 | `GET /sync/pull` | 5 | 4 |
| C10 | Integration auth, forms, pull | 5 | 4 |
| C11 | Playwright fixtures `devices`, `faults`, `api` | 6 | 4 |
| C12 | Deploy staging HTTPS (VM + Caddy) | 6 | 5 |
| C13 | E2E R1–R4 | 6 | 5 |
| C14 | Attachments API + `StorageAdapter` + URL ký | 8 | 5–6 |
| C15 | Export CSV/JSON | 6 | 6 |
| C16 | `conflict_log`, `/conflict-resolutions`, `/history` | 5 | 6 |
| C17 | Integration attachments, export, C3–C5, C8, C9 | 6 | 7 |
| C18 | CI report/WebKit/chạy 10 lần + test thiết bị thật | 6 | 7 |
| — | Release chung (+ bảng evidence README) | 6 | 8 |

**Release chung (6h mỗi người, Tuần 8):** bug bash 2h, sửa lỗi và docs phần mình 2h, 2 buổi tổng duyệt demo 2h.

### 7.2 Khối lượng theo tuần (giờ)

| Tuần | A | B | C | Ghi chú |
|---|---|---|---|---|
| 1 | 15 | 12 | 15 | |
| 2 | 16 | 16 | 15 | |
| 3 | 14 | 15 | 17 | C cao do API responses (đường găng M1) |
| 4 | 13 | 18 | 16 | B cao nhất do engine; A dự phòng hỗ trợ B nếu cần (§7.4) |
| 5 | 15 | 15 | 16 | |
| 6 | 14 | 15 | 15 | |
| 7 | 14 | 15 | 12 | C còn dư giờ để xử lý test flaky |
| 8 | 11 | 6 | 6 | Phần còn lại của năng lực dùng làm buffer sửa lỗi |
| **Tổng** | **112** | **112** | **112** | Năng lực giả định 15 h/tuần = 120h → dự phòng ~8h/người |

Phân bổ theo loại việc (giờ):

| Loại | A | B | C |
|---|---|---|---|
| Tính năng (UI / offline / API) | 81 | 68 | 60 |
| Test tự động (gói chủ yếu là test: E2E, integration, fixtures, merge C1–C7) | 10 | 26 | 34 |
| Hạ tầng, tài liệu, nghiên cứu (spike, CI, deploy, ADR, wireframe, usability, demo) | 15 | 12 | 12 |
| Release chung | 6 | 6 | 6 |

Unit test viết kèm tính năng được tính vào dòng "Tính năng". Ngoại lệ: B5 được tính vào test, vì phần lớn công sức là bảng ca C1–C7. B12 được tách: 8h hardening tính vào tính năng, 6h E2E tính vào test.

### 7.3 Độ khó và dự phòng

| Người | Gói rủi ro cao | Người dự phòng | Người dự phòng cần nắm |
|---|---|---|---|
| A | A9 Conflict UI (khả năng "giải thích được") | B | Kiểu `ConflictRecord`, `explain` |
| B | B7 engine, B11 xử lý 409 | C | [SYNC.md](SYNC.md), fixtures `faults` |
| C | C6 idempotency/advisory lock, C12 deploy | A | [API.md](API.md), docker compose |

### 7.4 Giữ cân bằng trong khi làm
- Mỗi người ghi **giờ thực tế theo mã gói** (cột trên issue/board). Thứ Sáu so với §7.2.
- Một người vượt kế hoạch > 20% trong 2 tuần liên tiếp → chuyển một **gói linh hoạt** sang người đang dư giờ:

  | Gói linh hoạt | Có thể chuyển sang |
  |---|---|
  | A13 Export UI, A10 E2E E6 | C |
  | B8/B10 E2E E3–E5 | C |
  | B13 cập nhật ADR-002/003 | A |
  | C13 E2E R1–R4 | B |
  | C15 Export CSV/JSON | A |
  | C18 test thiết bị thật | A |

- Không chuyển các gói rủi ro cao (A9, B7, B11, C6) — với các gói này, người dự phòng **pair** chứ không nhận lại.
- Ước lượng sai > 30% ở một gói → cập nhật §7.1 trong PR và ghi lý do.
