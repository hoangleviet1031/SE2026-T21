# Offline-first Field Survey (APP-01)

PWA giúp điều tra viên **thu thập khảo sát khi không có mạng**, **tự đồng bộ** khi có kết nối, và xử lý **conflict theo cách giải thích được** cho người dùng.

> **Trạng thái:** 📄 Giai đoạn tài liệu (v0.1). Chưa có code: skeleton sẽ được scaffold ở Tuần 1 ([PLAN](docs/PLAN.md)). Các quyết định còn chờ nhóm xác nhận nằm ở [PLAN §6](docs/PLAN.md#6-quyết-định-cần-team-xác-nhận).

| | |
|---|---|
| Đề tài | APP-01 (STT 23) · Web / PWA · Độ khó: Khá |
| Team | 3 sinh viên: A Frontend · B Offline/Sync · C Backend/QA/DevOps ([TEAM](docs/TEAM.md)) |
| Thời gian | 8 tuần ([PLAN](docs/PLAN.md)) |

## Mục tiêu

- Điền và lưu phiếu (kèm ảnh) **hoàn toàn offline**, dữ liệu còn nguyên sau reload hoặc khi đóng trình duyệt.
- Đồng bộ tự động, **không mất và không trùng** dữ liệu khi mạng chập chờn hoặc server lỗi.
- Khi hai bên sửa cùng một phiếu: nếu sửa khác field thì **tự gộp**; nếu cùng field thì **người dùng chọn**, kèm lời giải thích *ai đổi gì, lúc nào*.

## MVP: 6 tính năng bắt buộc

| # | Tính năng | Tóm tắt |
|---|---|---|
| 1 | **Form builder** | Admin tạo form với 7 loại field; version đã publish không sửa được nữa |
| 2 | **Offline storage** | Service worker cache app shell; dữ liệu và file lưu trong IndexedDB |
| 3 | **Sync queue** | Outbox bền vững, retry có backoff, idempotent, có màn hình hàng đợi |
| 4 | **Attachments** | Chụp ảnh hoặc đính kèm PDF khi offline, nén ảnh, upload trước phiếu |
| 5 | **Conflict UI** | Tự gộp khi khác field, so sánh từng field kèm giải thích, xử lý trường hợp xoá-vs-sửa |
| 6 | **Export** | CSV (UTF-8 BOM, mở được bằng Excel) và JSON |

Ngoài phạm vi: xem [PROJECT §5](docs/PROJECT.md#5-ngoài-phạm-vi-out-of-scope).

## Quick overview

```
Điện thoại (surveyor, offline-first)            VM (Docker Compose)
┌──────────────────────────────┐   HTTPS   ┌──────────────────────────────┐
│ React PWA                    │  REST     │ Caddy (TLS, static, /api)     │
│  IndexedDB (Dexie) + outbox  │◄─────────►│ Fastify API (Node 24)         │
│  Sync engine · merge 3-way   │           │ PostgreSQL 17 · file volume   │
│  Service worker (app shell)  │           └──────────────────────────────┘
└──────────────────────────────┘      Admin (laptop, online): builder · export
```

- **Consistency model** ([ADR-001](docs/ADR/consistency-model.md)): server là nguồn sự thật. Mỗi phiếu có `version`, conflict được phát hiện bằng `baseVersion` và giải quyết bằng merge 3-way theo từng field. Mỗi thao tác gửi kèm `opId` (idempotency key) nên gửi lại nhiều lần cũng chỉ áp dụng một lần. Mọi lần ghi đều có revision và mọi quyết định conflict đều được log.
- **Stack:** TypeScript · React 19 + Vite + Mantine · vite-plugin-pwa · Dexie 4 · Fastify · Prisma · PostgreSQL 17 · Vitest · Playwright · GitHub Actions. Lý do chọn từng thành phần: [ARCHITECTURE §5](docs/ARCHITECTURE.md#5-tech-stack).

## Cấu trúc repository

```
apps/web/          PWA React: UI + offline (Dexie, outbox, sync engine)
apps/api/          REST API Fastify + Prisma
packages/shared/   Zod schema, DTO, merge 3-way, backoff, constants (hàm thuần)
e2e/               Playwright: offline, conflict, retry
docs/              Tài liệu source of truth (xem bên dưới)
.github/           PR template (CI workflow được thêm ở Tuần 1)
```

## Tài liệu

| Tài liệu | Dùng để |
|---|---|
| [PROJECT](docs/PROJECT.md) | Bài toán, vai trò, scope, out-of-scope, thuật ngữ |
| [SPEC](docs/SPEC.md) | Yêu cầu FR/NFR, hằng số chuẩn, màn hình, acceptance criteria, DoD |
| [PLAN](docs/PLAN.md) | Roadmap 8 tuần, milestone, dependencies, demo, **quyết định cần xác nhận** |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Kiến trúc, component, luồng dữ liệu, tech stack, deploy |
| [DATA_MODEL](docs/DATA_MODEL.md) | Schema PostgreSQL, form schema JSON, IndexedDB, invariants |
| [API](docs/API.md) | Hợp đồng REST, mã lỗi |
| [SYNC](docs/SYNC.md) | Outbox, engine, retry/backoff, pull, merge, luồng conflict |
| [TESTING](docs/TESTING.md) | Chiến lược test, E1–E6, C1–C9, R1–R8, CI |
| [ADR](docs/ADR/README.md) | Quyết định kiến trúc (001 consistency model, 002–004) |
| [TEAM](docs/TEAM.md) | Vai trò, ownership, quy trình làm việc |
| [RISKS](docs/RISKS.md) | Risk register, thứ tự cắt scope |

Thứ tự ưu tiên khi tài liệu mâu thuẫn: **ADR > SPEC > SYNC/API/DATA_MODEL > các tài liệu khác**. Phát hiện mâu thuẫn thì mở PR sửa ngay.

## GitHub evidence (bắt buộc)

| Evidence | Vị trí | CI run / report |
|---|---|---|
| Offline E2E (E1–E6) | `e2e/tests/offline/` | _(link sau Tuần 3)_ |
| Conflict cases (C1–C9) | `packages/shared/test/merge.test.ts`, `apps/api/test/`, `e2e/tests/conflict/` | _(link sau Tuần 6)_ |
| Sync retry tests (R1–R8) | `packages/shared/test/`, `apps/web/src/offline/sync/`, `e2e/tests/retry/` | _(link sau Tuần 4)_ |
| ADR consistency model | [docs/ADR/consistency-model.md](docs/ADR/consistency-model.md) | Proposed → Accepted (Tuần 7) |

## Bắt đầu phát triển (từ Tuần 1)

Yêu cầu: Node 24 LTS (`.nvmrc`), pnpm, Docker. Các lệnh `pnpm dev`, `pnpm test`, `pnpm e2e` sẽ được định nghĩa khi scaffold ở Tuần 1 và cập nhật vào đây.

## Kết quả đo (điền ở Tuần 8)

| Chỉ tiêu | Mục tiêu | Kết quả |
|---|---|---|
| Mở app offline | < 3 s | — |
| Sync 100 phiếu + 20 ảnh (10/5 Mbps) | < 60 s | — |
| E2E 10 lần liên tiếp | 10/10 xanh | — |
| Usability conflict UI | 3/3 người thử | — |
