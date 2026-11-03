# Traceability: test case → test → AC/Risk → mutation

Tên test lấy nguyên văn từ lần chạy `npx vitest run test/notifications.test.ts test/notificationsRecords.test.ts --reporter=verbose` (41/41 tại `ca4b774`). Cột Mutation lấy từ `killedBy` trong `evidence/21-mutations-before.json` và `evidence/22-mutations-after.json`; "–" là test đó không làm đỏ mutation nào trong bộ M1–M10. Mutation chọn tay theo risk, nên "–" không có nghĩa test vô ích.

## Theo mã TC ở báo cáo

| TC | AC/Risk | File | Tên test | Mutation bắt được |
|---|---|---|---|---|
| TC01 | AC1, AC4 | `notifications.test.ts` | nội dung thông báo và người nhận (AC1, AC4, AC5) > gửi đúng một thông báo chỉ metadata tới supervisor và Owner, trừ người tạo, kể cả khi sự kiện lọt `data` | M7 |
| TC02 | AC1, AC5 | `notifications.test.ts` | nội dung thông báo và người nhận (AC1, AC4, AC5) > loại surveyor, tài khoản bị khoá, admin không là thành viên và thành viên dự án khác | M7, M8 |
| TC03 | AC1 | `notificationsRecords.test.ts` | AC1: đúng người, một lần > dự án không có người nhận: vẫn 201, không gọi kênh, đếm skipped | – |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 1: surveyor, create, deleted=true, kênh good, cỡ near2mb -> 201, 0 thông báo | M4, M6 |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 10: surveyor, conflict, deleted=false, kênh good, cỡ small -> 409, 1 thông báo | – |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 4: surveyor, edit, deleted=true, kênh failing, cỡ near2mb -> 200, 1 thông báo | – |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 5: supervisor, edit, deleted=false, kênh hanging, cỡ small -> 200, 1 thông báo | M9 |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > bảng phủ đủ mọi cặp giá trị của 5 yếu tố | – |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 3: owner, create, deleted=false, kênh hanging, cỡ near2mb -> 201, 1 thông báo | M7, M9 |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 7: surveyor, replay, deleted=true, kênh hanging, cỡ near2mb -> 201, 0 thông báo | M4, M6, M9 |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 8: supervisor, replay, deleted=false, kênh good, cỡ near2mb -> 201, 1 thông báo | M6 |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 6: owner, edit, deleted=true, kênh good, cỡ small -> 200, 1 thông báo | M7 |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 12: owner, conflict, deleted=false, kênh hanging, cỡ small -> 409, 1 thông báo | M7, M9 |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 2: supervisor, create, deleted=false, kênh failing, cỡ small -> 201, 1 thông báo | – |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 11: supervisor, conflict, deleted=true, kênh failing, cỡ near2mb -> 409, 1 thông báo | – |
| TC04 | AC1–AC4 | `notificationsRecords.test.ts` | bảng pairwise > ca 9: owner, replay, deleted=false, kênh failing, cỡ small -> 201, 1 thông báo | M6, M7 |
| TC05 | AC2, negative | `notificationsRecords.test.ts` | AC2: không báo sai sự kiện > 400, 401, 403, 404: không thông báo, không ghi phiếu | – |
| TC06 | AC2, negative, risk | `notificationsRecords.test.ts` | AC2: không báo sai sự kiện > 422: dùng lại key cho nội dung khác hoặc phiếu khác | – |
| TC06 | AC2, negative, risk | `notificationsRecords.test.ts` | AC2: không báo sai sự kiện > 413: vượt 2mb thì không ghi, không thông báo | – |
| TC07 | AC2 | `notificationsRecords.test.ts` | AC2: không báo sai sự kiện > chuỗi đời phiếu: bỏ xoá sau khi tạo đã xoá, replay sau khi sửa, gửi lại lệnh tạo bằng key mới | M4, M6 |
| TC08 | AC2 | `notificationsRecords.test.ts` | AC2: không báo sai sự kiện > gửi đồng thời cùng id: đúng một thông báo cho dù cùng key hay khác key | M6 |
| TC09 | Invariant, failure | `notificationsRecords.test.ts` | failure path: thông báo chỉ phát sinh sau khi commit > transaction rollback thì không thông báo; client gửi lại sau đó nhận đúng một thông báo | – |
| TC10 | AC3, failure | `notificationsRecords.test.ts` | AC3: lỗi kênh không ảnh hưởng giao dịch > kênh ném, reject, treo: status, body và dữ liệu đã commit giống hệt kênh tốt | M4, M9 |
| TC11 | AC3 | `notificationsRecords.test.ts` | AC3: lỗi kênh không ảnh hưởng giao dịch > lỗi kênh được ghi log có recordId; message của kênh có thể chứa dữ liệu phiếu nên không được vào log | M5 |
| TC12 | Invariant, failure | `notificationsRecords.test.ts` | invariant: notifier vi phạm hợp đồng > recordCreated ném lỗi sau commit: client vẫn 201 đúng body, phiếu đã ghi, có log, không lộ dữ liệu | M5, M10 |
| TC13 | Risk lớn, AC4 | `notifications.test.ts` | hàng đợi có giới hạn (AC4, N3) > quá sức chứa thì bỏ và đếm dropped, không ném lỗi, phần còn lại gửi theo thứ tự vào | M1 |
| TC14 | Risk lớn, failure | `notificationsRecords.test.ts` | AC4, N2: không chờ kênh, hàng đợi không chặn request > kênh treo và hàng đợi đầy: mọi PUT vẫn 201 ngay, dư thì đếm dropped | M1 |
| TC15 | AC4, biên | `notifications.test.ts` | biên độ dài id (AC4, review plan R4; bổ sung sau khi mutation M2, M3 sống sót) > formId dài 257 ký tự: 0 thông báo | – |
| TC15 | AC4, biên | `notifications.test.ts` | biên độ dài id (AC4, review plan R4; bổ sung sau khi mutation M2, M3 sống sót) > formId dài 256 ký tự: 1 thông báo | M2 |
| TC15 | AC4, biên | `notifications.test.ts` | biên độ dài id (AC4, review plan R4; bổ sung sau khi mutation M2, M3 sống sót) > recordId dài 257 ký tự: 0 thông báo | – |
| TC15 | AC4, biên | `notifications.test.ts` | biên độ dài id (AC4, review plan R4; bổ sung sau khi mutation M2, M3 sống sót) > recordId dài 256 ký tự: 1 thông báo | M3 |
| TC16 | AC4, risk lớn | `notificationsRecords.test.ts` | AC4: id quá dài (review plan R4) > formId cỡ 1 MB: phiếu vẫn 201, thông báo bị bỏ qua và đếm skipped, không giữ chuỗi trong hàng đợi | – |
| TC17 | N2 | `notifications.test.ts` | timeout (N2) > kênh treo bị abort, đếm timedOut, trả chỗ cho lần sau; kết thúc muộn không làm đếm lại | M9 |
| TC17 | N2 | `notifications.test.ts` | timeout với kênh tôn trọng signal (N2) > kênh reject ngay khi bị abort: tính là timedOut, không phải failed | – |
| TC17 | N2 | `notifications.test.ts` | kênh lỗi (AC3) > CSDL hỏng khi tra người nhận: không ném lỗi, idle() vẫn resolve, không gọi kênh | – |
| TC18 | R2 | `notificationsRecords.test.ts` | nối dây mặc định (review plan R2) > createApp không truyền notifier: phiếu mới vẫn ra log kênh mặc định | – |

## TC không phải test trong hai file trên

| TC | AC/Risk | Kiểm chứng | Evidence |
|---|---|---|---|
| TC19 | N1, risk lớn | Harness `server/test/perf/notifyLoad.ts`, `putCost.ts` | `evidence/12`, `13`, `14`, `15`, `16`, `31`, `32` |
| TC20 | Regression | 45 ca Playwright có sẵn trong `client/e2e/` | `evidence/26-e2e-regression.txt` |

## Test không có mã TC riêng ở báo cáo

Các test này có trong bộ 41 và vẫn gắn với AC, nhưng bảng 20 TC của báo cáo không nêu riêng.

| AC/Risk | File | Tên test | Mutation bắt được |
|---|---|---|---|
| AC1 | `notificationsRecords.test.ts` | AC1: đúng người, một lần > route gọi recordCreated đúng một lần, sau commit, với ctx từ token và sự kiện không có `data` | – |
| AC4, R5 | `notifications.test.ts` | hàng đợi có giới hạn (AC4, N3) > tràn hàng đợi: log một dòng khi bắt đầu tràn, hết tràn rồi tràn lại thì log thêm một dòng | M1 |
| N2 | `notifications.test.ts` | hàng đợi có giới hạn (AC4, N3) > không vượt `concurrency`; idle() chỉ resolve khi hàng đợi rỗng và không còn lần gửi nào | – |
| AC3 | `notifications.test.ts` | kênh lỗi (AC3) > ném đồng bộ, reject Error, reject giá trị lạ: không lọt ra ngoài, đếm failed, ghi log, lần sau vẫn gửi | – |
| AC5 | `notificationsRecords.test.ts` | AC5: cách ly dự án > người nhận chỉ lấy từ dự án trong đường dẫn, vai trò tính theo từng dự án | – |
