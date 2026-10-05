# e2e — Playwright

> Chưa có code. Config nền từ spike Tuần 1 (**B**); fixtures + CI (**C**). Mỗi test do owner tính năng viết: B (E1–E5, R5–R8), A (E6, C1, C3–C5), C (R1–R4) — xem [PLAN §7](../docs/PLAN.md#7-phân-công-và-cân-bằng-khối-lượng).

Chiến lược & danh sách kịch bản: [docs/TESTING.md](../docs/TESTING.md).

## Cấu trúc thư mục dự kiến

```
e2e/
  playwright.config.ts   # webServer: build prod web + `vite preview`, API ở NODE_ENV=test
  fixtures/
    devices.ts           # tạo nhiều browser context = nhiều "thiết bị"
    offline.ts           # goOffline/goOnline, chờ SW ready, chờ trạng thái sync
    api.ts               # gọi /api/__test__/* để reset/seed/token, và API thật để kiểm tra dữ liệu
    faults.ts            # chèn lỗi bằng context.route: 5xx, abort, mất response sau commit, treo
  tests/
    offline/             # E1–E6
    conflict/            # C1, C3, C4, C5
    retry/               # R1–R8
```

Quy ước: tên test bắt đầu bằng test ID, ví dụ `test('R3 replay sau khi mất response không tạo bản trùng', ...)`.
Không dùng `waitForTimeout` — luôn chờ theo trạng thái (UI hoặc API).
