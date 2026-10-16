# Worklog – Hoàng (TV2)

Quy ước ở [README.md](README.md).

## Việc mở

| Việc | Chặn bởi | Ghi chú |
|---|---|---|
| TV2-14 (cùng PR với TV3-12 của Đại), rồi TV2-15, TV2-16 | — | ADR 0003; đăng nhập đổi nên phải hẹn Đại làm chung |

## Nhật ký

| Ngày | Ticket | Loại | Việc đã làm | Ref | Trạng thái |
|---|---|---|---|---|---|
| 2026-10-16 | TV2-13 | feat | `deleteRecordLocally` (xoá hẳn khi chưa thể tới server, xoá mềm + op xoá khi có thể đã tới, nháp gửi bản hợp lệ cuối), engine xoá phiếu và ảnh khi op xoá được xác nhận, pull bỏ qua tombstone của phiếu máy không có; nút Xoá phiếu hỏi `confirm()` rồi gọi hàm mới; E2E O7 (cả Huỷ), O8, mất response, nháp, conflict | nhánh `feat/tv2-13-delete-sync` | chờ review |
| 2026-10-16 | TV2-10 | feat | Phiếu `conflict` không lưu/xoá được (`RecordInConflictError`, FillPage báo kèm link), bỏ op `blocked`; sửa lỗi op tự gộp sau 409 phải chờ vòng sau (gửi lại ngay, tối đa 3 lần); E2E C1, C6, C8 (hai ca), khoá sửa, pull bỏ qua nháp | nhánh `feat/tv2-10-conflict-engine` | chờ review |
| 2026-10-12 | — | docs | ADR 0003 chấp nhận; design 0.5 và ui.md 0.2 ghi bản mới 🆕 / bản cũ 🕘; ADR 0002 ghi thay thế một phần; ticket TV1-14…16, TV2-14…17, TV3-12 | nhánh `docs/adr-0003-spec` | xong (PR #22) |
| 2026-10-12 | — | quyết định | Chốt ADR 0003 phía mình: mở tổ chức cần admin duyệt, admin không xem dữ liệu, trang quản trị riêng `/admin/`, tài khoản admin không vào tổ chức | `docs/adr/0003-accounts-and-owner-role.md` | xong (PR #21, #22) |
| 2026-10-12 | — | quyết định | ADR 0003 viết lại: vai trò `owner` (khách hàng), admin là người vận hành, bỏ xin tham gia, công khai chỉ hiện tên, tạo lại bảng `memberships` | `docs/adr/0003-accounts-and-owner-role.md`, design §14 P9 | xong (PR #21, #22) |
| 2026-10-12 | — | docs | Đề xuất ADR 0003: tự tạo tài khoản, xin tham gia tổ chức, vai trò admin tổ chức; thêm P9 vào design §14 | nhánh `docs/adr-0003-accounts` | xong (PR #21) |
| 2026-10-12 | TV2-09 | feat | Op `failed` (4xx tính một lần gửi), nút "Thử lại", sửa phiếu lỗi tạo op mới, "Xuất JSON phiếu này", cảnh báo tồn lâu; fault `'400'`, E2E R5 | nhánh `feat/tv2-09-failed-ops` | xong (PR #16) |
| 2026-10-12 | TV2-08 | feat | `request_hash` chuẩn hoá và 422 khi khác nội dung, dọn key > 30 ngày, fault `drop` sau khi ghi + `drop-before`; test R2, R3, R6 | nhánh `feat/tv2-08-idempotency` | xong (PR #15) |
| 2026-10-12 | TV2-07 | feat | Cursor theo phạm vi (`meta.pull`), xử lý bị rút/hạ vai trò không xoá dữ liệu chưa gửi, `NotMemberError`, `exportUnsentJson`/`forgetProject`; E2E T7–T9 | nhánh `feat/tv2-07-membership` | xong (PR #14) |
| 2026-10-12 | TV2-06 | feat | Đồng bộ mọi dự án trong Web Lock, `/me` cập nhật `AccountDb.projects` (dự án mất thành `removed`), số đếm theo dự án; E2E O6 | nhánh `feat/tv2-06-multi-project-sync` | xong (PR #13) |
| 2026-10-12 | TV2-05 | feat | Client tách CSDL `field-survey-account` và `field-survey-p-<projectId>`, UI lấy CSDL qua `useCurrentProjectDb`, xoá CSDL cũ; E2E `storage.spec.ts` | nhánh `feat/tv2-05-project-db` | xong (PR #10) |
| 2026-10-12 | TV2-04 | feat | `GET /api/me`, `/api/admin/projects` (tạo, đổi tên, lưu trữ, chỉ định giám sát viên), `requireAdmin`; test T4 và quyền admin | nhánh `feat/tv2-04-me-admin` | xong (PR #9) |
| 2026-10-11 | TV2-03 | feat | Route records/forms theo dự án có xác thực, pull theo phạm vi (`scope`), `updatedBy` từ token, client gửi token; fixture test và tài khoản demo (`SEED_DEMO=1`) | nhánh `feat/tv2-multi-tenancy-core` | xong (PR #8) |
| 2026-10-08 | TV2-02 | feat | Xác thực token, `requireMember`, lớp repo theo `ctx` | 7f8623a, nhánh `feat/tv2-multi-tenancy-core` | xong (PR #8) |
| 2026-10-08 | TV2-01 | feat | Migration 2 và schema multi-tenancy (`record_history.project_id`, index, FK, `CHECK` vai trò) | fd52235, nhánh `feat/tv2-multi-tenancy-core` | xong (PR #8) |
| 2026-10-07 | — | chore | Thay nội dung repo bằng dự án Offline-first Field Survey PWA | 3d7bda8 | xong |
