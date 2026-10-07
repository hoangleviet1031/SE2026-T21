---
description: Bắt đầu một ticket trong docs/plan theo quy trình vibe coding có giám sát
argument-hint: <mã ticket, vd. TV2-03>
---

Ticket cần làm: $ARGUMENTS

Làm đúng theo các bước sau, theo docs/vibe-coding.md:

1. Tìm ticket `$ARGUMENTS` trong `docs/plan/*.md`. Nếu không thấy, dừng và báo.
2. Đọc: toàn bộ ticket; `CLAUDE.md`; `CLAUDE.md` của các thư mục ticket chạm tới; mọi mục spec/ADR ticket trỏ tới; các file trong mục "File" đang tồn tại.
3. Kiểm tra mục "Phụ thuộc": ticket phụ thuộc đã xong chưa (bảng trạng thái trong `docs/plan/README.md` và code thực tế). Chưa xong thì nói rõ và đề xuất cách làm tạm (stub) hoặc dừng.
4. **Chưa viết code.** Trình bày kế hoạch ngắn:
   - file sẽ tạo/sửa (đánh dấu file nằm ngoài danh sách của ticket và lý do);
   - test sẽ viết, ánh xạ tới từng tiêu chí "Xong khi";
   - thứ tự các bước nhỏ, mỗi bước kết thúc bằng typecheck/test xanh;
   - điểm spec chưa rõ hoặc mâu thuẫn với code hiện tại. **Không tự quyết** những điểm này.
   - Nếu ticket có nhãn **Lõi**: kế hoạch phải viết test trước.
   - Nếu ticket có nhãn **Người làm**: chỉ đưa gợi ý và checklist, không viết code thay.
5. Dừng lại, chờ người dùng duyệt kế hoạch.

Sau khi được duyệt: làm từng bước, chạy `npm run typecheck` và test liên quan sau mỗi bước. Kết thúc bằng báo cáo theo mục "Khi xong một ticket" trong `CLAUDE.md`, và nhắc người dùng chạy `/self-check`.
