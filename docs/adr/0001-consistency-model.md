# ADR 0001: Mô hình nhất quán cho đồng bộ offline

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-10-07
- **Người phụ trách:** Thành viên 2 (Sync & Server)
- **Liên quan:** [design.md](../design.md) §5, [ADR 0002 – Nhiều tổ chức](0002-multi-tenancy.md), `shared/src/merge.ts`, `server/src/routes/records.ts`, `client/src/sync/engine.ts`

| Bản | Ngày | Thay đổi |
|---|---|---|
| Đề xuất | 2026-10-07 | Bản đầu |
| Đề xuất (sửa) | 2026-10-07 | Ràng buộc idempotency key, khoá sửa khi xung đột, 409 lặp lại, phiếu nháp, nhiều tab |
| Đã chấp nhận | 2026-10-07 | Chốt; mọi quy tắc áp dụng trong phạm vi một dự án (ADR 0002); cursor tách theo dự án |

## Bối cảnh

Điều tra viên nhập phiếu khảo sát ở nơi mất mạng hàng giờ, có khi hàng ngày. Cùng một phiếu có thể bị sửa ở hai nơi:
- giám sát viên chỉnh phiếu trên máy chủ trong khi điều tra viên vẫn đang offline (trường hợp chính);
- cùng một người sửa phiếu trên hai thiết bị.

(Hai điều tra viên khác nhau không sửa chung một phiếu vì mỗi người chỉ thấy phiếu mình tạo, xem design §5.5.)

Khi có mạng lại, hệ thống phải:

1. Không bao giờ âm thầm làm mất dữ liệu người dùng đã nhập.
2. Không tạo bản ghi trùng khi gửi lại (mạng chập chờn, timeout nhưng server đã ghi).
3. Khi có xung đột, **giải thích được** cho người dùng không chuyên: ai sửa, lúc nào, trường nào, giá trị cũ và mới.
4. Đủ đơn giản để nhóm 3 sinh viên làm xong và kiểm thử kỹ trong 8 tuần.

Ràng buộc kỹ thuật: client là PWA dùng IndexedDB, server REST (Express + SQLite), không có kết nối thời gian thực.

## Các phương án đã xem xét

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Last-write-wins (LWW)** theo thời gian | Rất đơn giản | Mất dữ liệu âm thầm; đồng hồ thiết bị sai lệch; vi phạm yêu cầu 1 và 3 |
| **B. Optimistic concurrency + three-way merge theo trường** (chọn) | Không mất dữ liệu; phần lớn trường hợp tự gộp; xung đột thật thì có đủ thông tin để giải thích | Người dùng phải chọn khi cùng một trường bị sửa ở hai nơi; server cần lưu lịch sử phiên bản |
| **C. CRDT** (Automerge, Yjs) | Tự hội tụ, không cần người chọn | Khó giải thích kết quả ("vì sao số thành viên là 7?"); thư viện lớn; dữ liệu khảo sát dạng trường rời rạc không hưởng lợi nhiều từ CRDT; vượt sức nhóm trong 8 tuần |
| **D. Khoá bản ghi (pessimistic lock)** | Không có xung đột | Không dùng được khi offline, đúng là trường hợp chính |

## Quyết định

Dùng **eventual consistency** với **optimistic concurrency control** theo phiên bản do server cấp, và **three-way merge theo từng trường** ở client. Mọi quy tắc dưới đây áp dụng cho bản ghi bên trong một dự án; một bản ghi thuộc đúng một dự án và không bao giờ chuyển dự án (ADR 0002).

### Quy tắc

1. **Server là nguồn sự thật về thứ tự.** Mỗi bản ghi có `version` nguyên, server tăng 1 sau mỗi lần ghi thành công. Mọi phiên bản được lưu trong `record_history` (ai sửa, lúc nào, dữ liệu đầy đủ).

2. **Ghi có điều kiện.** Client gửi `PUT /api/projects/:projectId/records/:id` kèm `baseVersion` là version mà bản sửa của nó dựa trên.
   - `baseVersion == version hiện tại` thì ghi, trả `200` (hoặc `201` nếu tạo mới với `baseVersion = 0`).
   - Khác thì **không ghi**, trả `409` kèm bản hiện tại và các phiên bản sau `baseVersion` trong lịch sử.

3. **Idempotency.** Mỗi thao tác trong outbox có `opId` (UUID) gửi qua header `Idempotency-Key`. Server lưu response thành công theo key trong cùng transaction với lần ghi; gửi lại cùng key thì trả lại đúng response cũ (header `Idempotent-Replayed: true`), không ghi thêm. Response `409` không được lưu, để client gửi lại sau khi merge.
   - **Key gắn với request:** server lưu kèm `record_id` và `request_hash` (SHA-256 của thân request đã chuẩn hoá). Gửi lại cùng key nhưng khác `recordId` hoặc khác nội dung thì trả `422 idempotency_key_reused`, không replay. Client tuân thủ quy tắc gộp op (design §5.2) thì không bao giờ gặp lỗi này; nếu gặp là lỗi lập trình.
   - **Thời hạn key:** key được dọn sau 30 ngày. Máy offline lâu hơn rồi gửi lại một op đã được ghi vẫn an toàn: server không còn key nên coi là request mới, thấy `baseVersion` lệch và trả `409`; client merge với base cũ, local và remote giống nhau nên không có xung đột, gửi lại bản gộp. Kết quả chỉ là thêm một version có dữ liệu giống hệt, không trùng bản ghi và không mất dữ liệu.

4. **Client giữ "base".** Mỗi bản ghi cục bộ lưu `baseData` và `baseVersion`: dữ liệu và version lần cuối client và server thống nhất. Đây là gốc cho three-way merge, nên client không cần hỏi server bản cũ.

5. **Three-way merge theo trường** khi nhận 409, với `base = baseData`, `local = dữ liệu mới nhất trên máy`, `remote = bản hiện tại trên server`:

   | local so với base | remote so với base | Kết quả |
   |---|---|---|
   | không đổi | đổi | lấy remote |
   | đổi | không đổi | lấy local |
   | đổi | đổi, **bằng** local | lấy giá trị chung |
   | đổi | đổi, **khác** local | **xung đột trường**, người dùng chọn |

   Mảng (multiselect, danh sách ảnh) so sánh như tập hợp, không quan tâm thứ tự.

6. **Xoá là một trường đặc biệt** (`deleted`). Một bên xoá trong khi bên kia sửa nội dung là **xung đột mức bản ghi**, luôn hỏi người dùng. Một bên xoá, bên kia không đổi gì thì xoá. Bản ghi bị xoá là tombstone, không xoá vật lý, để thiết bị offline lâu vẫn nhận được.

7. **Không có xung đột thì tự gộp** và gửi lại ngay với `baseVersion` mới. Có xung đột (trường hoặc mức bản ghi) thì bản ghi chuyển sang trạng thái `conflict`, mọi op của nó bị thay bằng kết quả người dùng chọn.
   - **Khoá sửa khi đang xung đột:** bản ghi `conflict` chỉ đọc cho tới khi người dùng giải quyết. Lý do: kết quả merge được tính từ dữ liệu tại thời điểm nhận 409; nếu cho sửa tiếp thì lúc áp dụng lựa chọn sẽ ghi đè phần vừa sửa (vi phạm yêu cầu 1), hoặc phải merge bốn bên rất khó giải thích. Phương án đã cân nhắc và bỏ: tính lại merge với dữ liệu mới nhất lúc áp dụng (đúng, nhưng màn hình xung đột có thể đổi ngay trước mắt người dùng).
   - **Không chọn hộ người dùng:** xung đột mức bản ghi (xoá vs sửa) luôn cần một câu trả lời tường minh; không có giá trị mặc định.
   - **409 lặp lại:** bản giải quyết được gửi với `baseVersion` = version server mà người dùng đã thấy. Nếu server đã đổi tiếp, áp dụng lại quy tắc 5 với base = bản server đã thấy, local = bản giải quyết. Khác trường thì tự gộp; cùng trường thì hiện xung đột mới, chỉ gồm các trường mới bị đụng.

8. **Pull không ghi đè thay đổi chưa gửi.** Bản ghi còn op trong outbox, đang `conflict`, hoặc là nháp (`draft`: có thay đổi cục bộ nhưng chưa tạo op) thì bỏ qua khi pull; lần push sau sẽ nhận 409 và đi qua quy tắc 5.

9. **Phiên bản form tách khỏi phiên bản bản ghi.** Bản ghi lưu `formVersion` lúc tạo và luôn hiển thị theo đúng phiên bản form đó. Đổi form không gây xung đột dữ liệu.

10. **Pull theo cursor, mỗi dự án một cursor.** Server có bộ đếm `seq` tăng mỗi lần ghi; pull trả bản ghi có `seq > cursor` trong phạm vi người dùng được thấy. Client lưu cursor riêng cho từng dự án, gắn với phạm vi lúc pull (`own` hoặc `all`). Phạm vi đổi (ví dụ được nâng lên giám sát viên) thì cursor của dự án đó về 0 (ADR 0002).

### Đảm bảo nhất quán đạt được

Trong phạm vi một dự án:

- **Hội tụ:** khi mọi thiết bị đã online và giải quyết xong xung đột, mọi thiết bị thấy được một bản ghi đều có cùng dữ liệu với server cho bản ghi đó.
- **Không mất cập nhật (no lost update):** server không bao giờ ghi đè một version mà client chưa thấy.
- **Exactly-once về mặt hiệu ứng** cho mỗi op nhờ idempotency key, dù gửi lại bao nhiêu lần.
- **Read-your-writes trên cùng thiết bị:** UI đọc từ IndexedDB nên luôn thấy ngay dữ liệu mình vừa nhập.
- **Không** đảm bảo: thứ tự toàn cục giữa các bản ghi khác nhau, hay thấy ngay thay đổi của người khác (chỉ thấy sau lần pull kế tiếp).

### Nhiều tab, một thiết bị

Các tab dùng chung IndexedDB nên chung outbox. Chỉ một tab được chạy vòng đồng bộ tại một thời điểm (Web Locks, design §5.3). Kể cả khi khoá không có tác dụng (trình duyệt cũ), các đảm bảo trên vẫn giữ nhờ idempotency key: hai tab gửi cùng op thì server chỉ ghi một lần, tab thứ hai nhận replay.

### Giới hạn của cursor

Pull theo `seq` đúng chỉ khi `seq` được cấp theo thứ tự commit. SQLite đảm bảo điều này vì ghi tuần tự (`BEGIN IMMEDIATE`). Đổi CSDL thì phải giữ tính chất này (design §6.1).

## Hệ quả

**Tích cực**
- Phần lớn trường hợp thực tế (hai người sửa hai trường khác nhau) được gộp tự động, không làm phiền người dùng.
- Màn hình xung đột có đủ dữ liệu để giải thích: giá trị gốc, của bạn, trên máy chủ, người sửa và thời điểm (lấy từ `history`).
- Logic merge là một hàm thuần trong `shared/`, kiểm thử đơn vị dễ, dùng chung client và server.

**Tiêu cực, chấp nhận được**
- Cùng một trường bị sửa ở hai nơi thì cần người dùng chọn.
- Phiếu đang xung đột không sửa được cho tới khi giải quyết.
- Server lưu toàn bộ lịch sử phiên bản: dung lượng tăng theo số lần sửa. Với quy mô đồ án (vài nghìn phiếu mỗi dự án) không đáng kể; có thể dọn lịch sử cũ hơn N ngày sau này.
- Trường văn bản dài bị coi là một giá trị nguyên khối, không merge từng dòng.
- Bảng `idempotency` cần dọn định kỳ (key cũ hơn 30 ngày).

**Việc phát sinh trong code** (khung hiện tại chưa theo)
- `records.ts`: lưu `record_id`, `request_hash`; trả `422`; đường dẫn theo dự án.
- `outbox.ts`, `FillPage.tsx`: không tạo op khi phiếu `conflict`, mở phiếu ở chế độ chỉ đọc; bỏ trạng thái op `blocked`.
- `ConflictPage.tsx`: khoá nút Áp dụng khi `recordLevel !== 'none'` chưa được trả lời.
- `engine.ts`: Web Locks; pull bỏ qua `draft`; cursor theo dự án.

## Kiểm chứng

Quyết định này được coi là đúng khi các test sau chạy qua (mã ca theo design §10.1):

| Mức | Ca | Trạng thái |
|---|---|---|
| Unit (`shared/src/merge.test.ts`) | Khác trường, cùng trường khác giá trị, cùng trường cùng giá trị, mảng khác thứ tự, trường mới, xoá vs sửa | Có |
| Integration (`server/test/records.test.ts`) | 201/200/409, replay idempotency, pull theo cursor | Có |
| Integration | R6: cùng key khác nội dung thì `422` | TODO |
| E2E | O1: offline rồi online | Có |
| E2E | R1: server lỗi 500 rồi retry, không trùng bản ghi | Có |
| E2E | C2: cùng trường sửa ở hai nơi, người dùng chọn, server có bản gộp đúng | Có |
| E2E | C1, C6: khác trường tự gộp; sửa ba lần khi offline thành một op | TODO |
| E2E | R3: server đã ghi nhưng mất response, gửi lại cùng key | TODO |
| E2E | C4, C5: xoá vs sửa, không có lựa chọn mặc định | TODO |
| E2E | C7: phiếu đang xung đột thì không sửa được | TODO |
| E2E | C8: 409 lặp lại khi gửi bản giải quyết | TODO |
| E2E | O5: phiếu nháp không bị pull ghi đè | TODO |
| E2E | O6: hai tab không gửi trùng | TODO |

## Khi nào xem lại

- Cần cộng tác thời gian thực trên cùng một phiếu, hoặc trường văn bản dài cần merge từng đoạn: cân nhắc CRDT cho riêng trường đó.
- Thêm nhóm lặp (danh sách các dòng trong một phiếu): so sánh mảng như tập hợp không còn đúng, cần ADR mới về merge theo từng dòng.
- Cho phép nhiều điều tra viên cùng sửa một phiếu (giao việc theo khu vực): xung đột giữa điều tra viên sẽ thường xuyên hơn, cần đánh giá lại trải nghiệm màn hình xung đột.
- Số lần sửa mỗi phiếu lớn tới mức lịch sử tốn dung lượng: chuyển sang lưu diff hoặc cắt lịch sử.
