# apps/api — REST API (Fastify + Prisma + PostgreSQL)

> Chưa có code. Scaffold ở Tuần 1 (owner: **C**).

Server là **nguồn sự thật**. Hợp đồng API: [docs/API.md](../../docs/API.md). Schema DB: [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md).

## Cấu trúc thư mục dự kiến

```
apps/api/
  src/
    server.ts          # tạo Fastify app (export để test bằng inject())
    plugins/           # auth (JWT), error handler
    routes/
      auth.ts
      forms.ts         # forms + form-versions
      responses.ts     # PUT/DELETE có version check + idempotency, history
      attachments.ts
      sync.ts          # GET /sync/pull
      export.ts
      conflicts.ts     # POST /conflict-resolutions
      test.ts          # /__test__/* (chỉ đăng ký khi NODE_ENV=test; /faults chỉ làm nếu spike Tuần 1 cần)
    services/          # logic nghiệp vụ, transaction
    storage/           # StorageAdapter (local disk)
  prisma/
    schema.prisma
    migrations/
    seed.ts            # admin + 2 surveyor mẫu
  test/                # integration test (Vitest + Postgres thật)
```

Quy tắc: mọi ghi vào `responses` / publish `form_versions` đi qua 1 hàm service duy nhất, trong transaction có `pg_advisory_xact_lock` (xem [SYNC §7](../../docs/SYNC.md#7-server-xử-lý-ghi)).
