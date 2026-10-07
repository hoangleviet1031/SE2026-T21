# shared/ – quy tắc riêng

Code dùng chung client và server. Chủ sở hữu: TV2; mọi PR sửa thư mục này cần **hai người duyệt** (team-plan).

- **Chỉ hàm thuần và kiểu.** Không I/O, không `fetch`, không DOM, không `node:*`, không đọc giờ hệ thống trong logic (nhận `now`/`random` qua tham số như `nextRetryDelay`).
- **`merge.ts` là cài đặt của ADR 0001 quy tắc 5–6.** Không đổi ngữ nghĩa khi chưa sửa ADR. Mọi thay đổi phải kèm unit test mới trong `merge.test.ts`.
- **Đổi kiểu trong `types.ts`** là đổi hợp đồng giữa client và server: cập nhật design §6.2/§7 cùng PR và báo cả nhóm.
- Mỗi file logic có file test cạnh nó (`x.ts` → `x.test.ts`), chạy bằng `npm test -w shared`.
- Xuất mọi thứ qua `src/index.ts`.
