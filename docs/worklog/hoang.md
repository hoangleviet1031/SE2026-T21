# Worklog – Hoàng (TV2)

Quy ước ở [README.md](README.md).

## Việc mở

| Việc | Chặn bởi | Ghi chú |
|---|---|---|
| Rebase hoặc merge `main` vào `feat/tv2-multi-tenancy-core`, đổi số phiên bản design.md thành 0.5 | — | Xung đột ở header và bảng lịch sử design.md; giữ phần sửa §6.1 |
| TV2-03, TV2-04, TV2-05 theo §6.2 và §7 mới (`createdByName`, `updatedByName`, `hasMore`, `/me`) | rebase ở trên | Spec chốt 2026-10-10 |
| P6: phần sync của xoá phiếu (xoá hẳn hoặc tombstone) | ticket P6 (Dương thêm) | design §5.7 |

## Nhật ký

| Ngày | Ticket | Loại | Việc đã làm | Ref | Trạng thái |
|---|---|---|---|---|---|
| 2026-10-08 | TV2-02 | feat | Xác thực token, `requireMember`, lớp repo theo `ctx` | 7f8623a, nhánh `feat/tv2-multi-tenancy-core` | chờ review |
| 2026-10-08 | TV2-01 | feat | Migration 2 và schema multi-tenancy (`record_history.project_id`, index, FK, `CHECK` vai trò) | fd52235, nhánh `feat/tv2-multi-tenancy-core` | chờ review |
| 2026-10-07 | — | chore | Thay nội dung repo bằng dự án Offline-first Field Survey PWA | 3d7bda8 | xong |
