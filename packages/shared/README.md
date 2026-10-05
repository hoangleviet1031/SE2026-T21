# packages/shared — Kiểu dữ liệu, schema và logic thuần dùng chung

> Chưa có code. Scaffold ở Tuần 1 (owner: **C** cho DTO/schema API, **B** cho merge/sync-core).

Được import bởi `apps/web`, `apps/api` và `e2e`. **Chỉ chứa hàm thuần** (không I/O, không Dexie, không fetch) để unit test dễ và chạy được ở cả browser lẫn Node.

## Cấu trúc thư mục dự kiến

```
packages/shared/
  src/
    schemas/
      form-schema.ts     # Zod: FormSchema, Field (7 loại) — xem DATA_MODEL §2
      response-data.ts   # Zod: build validator từ FormSchema
      api.ts             # Zod: request/response DTO — xem API.md
    sync/
      merge.ts           # threeWayMerge(base, local, remote) — xem SYNC §8
      explain.ts         # sinh lời giải thích từ revisions (ai/khi nào/từ → thành)
      classify.ts        # classifyHttpResult() → retry | auth | conflict | permanent
      backoff.ts         # computeBackoff(attempts, config)
      equality.ts        # so sánh giá trị field (mảng = tập hợp)
    constants.ts         # giới hạn: số file, dung lượng, timeout, interval...
  test/                  # unit test Vitest — C1–C7 nằm ở đây
```

Mọi hằng số trong [SPEC §4](../../docs/SPEC.md#4-giá-trị-chuẩn-constants) phải được định nghĩa tại `constants.ts`, không hard-code ở nơi khác.
