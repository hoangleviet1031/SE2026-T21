# Đồng bộ bên trong

Tài liệu này mô tả luồng hiện được triển khai trong client và server. Đặc tả hành vi vẫn nằm ở [design.md §5](design.md#5-đồng-bộ) và [ADR 0001](adr/0001-consistency-model.md); đây là bản đồ để lần theo mã khi sửa sync.

## Một phiếu từ lúc lưu tới server

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant UI as Màn hình
    participant DB as IndexedDB (Dexie)
    participant E as Sync engine
    participant API as API client
    participant MW as Auth + membership middleware
    participant R as records route/repository
    participant SQL as SQLite

    U->>UI: Lưu phiếu
    UI->>DB: saveRecordLocally
    Note over DB: Một transaction: ghi record + cập nhật/tạo outbox op
    DB-->>UI: Đã lưu cục bộ
    E->>E: syncNow, lấy Web Lock dùng chung các tab
    E->>API: GET /api/me, cập nhật danh sách dự án
    E->>DB: Đọc outbox theo seq, FIFO từng phiếu
    API->>MW: PUT /api/projects/{projectId}/records/{id}
    Note over API,MW: Authorization: Bearer; Idempotency-Key: opId
    MW->>MW: Xác thực phiên, kiểm tra membership/role
    MW->>R: Gắn ctx từ projectId trên URL và user đã xác thực
    R->>SQL: BEGIN; kiểm idempotency key
    alt Key đã dùng với cùng request
        SQL-->>R: Response đã lưu
    else Key chưa dùng
        R->>SQL: So baseVersion; ghi record + history + seq
        R->>SQL: Lưu response thành công với idempotency key
    end
    SQL-->>API: 200/201 hoặc 409
    API-->>E: Kết quả
    alt 200/201
        E->>DB: Xoá op; cập nhật baseData/baseVersion
    else 409
        E->>DB: Three-way merge hoặc ghi conflict chờ người dùng
    else Lỗi mạng / lỗi tạm thời
        E->>DB: Giữ op, tăng attempts và đặt backoff
    end
    E->>API: Sau push: upload ảnh, pull records, đồng bộ forms
```

### Lưu cục bộ và hình thành op

`saveRecordLocally()` trong `client/src/sync/outbox.ts` mở một Dexie transaction gồm `records`, `outbox` và `forms`. Phiếu được kiểm tra với đúng phiên bản form. Nếu chưa hợp lệ, record lưu ở trạng thái `draft` và không tạo op mới; op hợp lệ cũ (nếu có) vẫn được giữ để server nhận được bản hợp lệ cuối.

Với phiếu hợp lệ, client gộp dữ liệu vào op cuối nếu op đó còn `queued` và `attempts === 0`. Nếu op đã từng được gửi, client giữ nguyên nội dung và `opId`, rồi tạo op mới phía sau. `opId` được tạo bằng UUID và dùng làm header `Idempotency-Key`. Quy tắc này bảo đảm một key không bao giờ đại diện cho hai request khác nhau.

### Vòng đồng bộ và kết quả push

`syncNow()` trong `client/src/sync/engine.ts` gộp các yêu cầu gọi đồng thời. Engine lấy Web Lock `field-survey-sync` để các tab không cùng xử lý chung outbox; nếu trình duyệt không hỗ trợ Web Locks, idempotency vẫn làm cho gửi lặp an toàn. Mỗi lượt làm mới danh sách dự án qua `/api/me`, xử lý thay đổi membership, rồi với từng dự án chạy theo thứ tự: push outbox, upload ảnh, pull phiếu, đồng bộ forms và cập nhật số đếm.

Outbox được đọc theo `seq`, xử lý FIFO trong từng phiếu. Một op đang backoff, bị lỗi hoặc gặp conflict sẽ chặn các op sau của cùng phiếu; các phiếu khác vẫn tiếp tục. Khi mạng lỗi, 408, 429 hoặc 5xx, op được giữ và lên lịch retry với backoff. Lỗi 4xx khác được đánh dấu `failed`; người dùng có thể sửa dữ liệu để tạo op mới hoặc chủ động thử lại op cũ. Mỗi lần thử lại op cũ vẫn dùng cùng key và cùng payload.

Với 200/201, engine xoá op đã xác nhận và cập nhật `baseData` cùng `baseVersion` từ response server. Nếu op xoá được xác nhận và không còn op sau, phiếu cùng ảnh cục bộ được xoá. Sau push, engine upload ảnh đang chờ rồi pull các thay đổi theo cursor `seq`. Pull không ghi đè phiếu còn op, đang conflict hoặc là draft; thay đổi đồng thời sẽ được xử lý khi push qua kiểm tra version.

### Xung đột phiên bản

Server so `baseVersion` client gửi với version hiện tại. Nếu lệch, server trả 409 kèm bản hiện tại và lịch sử từ version gốc. Client gộp ba phía: `baseData` (base), dữ liệu cục bộ mới nhất (local), và `current.data` (remote). Nếu không có trường xung đột và không có xung đột xoá/sửa, client cập nhật base sang bản server, tạo op với `opId` mới và gửi lại ngay. Mỗi vòng giới hạn tối đa ba lần tự gộp để tránh lặp vô hạn khi server tiếp tục đổi.

Nếu có xung đột, các op của phiếu được gom lại, thông tin server/history/merge lưu trong bảng `conflicts`, và record chuyển sang `conflict`. Phiếu bị khoá sửa cho tới khi người dùng chọn giá trị. `resolveConflict()` tạo op mới dựa trên đúng bản server người dùng vừa xem; nếu server đổi thêm, vòng 409 tiếp theo lại kiểm tra từ base đó.

## Thêm route an toàn theo dự án

Route theo dự án phải giữ cùng một nguồn xác thực xuyên suốt: project id từ URL đã được middleware kiểm tra membership; handler lấy `Ctx` bằng `getCtx(req)`; repository nhận `Ctx` và mọi truy vấn dữ liệu dự án giới hạn theo `ctx.projectId`.

1. **Xác định quyền tối thiểu.** Chọn role cần thiết (`surveyor`, `supervisor` hoặc `owner`) theo design/ADR. Owner có quyền của supervisor. Nếu route dùng cho directory, yêu cầu mở dự án hoặc admin, đó là API không thuộc phạm vi một dự án; theo đúng middleware riêng và không gắn nhầm `requireMember`.
2. **Gắn middleware ở `server/src/app.ts`.** Mount tại `/api/projects/:projectId/<resource>` với `requireAuth` trước `requireMember('<role>')`, rồi mới tới router. Middleware ngoài router con vì Express router con không thấy tham số `:projectId` để kiểm membership. Trường hợp chỉ một phương thức cần quyền cao hơn (như POST forms), chặn phương thức đó riêng trước khi mount router.
3. **Handler chỉ tin `ctx`.** Gọi `getCtx(req)` sau middleware. Không lấy `projectId`/`userId` từ body hoặc query để phân quyền. Dữ liệu chủ thể lấy từ context đã xác thực; không tin `created_by` hay `updated_by` do client gửi.
4. **Giữ project scope trong repository.** Mọi SELECT/INSERT/UPDATE/DELETE trên dữ liệu dự án phải nhận `ctx` và dùng `ctx.projectId` trong điều kiện hoặc dữ liệu ghi. Dùng chung quy tắc che giấu: id ở dự án khác hay ngoài phạm vi không được làm lộ sự tồn tại; trả `404` như tài nguyên không có.
5. **Kiểm tra input, giao dịch và retry.** Parse/validate input ở ranh giới route và dùng mã lỗi trong `docs/design.md §7.1`. Với thay đổi cần nguyên tử, dùng `tx(db, ...)`. Nếu client có thể gửi lại một thao tác ghi sau timeout/mất response, thiết kế idempotency key và lưu kết quả trong cùng transaction với ghi dữ liệu. Nếu thay đổi phiếu, tuân theo luồng version, history và `seq` của `records` thay vì tự ghi bảng.
6. **Viết test cách ly.** Integration test server mở DB bằng `openDb(':memory:')`, chạy HTTP trên cổng ngẫu nhiên. Bao gồm quyền hợp lệ; chưa đăng nhập; không là thành viên hoặc role thấp; tài nguyên thuộc dự án khác trả `404`; và dữ liệu trả về/ghi xuống chỉ thuộc project trong URL. Test ghi có retry thêm trường hợp gửi lại cùng idempotency key và cùng payload.

Trước khi thêm API mới, cập nhật design/requirements nếu thay đổi hợp đồng hoặc quyền. Tham khảo `server/src/app.ts`, `server/src/auth.ts`, `server/src/routes/records.ts`, `server/src/repo/records.ts` và các integration test cùng route.

## Đối chiếu ADR với code

- **ADR 0001 – nhất quán:** `outbox.ts` lưu record/op nguyên tử; `engine.ts` giữ op đã gửi bất biến, dùng base version, FIFO theo phiếu, ba phía khi 409 và khoá conflict chờ người dùng. `records.ts` kiểm tra idempotency trước khi áp dụng ghi và lưu response thành công cùng transaction. Khớp với quy tắc đã chấp nhận.
- **ADR 0002 – cách ly dự án:** `app.ts` gắn `requireAuth` rồi `requireMember` cho route dự án; `getCtx()` lấy project từ middleware; repository records truy vấn theo context và che id ngoài phạm vi bằng 404. Phần vai trò/tài khoản cũ đã được thay thế đúng phạm vi bởi ADR 0003.
- **ADR 0003 – tài khoản và Owner:** code dùng phiên đăng nhập, role `owner`, route settings yêu cầu Owner, route quản trị/danh bạ/yêu cầu dự án tách khỏi route dữ liệu thành viên. ADR vẫn là quyết định nền, không cần sửa trong ticket này.

Không phát hiện quyết định kiến trúc mới hoặc sai lệch cần đổi ADR khi rà các luồng trên. Theo `CLAUDE.md`, ADR không được chỉnh nếu chưa có đồng ý rõ của người dùng; ticket này không phát sinh đề xuất thay đổi ADR.
