# apps/web — PWA (React)

> Chưa có code. Scaffold ở Tuần 1 (owner: **A**, phần offline/sync: **B**).

Ứng dụng web duy nhất phục vụ cả 2 vai trò:
- **Surveyor** — offline-first: điền form, lưu IndexedDB, sync queue, conflict UI.
- **Admin** — online-only: form builder, xem/sửa response, export.

Tài liệu liên quan: [ARCHITECTURE](../../docs/ARCHITECTURE.md) · [SPEC](../../docs/SPEC.md) · [SYNC](../../docs/SYNC.md) · [DATA_MODEL §5](../../docs/DATA_MODEL.md#5-indexeddb-client)

## Cấu trúc thư mục dự kiến

```
apps/web/
  src/
    app/            # routing, layout, providers (Mantine, auth)
    features/
      auth/         # login, lưu token vào meta
      builder/      # [admin] form builder, preview, publish
      fill/         # [surveyor] form renderer, autosave draft
      responses/    # danh sách response (surveyor) + admin view/edit
      sync/         # màn hình hàng đợi, badge trạng thái, nút "Đồng bộ ngay"
      conflicts/    # conflict UI (field-level, xoá-vs-sửa)
      export/       # [admin] export CSV/JSON
    offline/        # (B) Dexie db, repositories, outbox, sync engine
    lib/            # api client (fetch + timeout + phân loại lỗi)
  public/           # manifest icons
  vite.config.ts    # (A) vite-plugin-pwa (generateSW, registerType: 'prompt')
```

Quy tắc: component UI **không** gọi API trực tiếp cho dữ liệu surveyor — chỉ đọc/ghi qua repository trong `src/offline/`.
