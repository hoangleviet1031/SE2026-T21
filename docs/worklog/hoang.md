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
| 2026-10-12 | TV2-07 | feat | Cursor theo phạm vi (`meta.pull`), xử lý bị rút/hạ vai trò không xoá dữ liệu chưa gửi, `NotMemberError`, `exportUnsentJson`/`forgetProject`; E2E T7–T9 | nhánh `feat/tv2-07-membership` | chờ review |
| 2026-10-12 | TV2-06 | feat | Đồng bộ mọi dự án trong Web Lock, `/me` cập nhật `AccountDb.projects` (dự án mất thành `removed`), số đếm theo dự án; E2E O6 | nhánh `feat/tv2-06-multi-project-sync` | chờ review |
| 2026-10-12 | TV2-05 | feat | Client tách CSDL `field-survey-account` và `field-survey-p-<projectId>`, UI lấy CSDL qua `useCurrentProjectDb`, xoá CSDL cũ; E2E `storage.spec.ts` | nhánh `feat/tv2-05-project-db` | chờ review |
| 2026-10-12 | TV2-04 | feat | `GET /api/me`, `/api/admin/projects` (tạo, đổi tên, lưu trữ, chỉ định giám sát viên), `requireAdmin`; test T4 và quyền admin | nhánh `feat/tv2-04-me-admin` | chờ review |
| 2026-10-11 | TV2-03 | feat | Route records/forms theo dự án có xác thực, pull theo phạm vi (`scope`), `updatedBy` từ token, client gửi token; fixture test và tài khoản demo (`SEED_DEMO=1`) | nhánh `feat/tv2-multi-tenancy-core` | chờ review |
| 2026-10-08 | TV2-02 | feat | Xác thực token, `requireMember`, lớp repo theo `ctx` | 7f8623a, nhánh `feat/tv2-multi-tenancy-core` | chờ review |
| 2026-10-08 | TV2-01 | feat | Migration 2 và schema multi-tenancy (`record_history.project_id`, index, FK, `CHECK` vai trò) | fd52235, nhánh `feat/tv2-multi-tenancy-core` | chờ review |
| 2026-10-07 | — | chore | Thay nội dung repo bằng dự án Offline-first Field Survey PWA | 3d7bda8 | xong |
