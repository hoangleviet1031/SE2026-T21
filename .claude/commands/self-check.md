---
description: Tự kiểm tra nhánh hiện tại theo checklist review trước khi mở PR
argument-hint: "[mã ticket, tuỳ chọn]"
---

Ticket (nếu có): $ARGUMENTS

Kiểm tra nhánh hiện tại so với `main`. **Không sửa code**, chỉ báo cáo.

1. Chạy `npm run typecheck` và `npm test`. Ghi kết quả (đạt / lỗi, kèm vài dòng lỗi đầu).
2. Xem `git diff --stat main...HEAD` và `git diff main...HEAD`.
3. Nếu có mã ticket: đọc ticket trong `docs/plan/`, so danh sách file thay đổi với mục "File"; với từng tiêu chí "Xong khi", chỉ ra test nào kiểm chứng nó (hoặc ghi "chưa có test").
4. Đi qua checklist `docs/vibe-coding.md` §4. Với **mỗi mục** ghi: Đạt / Không đạt / Không áp dụng, kèm `file:dòng` làm bằng chứng khi Không đạt. Chú ý đặc biệt:
   - test bị xoá, `skip`, `only`, assertion bị nới, timeout tăng, `waitForTimeout`;
   - `any`, `@ts-ignore`, `as unknown as` mới, `!` mới;
   - `catch` nuốt lỗi;
   - SQL trên bảng dự án thiếu `project_id`, `projectId` lấy từ body/query;
   - đường nào xoá dữ liệu chưa đồng bộ;
   - ghi phiếu không cùng transaction với outbox;
   - thư viện mới trong `package.json`.
5. Liệt kê tài liệu cần cập nhật mà chưa cập nhật (design.md §7, §7.1, §10.1, bảng lịch sử; trạng thái ticket).
6. Kết luận: **Sẵn sàng mở PR** hoặc **Chưa**, kèm danh sách việc còn thiếu theo thứ tự quan trọng, và 2–3 chỗ người review nên đọc kỹ nhất.
