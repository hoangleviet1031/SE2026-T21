# ARCHITECTURE — Kiến trúc hệ thống

> Liên quan: [DATA_MODEL.md](DATA_MODEL.md) · [API.md](API.md) · [SYNC.md](SYNC.md) · [ADR](ADR/README.md)

## 1. Nguyên tắc

1. **Server là nguồn sự thật**; mỗi thiết bị surveyor là bản sao cho phép ghi cục bộ ([ADR-001](ADR/consistency-model.md)).
2. **Chỉ luồng surveyor là offline-first.** Admin (builder, export, sửa phiếu) online-only → giảm một nửa bề mặt offline.
3. **UI surveyor không gọi API cho dữ liệu** — chỉ đọc/ghi IndexedDB qua repository. Chỉ sync engine nói chuyện với server.
4. **Service worker chỉ cache app shell** (HTML/JS/CSS/icon). Dữ liệu không đi qua HTTP cache ([ADR-002](ADR/client-storage-and-sw-scope.md)).
5. **Logic quyết định là hàm thuần trong `packages/shared`** (merge, phân loại lỗi, backoff, validate) → unit test được, dùng chung client/server/test.
6. Không thêm hạ tầng nếu không cần: 1 API process, 1 PostgreSQL, file trên disk, không queue/broker/cache server.

## 2. Sơ đồ tổng thể

```
┌─────────────────────────── Trình duyệt (PWA) ───────────────────────────┐
│                                                                          │
│  React UI                                                                │
│  ├─ Surveyor (offline-first): S2 S3 S4 S5                                │
│  │     │ read (liveQuery) / write (transaction)                          │
│  │  ┌──▼───────────────────────────┐     ┌────────────────────────────┐  │
│  │  │ Repositories (src/offline)   │     │ Sync Engine (src/offline)  │  │
│  │  │ forms · responses · attach.  │◄───►│ outbox processor · pull    │  │
│  │  └──┬───────────────────────────┘     │ Web Locks ('sync')         │  │
│  │     │                                 └──────┬──────────▲──────────┘  │
│  │  ┌──▼───────────────────────────────────┐    │ uses     │             │
│  │  │ IndexedDB (Dexie) 'field-survey'     │    │  packages/shared:      │
│  │  │ formVersions responses attachments   │    │  merge · classify ·    │
│  │  │ outbox conflicts meta                │    │  backoff · schemas     │
│  │  └──────────────────────────────────────┘    │                        │
│  └─ Admin (online-only): S6 S7 S8 ── api client ┤                        │
│                                                 │                        │
│  Service Worker (Workbox generateSW): precache app shell, navigateFallback│
└─────────────────────────────────────────────────┼────────────────────────┘
                                                  │ HTTPS · REST · JSON / multipart
┌─────────────────────── VM · Docker Compose ─────▼────────────────────────┐
│  Caddy ── TLS tự động · serve apps/web/dist · reverse proxy /api/*       │
│  API (Fastify, Node 24)                                                  │
│    auth · forms · responses · attachments · sync/pull · export ·         │
│    conflict-resolutions · [__test__ + fault injection khi NODE_ENV=test] │
│  PostgreSQL 17 (jsonb)            Volume: /data/attachments              │
└──────────────────────────────────────────────────────────────────────────┘
```

Frontend và API **cùng origin** (Caddy proxy) → không cần CORS, cookie/SW scope đơn giản.

## 3. Component và trách nhiệm

| Component | Vị trí | Trách nhiệm | Owner |
|---|---|---|---|
| UI Surveyor | `apps/web/src/features/{fill,responses,sync,conflicts}` | Renderer, danh sách, hàng đợi, conflict UI. Chỉ dùng repository. | A |
| UI Admin | `apps/web/src/features/{builder,responses,export}` | Builder, preview, danh sách/sửa phiếu, export. Gọi API trực tiếp. | A |
| Repositories | `apps/web/src/offline/repo` | Ghi dữ liệu + outbox trong 1 transaction; coalesce op; expose `liveQuery`. | B |
| Sync Engine | `apps/web/src/offline/sync` | Trigger, chọn op kế tiếp, gửi, phân loại kết quả, backoff, pull, xử lý 409. | B |
| API client | `apps/web/src/lib/api` | `fetch` + timeout + gắn token + map lỗi → `HttpResult`. | B |
| Service Worker | `vite-plugin-pwa` config | Precache shell; prompt khi có bản mới. | A |
| Shared | `packages/shared` | Zod schema (form, data, DTO), merge 3-way, explain, classify, backoff, constants. | B + C |
| API | `apps/api/src/routes`, `services` | Auth, phân quyền, version check, idempotency, revisions, pull, export. | C |
| Storage adapter | `apps/api/src/storage` | Ghi/đọc file theo `attachmentId`; hiện tại local disk. | C |
| DB | PostgreSQL + Prisma | Schema, migration, seed. | C |
| E2E | `e2e/` | Playwright, fixtures nhiều thiết bị, fault injection. | C (+B) |

## 4. Luồng dữ liệu chính

Chi tiết từng bước: [SYNC.md](SYNC.md).

**(a) Khởi tạo (online)**: Login → lưu token vào `meta` → SW precache → `persist()` → pull từ cursor 0 → form versions + phiếu của mình vào IndexedDB.

**(b) Ghi offline**: UI → repository → *một transaction*: ghi `responses` (+ `attachments`) + thêm/gộp op trong `outbox` → UI cập nhật qua `liveQuery`.

**(c) Sync**: Trigger → Web Lock `sync` → **push** (op theo thứ tự, file trước phiếu) → **pull** (theo cursor) → cập nhật `meta.lastSyncAt`.

**(d) Conflict**: PUT/DELETE trả 409 kèm bản server + revisions → `shared.threeWayMerge` → tự gộp và gửi lại, **hoặc** tạo bản ghi `conflicts` → UI S5 → người dùng chọn → op mới.

**(e) Admin**: UI admin → API trực tiếp (online) → ghi `responses` tăng version → surveyor nhận ở lần pull kế tiếp hoặc gặp 409 khi push.

## 5. Tech stack

| Lớp | Lựa chọn | Lý do chọn (và vì sao không chọn phương án khác) |
|---|---|---|
| Ngôn ngữ / repo | TypeScript `strict`, pnpm workspaces | Chia sẻ schema + merge giữa client, server, test; 1 ngôn ngữ cho 3 người. |
| Runtime | **Node 24 LTS** | Node 20 đã hết hỗ trợ (04/2026). |
| Frontend | **React 19** + Vite + React Router + **Mantine** | Hệ sinh thái lớn (Dexie hooks, ví dụ Playwright); Mantine có sẵn form/modal/notification → bớt công UI. Vue làm được nhưng không có lợi thế riêng cho bài này. |
| Form | Renderer tự viết từ JSON schema + React Hook Form + Zod | Chỉ 7 loại field; thư viện form-builder có sẵn nặng và khó kiểm soát offline. |
| PWA | vite-plugin-pwa (Workbox `generateSW`, `registerType: 'prompt'`) | Precache theo build tự động; `prompt` tránh reload giữa lúc sync. |
| Client DB | **IndexedDB qua Dexie 4** | Transaction nhiều bảng, index, lưu Blob, `liveQuery`; test bằng `fake-indexeddb`. localForage không có index/transaction; IndexedDB thuần tốn công. |
| Sync | **Tự viết**: outbox + REST | PouchDB/CouchDB: chọn winner tuỳ ý theo revision tree, team không quen CouchDB. Firestore/Supabase offline: LWW ẩn, không chứng minh được retry/conflict → không đáp ứng evidence bắt buộc. |
| Backend | **Fastify** + Zod | Nhẹ, `inject()` test không mở port. NestJS nhiều boilerplate cho 8 tuần; Express thiếu validate/typing sẵn. |
| DB | **PostgreSQL 17** + **Prisma** | `jsonb` cho dữ liệu form động + quan hệ + transaction/row lock cho version check. MongoDB không cần; SQLite yếu khi ghi đồng thời trên server. Truy vấn đặc thù (advisory lock, `FOR UPDATE`) dùng `$queryRaw`. |
| File | Local disk (Docker volume) sau interface `StorageAdapter` | Đủ cho demo; đổi sang S3/MinIO không ảnh hưởng API. |
| Test | Vitest, fake-indexeddb, **Playwright** | Playwright có `context.setOffline`, `page.route`, nhiều context = nhiều thiết bị. |
| CI | GitHub Actions (service Postgres) | Evidence nằm cùng repo. |
| Deploy | Docker Compose + **Caddy** trên 1 VM | Service worker bắt buộc HTTPS; Caddy tự cấp cert; cùng origin. |
| ID | UUIDv7 sinh ở client | Tạo phiếu offline không cần server; sắp xếp theo thời gian. |

Phiên bản chính xác (minor/patch) pin ở Tuần 1 qua lockfile.

## 6. Service worker — phạm vi

- **Precache**: toàn bộ output build (`index.html`, JS, CSS, font, icon, manifest).
- **Navigation fallback**: mọi route SPA → `index.html`; **denylist** `/api/*`.
- **Không** runtime-cache response API (dữ liệu đã nằm trong IndexedDB). Ảnh đầy đủ tải từ `/api/attachments/:id` khi online, không cache.
- **Update**: `registerType: 'prompt'` → banner "Có phiên bản mới — Tải lại" (FR24). Không `skipWaiting` tự động.
- Không dùng Background Sync API ([ADR-003](ADR/sync-trigger-in-app.md)).

## 7. Triển khai

| Môi trường | Mô tả |
|---|---|
| Local dev | `docker compose up db` + `pnpm dev` (Vite dev server proxy `/api`). SW chỉ kiểm thử bằng `vite build && vite preview`. |
| CI | Postgres service; build web prod; API chạy `NODE_ENV=test`; Playwright chạy trên `vite preview`. |
| Staging (từ Tuần 5) | 1 VM (GitHub Student Pack / Azure for Students), Docker Compose: `caddy`, `api`, `db`, volume `attachments`, volume `pgdata`. Domain có HTTPS. Backup: `pg_dump` thủ công trước demo. |

Biến môi trường chính (định nghĩa ở `.env.example` Tuần 1): `DATABASE_URL`, `JWT_SECRET`, `ATTACHMENT_DIR`, `PUBLIC_BASE_URL`, `NODE_ENV`; phía web: `VITE_SYNC_INTERVAL_MS`, `VITE_BACKOFF_BASE_MS`, `VITE_BACKOFF_CAP_MS` (rút ngắn trong test).

## 8. Bảo mật tối thiểu

- JWT HS256 trong header `Authorization: Bearer`, hạn 7 ngày, không refresh token.
- Mọi endpoint kiểm tra vai trò + quyền sở hữu phiếu ở server.
- Upload: kiểm tra kích thước trước khi ghi disk, magic bytes khớp MIME, tên file lưu = `attachmentId` (không dùng tên người dùng).
- `/api/__test__/*` và header `X-Fault` chỉ được đăng ký khi `NODE_ENV=test`.
