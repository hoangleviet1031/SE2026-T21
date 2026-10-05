# TEAM — Vai trò, ownership và cách làm việc

> Lịch theo tuần: [PLAN.md](PLAN.md). Rủi ro nhân sự: [RISKS.md](RISKS.md).

## 1. Vai trò

| | **A — Frontend lead** | **B — Offline/Sync lead** | **C — Backend + QA/DevOps lead** |
|---|---|---|---|
| Thành viên | _(điền tên)_ | _(điền tên — người mạnh nhất về logic/bất đồng bộ)_ | _(điền tên)_ |
| Sở hữu chính | Toàn bộ UI: builder, renderer, danh sách phiếu, S4 hàng đợi, S5 conflict UI, admin S6–S8, export UI; **PWA config** (service worker, manifest, prompt update); UX mobile; seed & kịch bản demo | IndexedDB/Dexie, repositories, outbox, sync engine, attachments phía client, `shared/sync/*` (merge, explain, classify, backoff), ADR-001…003, [SYNC.md](SYNC.md) | API, Prisma/DB, idempotency, pull, attachments server, export, auth, CI, deploy, Playwright fixtures, ADR-004, [API.md](API.md), [DATA_MODEL.md](DATA_MODEL.md) phần server |
| Test phụ trách | E2E **E6, C1, C3, C4, C5**; usability test | Unit `shared/sync` (C1–C7), unit `web/offline`; E2E **E1–E5, R5–R8**; Playwright config nền (spike) | Integration API; E2E **R1–R4**; fixtures `devices/faults/api`; CI evidence, chạy lặp 10 lần, WebKit |
| Khối lượng | 112h ([PLAN §7](PLAN.md#7-phân-công-và-cân-bằng-khối-lượng)) | 112h | 112h |
| Dự phòng cho | C (API, docker compose) | A (conflict UI) | B (sync engine) |

Cả nhóm: review chéo, demo nội bộ thứ Sáu, tài liệu phần mình sở hữu. Danh sách gói việc (A1–A14, B1–B13, C1–C18) và giờ theo tuần nằm ở [PLAN §7](PLAN.md#7-phân-công-và-cân-bằng-khối-lượng).

## 2. Ownership theo thư mục

Dùng làm `.github/CODEOWNERS` ở Tuần 1 (reviewer bắt buộc; owner **không** được tự merge PR của chính mình).

| Đường dẫn | Owner | Reviewer bắt buộc thêm |
|---|---|---|
| `apps/web/src/features/**` | A | — |
| `apps/web/vite.config.ts` (PWA) | A | B |
| `apps/web/src/offline/**` | B | — |
| `packages/shared/src/sync/**` | B | C |
| `packages/shared/src/schemas/**` | C | A, B (hợp đồng) |
| `apps/api/**` | C | — |
| `e2e/fixtures/**`, `e2e/playwright.config.ts`, `.github/**` | C | — |
| `e2e/tests/offline/**` | B (E6: A) | C |
| `e2e/tests/conflict/**` | A | B, C |
| `e2e/tests/retry/**` | B (R1–R4: C) | C |
| `docs/API.md`, `docs/DATA_MODEL.md` | C | A, B |
| `docs/SYNC.md`, `docs/ADR/**` | B | A, C |
| `docs/SPEC.md`, `docs/PLAN.md` | cả nhóm | cả nhóm |

## 3. Quy trình làm việc

**Nhánh & commit**
- `main` được bảo vệ: chỉ merge qua PR, CI xanh, ≥ 1 approve.
- Nhánh: `feat/<mô-tả>`, `fix/<mô-tả>`, `docs/<mô-tả>`, `test/<mô-tả>`.
- Commit theo Conventional Commits: `feat(sync): add backoff`, `test(e2e): R3 replay`.
- Squash merge; tiêu đề PR = commit message.

**Pull request**
- Dùng template [.github/pull_request_template.md](../.github/pull_request_template.md): ghi FR và test ID.
- PR nhỏ (≤ ~400 dòng thay đổi logic). Review trong **24 giờ**.
- **Thay đổi hợp đồng** (`packages/shared/src/schemas/**`, API.md, DATA_MODEL.md) cần đủ **A, B, C** approve.

**Task & board**
- GitHub Issues + Project board: cột `Backlog → Tuần này → Đang làm → Review → Done`.
- Mỗi issue: FR/test ID liên quan, owner, tuần dự kiến, tiêu chí xong.
- Việc ngoài scope ([PROJECT §5](PROJECT.md#5-ngoài-phạm-vi-out-of-scope)) gắn nhãn `after-mvp`, không kéo vào tuần.

**Nhịp họp**
- Stand-up 15 phút: Thứ Hai, Thứ Tư, Thứ Sáu (đã làm / sẽ làm / đang vướng).
- Thứ Sáu: demo nội bộ trên điện thoại thật + cập nhật trạng thái milestone trong [PLAN.md](PLAN.md).
- Vướng > 1 ngày → báo ngay trên kênh nhóm, không chờ họp.

**Definition of Ready (trước khi nhận task)**
- Có FR/AC hoặc test ID; phụ thuộc đã xong hoặc có mock (MSW); người review đã biết.

**Definition of Done**: [SPEC §7](SPEC.md#7-definition-of-done).

## 4. Phân bổ công sức

Chi tiết: [PLAN §7](PLAN.md#7-phân-công-và-cân-bằng-khối-lượng). Tóm tắt:
- Mỗi người **112 giờ** trong 8 tuần (12–18 h/tuần), năng lực giả định 15 h/tuần → dự phòng ~8h/người.
- **Ai làm tính năng thì viết E2E của tính năng đó**; C giữ hạ tầng test (fixtures, CI, chạy lặp).
- B giữ phần rủi ro cao nhất (engine, merge, 409) nên không nhận UI hay hạ tầng; merge làm sớm từ Tuần 2 để A có dữ liệu mẫu cho S5 từ cuối Tuần 3.
- Mỗi Thứ Sáu so giờ thực tế với kế hoạch; lệch > 20% trong 2 tuần → chuyển **gói linh hoạt** (PLAN §7.4). Gói rủi ro cao chỉ pair, không chuyển.
- Nếu một người vắng > 3 ngày: người dự phòng (bảng §1) tiếp nhận, cắt theo thứ tự trong [RISKS.md](RISKS.md#3-thứ-tự-cắt-scope-khi-trễ).
