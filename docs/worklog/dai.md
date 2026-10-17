# Worklog – Đại (TV3)

Quy ước ở [README.md](README.md).

## Việc mở

| Việc | Chặn bởi | Ghi chú |
|---|---|---|
| Xem lại màn hình 3 (Xung đột) trong `ui.md` | — | Bộ lọc "Cần xử lý" đã làm chung ở §4.8, TV3-07 không làm riêng |

## Nhật ký

| Ngày | Ticket | Loại | Việc đã làm | Ref | Trạng thái |
|---|---|---|---|---|---|
| 2026-10-17 | TV3-10 | test | API kiểm thử `match`, `chunkIndex`, `stats` (P8); E2E R4 (cắt trước/sau khi ghi chunk 2, chunk 0 không gửi lại), O3 2 ảnh + "Đang tải ảnh (2)"; thử phá logic gửi tiếp thì R4 đỏ | nhánh `feat/tv3-10-e2e-o3-r4` | chờ review |
| 2026-10-17 | TV3-06 | docs | PR #37 đã merge; ghi ✅ trong plan | PR #37 | xong |
| 2026-10-16 | TV3-06 | feat | Hàng đợi upload ảnh: status → chunk thiếu → complete (SHA-256), backoff, `failed`; `displayState` ("Đang tải ảnh (n)", "Lỗi ảnh"); nút Thử lại/Bỏ ảnh này; ảnh đã bỏ không tính chưa gửi; E2E O3 + ảnh lỗi | nhánh `feat/tv3-06-upload-queue` | chờ review |
| 2026-10-16 | TV3-12 | docs | PR #36 đã merge (cùng TV2-14); ghi ✅ trong plan | PR #36 | xong |
| 2026-10-16 | TV3-12 | feat | CLI theo tên + mật khẩu (`user:add --username`, `reset-password`, `revoke-sessions`, `disable` thu hồi phiên, bỏ `rotate-token`); `seed:demo` mật khẩu demo + Owner `chu`; fixture và helper E2E đăng nhập qua `/api/auth/login` | nhánh `feat/tv2-14-accounts` | chờ review |
| 2026-10-16 | — | chore | Merge `main` (PR #34, #35) vào `feat/tv2-14-accounts`, gộp xung đột design.md (TV2-14 → 0.5.15) và worklog Hoàng | d413516 | xong |
| 2026-10-15 | TV3-03 | feat | Nén ảnh khi chọn/chụp: xoay theo EXIF, cạnh dài ≤ 1600, JPEG ≤ 600 KB, bỏ EXIF/GPS; thumbnail + nút bỏ ảnh; báo bộ nhớ đầy, ảnh không đọc được; E2E `photo.spec.ts` | nhánh `feat/tv3-03-compress-photo` | chờ review |
| 2026-10-15 | TV3-05 | docs | PR #30 đã merge; ghi ✅ trong plan | PR #30 | xong |
| 2026-10-15 | TV3-05 | feat | Upload ảnh theo chunk: migration 3 bảng `attachments`, 4 route `P/attachments/*`, kiểm SHA-256/magic bytes/giới hạn, dọn chunk 7 ngày; 23 ca test | nhánh `feat/tv3-05-attachments` | chờ review |
| 2026-10-15 | TV3-04 | docs | PR #29 đã merge; ghi ✅ trong plan | PR #29 | xong |
| 2026-10-15 | TV3-04 | test | `isolation.test.ts`: T1–T4; T5 tự liệt kê mọi route `P/...`, đòi đúng `403 not_member`/`401`; thử bỏ `requireMember` thì T5 đỏ | nhánh `feat/tv3-04-isolation-tests` | chờ review |
| 2026-10-15 | TV3-02 | docs | PR #8 đã merge (cùng TV2-01→03); ghi ✅ cho TV3-01 (PR #2), TV3-02 (PR #8) trong plan | PR #8 | xong |
| 2026-10-11 | TV3-02 | feat | CLI `user:add`, `user:rotate-token`, `user:disable`, `seed:demo` (chặn khi production), 14 ca test | nhánh `feat/tv3-02-cli-fixtures` | chờ review |
| 2026-10-09 | TV3-01 | feat | Route tiêm lỗi chỉ bật khi `ENABLE_TEST_ROUTES=1`; thêm Vitest cho client; cập nhật design §9, §10 | PR #2 | xong |
| 2026-10-08 | — | docs | Ghi tên thành viên thay cho TV1/TV2/TV3 trong plan | 94fd618, PR #1 | xong |
