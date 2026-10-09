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

## Kiểm thử

```bash
npm test             # unit (shared) + integration API (server)
npm run typecheck
npx playwright install chromium   # lần đầu
npm run test:e2e     # build, chạy vite preview + API in-memory, chạy E2E
```

E2E hiện có: điền phiếu offline rồi đồng bộ, retry khi server lỗi 500, xung đột cùng trường và giải quyết qua UI.

## Cấu trúc

```
shared/   kiểu dữ liệu, threeWayMerge, backoff (dùng chung client + server)
server/   Express API, SQLite; routes/ forms, records, attachments*, export*, faults (tiêm lỗi để test)
client/   React PWA; src/db (Dexie), src/sync (outbox, sync engine), src/pages, e2e/
docs/     tài liệu thiết kế, ADR, phân công
```

`*` là phần đang để trống (trả 501), có ghi `TODO(Thành viên N)` trỏ tới mục tương ứng trong tài liệu thiết kế.
