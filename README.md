# Offline-first Field Survey PWA

PWA thu thập phiếu khảo sát khi mất mạng, tự đồng bộ khi có kết nối, và giải thích xung đột cho người dùng. Một hệ thống phục vụ nhiều nhóm/tổ chức, mỗi nhóm là một dự án có dữ liệu tách biệt.

- Thiết kế: [docs/design.md](docs/design.md), phác thảo giao diện: [docs/ui.md](docs/ui.md)
- Mô hình nhất quán: [docs/adr/0001-consistency-model.md](docs/adr/0001-consistency-model.md)
- Nhiều tổ chức (multi-tenancy): [docs/adr/0002-multi-tenancy.md](docs/adr/0002-multi-tenancy.md)
- Ticket theo từng thành viên: [docs/plan/](docs/plan/README.md)

## Làm việc với AI

Code phần lớn do AI viết, con người giám sát. Trước khi bắt đầu, đọc [docs/vibe-coding.md](docs/vibe-coding.md).

- Luật cho AI agent: [CLAUDE.md](CLAUDE.md) và `CLAUDE.md` trong `server/`, `client/`, `shared/` ([AGENTS.md](AGENTS.md) cho công cụ khác).
- Với Claude Code: `/ticket TV2-03` để bắt đầu một ticket (lập kế hoạch trước, chờ duyệt), `/self-check TV2-03` để tự kiểm trước khi mở PR.
- PR theo mẫu [.github/pull_request_template.md](.github/pull_request_template.md); CI ở [.github/workflows/ci.yml](.github/workflows/ci.yml).
- Phân công 3 người: [docs/team-plan.md](docs/team-plan.md)

## Công nghệ

React 19 + Vite + TypeScript, Dexie (IndexedDB), vite-plugin-pwa (Workbox), Express 5 + SQLite có sẵn trong Node (`node:sqlite`), Vitest, Playwright.

## Yêu cầu

Node.js **22.13 trở lên** (cần `node:sqlite`). Không cần cài thêm cơ sở dữ liệu.

## Chạy

```bash
npm install
npm run dev          # API :3001 và web :5173 (web proxy /api sang API)
```

Mở http://localhost:5173. Để thử offline: DevTools > Network > Offline, rồi tải lại trang.

### Tài khoản demo

Đặt `SEED_DEMO=1` khi chạy server để nạp dữ liệu demo (chỉ dùng dev/test, mật khẩu cố định): `SEED_DEMO=1 npm run dev` (PowerShell: `$env:SEED_DEMO='1'; npm run dev`).

Mật khẩu chung: `demo-password`.

| Tên đăng nhập | Dự án |
|---|---|
| `lan` | `demo-yte`: supervisor; `demo-nongnghiep`: surveyor |
| `minh` | `demo-yte`: surveyor |
| `chu` | Owner của `demo-yte` và `demo-nongnghiep` |
| `admin` | quản trị hệ thống, không là thành viên dự án nào (dùng trang `/admin/`) |

Đăng nhập ở màn hình Đăng nhập bằng tên + mật khẩu. Seed không tạo token cố định nào (tech-debt N7): cần token để gọi API thì đăng nhập qua `POST /api/auth/login`. E2E tự bật `SEED_DEMO=1` và lấy token theo cách đó (`client/e2e/global-setup.ts`). Muốn nạp vào file DB mà không chạy server: `npm run seed:demo -w server` (từ chối khi `NODE_ENV=production`).

### Quản trị tài khoản

Người dùng tự tạo tài khoản trên app (ADR 0003). Lệnh dưới đây để tạo admin và hỗ trợ; dùng cùng `DB_PATH` với server, chạy được khi server đang chạy (design §12).

```bash
npm run user:add -w server -- --username dang --name "Đăng" [--admin]  # in mật khẩu tạm một lần
npm run user:reset-password -w server -- --user dang                   # quên mật khẩu: mật khẩu tạm mới, giữ phiên
npm run user:revoke-sessions -w server -- --user dang                  # mất máy: thu hồi mọi phiên
npm run user:disable -w server -- --user dang                          # khoá tài khoản và thu hồi mọi phiên
```

## Kiểm thử

```bash
npm test             # unit (shared) + integration API (server)
npm run typecheck
npx playwright install chromium   # lần đầu
npm run test:e2e     # build, chạy vite preview + API in-memory, chạy E2E
```

E2E hiện có: điền phiếu offline rồi đồng bộ, retry khi server lỗi 500, xung đột cùng trường và giải quyết qua UI.

Route tiêm lỗi `POST /api/__test/faults` (giả lập server lỗi 500, treo, cắt kết nối) chỉ bật khi đặt `ENABLE_TEST_ROUTES=1`. E2E tự bật; muốn thử bằng tay khi chạy dev thì:

```bash
ENABLE_TEST_ROUTES=1 npm run dev                  # bash
$env:ENABLE_TEST_ROUTES='1'; npm run dev          # PowerShell
```

## Cấu trúc

```
shared/   kiểu dữ liệu, threeWayMerge, backoff (dùng chung client + server)
server/   Express API, SQLite; routes/ forms, records, attachments*, export*, faults (tiêm lỗi để test)
client/   React PWA; src/db (Dexie), src/sync (outbox, sync engine), src/pages, e2e/
docs/     tài liệu thiết kế, ADR, phân công
```

`*` là phần đang để trống (trả 501), có ghi `TODO(Thành viên N)` trỏ tới mục tương ứng trong tài liệu thiết kế.
