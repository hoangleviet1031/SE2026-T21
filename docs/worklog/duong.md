# Worklog – Dương (TV1)

Quy ước ở [README.md](README.md).

## Việc mở

| Việc | Chặn bởi | Ghi chú |
|---|---|---|
| TV1-01: Staging HTTPS – chờ Đại thử trên điện thoại | Đại | Dương, Hoàng đã đạt trên Android; Đại thử bằng iPhone (design §11.1 hỗ trợ Safari 16.4) |
| TV1-13: nút xoá phiếu và hộp xác nhận | TV2-13 (Hoàng) | design §5.7 |

## Nhật ký

| Ngày | Ticket | Loại | Việc đã làm | Ref | Trạng thái |
|---|---|---|---|---|---|
| 2026-10-12 | TV1-01 | feat | Staging HTTPS trên Azure + Caddy chạy `main`; `docs/deploy.md`, `scripts/deploy.sh` (sao lưu CSDL trước khi khởi động lại, kiểm `__test` 404). AI soạn tài liệu theo uỷ quyền của Dương | `feat/tv1-01-staging` | đang làm |
| 2026-10-11 | TV2-01, TV2-02, TV2-03 | review | Review nhánh lõi @7c5417a: typecheck, 109 test, 5 E2E xanh; SQL đều lọc `project_id`, `projectId` chỉ từ đường dẫn; 3 góp ý nhỏ (idempotency, `form_version`, `formId`) | `feat/tv2-multi-tenancy-core` | xong |
| 2026-10-10 | TV1-05 | feat | `validateRecord` trong `shared/` theo bảng §4.1 (7 loại trường, sai kiểu, ngày không tồn tại) + 45 unit test; thêm `FieldDef.hidden` | PR #7 | chờ review |
| 2026-10-10 | TV1-02 | feat | Màn hình nhập mã (stub): `auth.ts` get/set/clearToken trên bảng `meta`, chặn app khi chưa có mã, báo cần mạng khi offline; E2E `login.spec.ts`, `e2e/helpers.ts` `login()` | PR #6 | chờ review |
| 2026-10-10 | — | docs | Thêm ticket xoá phiếu TV2-13, TV1-13 và ca O7, O8; đưa bước ghi worklog vào CLAUDE.md, vibe-coding, mẫu PR | nhánh `docs/worklog-process` | chờ review |
| 2026-10-10 | — | docs | Chuyển P1, P2, P3, P5, P6, P8 sang "Đã chốt"; bỏ nhãn chờ chốt; design lên 0.4.1 | 702a666, PR #3 | xong |
| 2026-10-10 | — | quyết định | Nhóm chốt P1, P2, P3, P5, P6, P8 theo đề xuất | design §14 | xong |
| 2026-10-09 | — | docs | design lên 0.4: lấp chỗ hở spec (§3, §4.1, §4.7, §4.8, §5.7, §6.2, §7, §10.1); thêm `docs/ui.md`; thống nhất tên nhánh | bf2b577, PR #3 | xong |
| 2026-10-09 | — | quyết định | Chốt P4 (luật validate phiếu) và P7 (danh sách phiếu nhóm theo form, có bộ lọc) | design §14 | xong |
