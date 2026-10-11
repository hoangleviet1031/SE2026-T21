# Worklog

Nhật ký công việc của nhóm, **mỗi người một file** để không xung đột khi merge:

| File | Người |
|---|---|
| [duong.md](duong.md) | Dương (TV1) |
| [hoang.md](hoang.md) | Hoàng (TV2) |
| [dai.md](dai.md) | Đại (TV3) |

Mục đích: ai làm gì, khi nào, ở đâu, để review, viết báo cáo và agent nắm tiến độ mà không phải đọc cả `git log`. Worklog không thay thế `docs/plan/` (trạng thái ticket) hay `docs/design.md` (spec).

## Quy ước

- **Chỉ sửa file của mình.** Muốn nhắc việc cho người khác thì ghi vào "Việc mở" của mình (cột "Chặn bởi") hoặc nhắn trong nhóm.
- Thêm dòng khi xong một việc, cùng PR với việc đó (hoặc PR docs riêng).
- **Mới nhất ở trên cùng.** Mỗi việc một dòng; không sửa dòng cũ, nếu sai thì thêm dòng mới.
- Bảng "Nhật ký" có đúng các cột: `Ngày | Ticket | Loại | Việc đã làm | Ref | Trạng thái`.
  - **Ngày:** `YYYY-MM-DD`.
  - **Ticket:** mã trong `docs/plan/` (vd. `TV2-03`), hoặc `—` nếu không thuộc ticket.
  - **Loại:** `feat` | `fix` | `test` | `docs` | `chore` | `review` | `quyết định`.
  - **Việc đã làm:** một câu, nói kết quả chứ không nói quá trình, tối đa khoảng 150 ký tự. Việc do AI viết thì vẫn ghi dưới tên người giám sát.
  - **Ref:** commit hash, `PR #n`, nhánh hoặc mục spec (vd. `design §5.7`).
  - **Trạng thái:** `xong` | `đang làm` | `chờ review` | `bị chặn`.
- Bảng "Việc mở" có các cột `Việc | Chặn bởi | Ghi chú`. Xong thì xoá khỏi bảng (vẫn còn trong "Nhật ký").
- Quyết định của nhóm ghi loại `quyết định` và cũng ghi vào `docs/design.md` §14.

## Ánh xạ tài khoản git

| Tên trong git | Người |
|---|---|
| `duongdotung09-cell` | Dương (TV1) |
| `hoang1031`, `hoangleviet1031` | Hoàng (TV2) |
| `MagnusW`, `daitrong94` | Đại (TV3) |
