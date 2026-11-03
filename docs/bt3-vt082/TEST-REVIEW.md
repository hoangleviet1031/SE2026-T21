# Review test do AI sinh

Bản nháp: commit `b522ae0` (35 test). Diff review: `git diff b522ae0 <commit review> -- server/test`. Tiêu chí lấy từ Lecture 07, slide "AI-generated tests thường lặp lại assumptions".

## Xoá (test trùng)

| # | Test | Lý do |
|---|---|---|
| D1 | unit "không có người nhận thì không gọi kênh và đếm vào skipped" | Trùng integration "dự án không có người nhận", bản đó còn đi qua route và có đối chứng |
| D2 | unit "mặc định: 4 lần gửi cùng lúc và hàng đợi 1000" | Ghim hằng số cấu hình (implementation coupling); logic đã có ở "quá sức chứa" và "không vượt concurrency" |
| D3 | unit "mỗi kết cục vào đúng một bộ đếm" | Từng bộ đếm đã kiểm bằng `toEqual` ở test khác. Dòng `sent + failed + ... = 5` đúng hiển nhiên ngay sau `toEqual` |

## Sửa (assertion yếu)

| # | Test | Trước | Sau |
|---|---|---|---|
| S1 | unit timeout, kênh lỗi | `logCount() >= 1`: dòng log bất kỳ cũng qua | So đúng `reason` và `recordId` của từng lỗi |
| S2 | integration "route gọi recordCreated" | `\|createdAt - updatedAt\| < 5000`: yếu và phụ thuộc đồng hồ | `createdAt === updatedAt` đã commit |
| S3 | integration "lỗi kênh được ghi log" | `not.toContain(MARKER)` nhưng thông báo vốn không có `data` và message lỗi cố định, nên **không thể fail** dù code log cả `err` | Kênh reject với message chứa MARKER; so đúng dòng log, có `errorName`, không có message |

S3 được chứng minh bằng thực nghiệm ở M5 trong [evidence/](evidence/): mutation log `err.message` bị bản đã sửa bắt.

## Thêm tay (bản nháp không có)

- AC4 `formId` cỡ 1 MB (review plan R4): agent sinh test không biết quyết định này.
- Nối dây mặc định của `createApp` (review plan R2).
- Log tràn hàng đợi theo đợt (review plan R5).

## Giữ nguyên

Bảng pairwise 12 ca và test tự kiểm phủ cặp: đã đối chiếu tay kết quả mong đợi với SPEC. Đối chứng dương `expectPipelineAlive`: nhờ nó các test "không thông báo" đỏ ở bản chưa có hành vi, thay vì xanh giả.
