# Worklog – Đại (TV3)

Quy ước ở [README.md](README.md).

## Việc mở

| Việc | Chặn bởi | Ghi chú |
|---|---|---|
| API kiểm thử chung: `match`, `chunkIndex`, `400`, `stats` (P8) | — | design §10.1; không tự thêm mode riêng vào `faults.ts` |
| Xem lại màn hình 3 (Xung đột) trong `ui.md` | — | Bộ lọc "Cần xử lý" đã làm chung ở §4.8, TV3-07 không làm riêng |

## Nhật ký

| Ngày | Ticket | Loại | Việc đã làm | Ref | Trạng thái |
|---|---|---|---|---|---|
| 2026-10-09 | TV3-01 | feat | Route tiêm lỗi chỉ bật khi `ENABLE_TEST_ROUTES=1`; thêm Vitest cho client; cập nhật design §9, §10 | PR #2 | xong |
| 2026-10-08 | — | docs | Ghi tên thành viên thay cho TV1/TV2/TV3 trong plan | 94fd618, PR #1 | xong |
