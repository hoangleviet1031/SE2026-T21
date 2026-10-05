# ADR-001: Consistency model và chiến lược conflict

- Trạng thái: **Proposed** — chuyển **Accepted** khi C1–C9 và R1–R8 xanh trong CI (mục tiêu cuối Tuần 7)
- Ngày: 2026-09-30
- Người quyết định: A, B, C (owner: B)
- Liên quan: [SYNC.md](../SYNC.md) (hiện thực chi tiết) · [DATA_MODEL.md](../DATA_MODEL.md) · [TESTING.md](../TESTING.md)

## Bối cảnh

- Điều tra viên ghi dữ liệu trong khi **offline** có thể nhiều giờ; nhiều thiết bị và admin (online) có thể sửa **cùng một phiếu**.
- Đề tài yêu cầu xử lý conflict **theo cách giải thích được cho người dùng**.
- Mạng thực địa chập chờn: request có thể thất bại, timeout, hoặc **server đã ghi nhưng client không nhận được response**.
- Đồng hồ thiết bị không đáng tin.
- Ràng buộc: 3 sinh viên, 8 tuần → mô hình phải đơn giản đủ để hiện thực và **kiểm chứng tự động**.
- Đặc điểm dữ liệu: phiếu khảo sát là tập field độc lập, giá trị ngắn; conflict thật (cùng field) hiếm nhưng khi xảy ra thì cần con người quyết định (ai đo đúng số nhân khẩu?).

## Quyết định

1. **Server là nguồn sự thật.** Mỗi thiết bị là bản sao cho phép ghi cục bộ (optimistic, local-first UI). Admin ghi trực tiếp lên server.
2. **Eventual consistency theo từng phiếu.** Không có giao dịch nhiều phiếu; mỗi phiếu hội tụ độc lập.
3. **Optimistic concurrency theo version.** Mỗi phiếu có `version` nguyên, server tăng 1 mỗi lần ghi. Mỗi lần ghi gửi kèm `baseVersion`; lệch → `409 VERSION_CONFLICT` kèm bản hiện tại và các revision kể từ `baseVersion`.
4. **Field-level three-way merge ở client.** Base = dữ liệu tại `baseVersion` (client giữ `baseData`). Hai bên đổi khác field → tự gộp. Cùng field khác giá trị → **người dùng quyết định** trên Conflict UI, có lời giải thích ai/khi nào/từ → thành.
5. **Mọi quyết định đều được ghi** vào `conflict_log` (kể cả tự gộp); mọi lần ghi có `response_revisions` → không có giá trị nào bị ghi đè mà không truy được.
6. **At-least-once + idempotency.** Mỗi op có `opId` (UUID) gửi qua `Idempotency-Key`; server ghi `processed_ops` **trong cùng transaction** với dữ liệu và trả nguyên kết quả cũ khi gặp lại → hiệu ứng **exactly-once**. Op đã gửi không bao giờ bị sửa payload; payload đổi → `opId` mới.
7. **Thứ tự:** FIFO theo từng phiếu; file đính kèm upload trước phiếu tham chiếu nó; các phiếu khác nhau không chặn nhau.
8. **Form version đã publish là bất biến** → không bao giờ có conflict về schema; phiếu theo version cũ luôn hợp lệ.
9. **Xoá mềm (tombstone có version)** → xoá tham gia kiểm tra version như sửa; hỗ trợ khôi phục.
10. **Không dùng đồng hồ client để phân xử.** Timestamp chỉ để hiển thị.
11. **Pull theo cursor `server_seq`** từ một sequence chung, gán bên trong advisory lock toàn cục → thứ tự seq = thứ tự commit → client không bỏ sót thay đổi.

## Đảm bảo (guarantees)

| Đảm bảo | Cơ chế | Test |
|---|---|---|
| Read-your-writes trên thiết bị | UI đọc IndexedDB; ghi local trong transaction | E2, E4 |
| Không mất dữ liệu âm thầm | Version check + merge + conflict UI + revisions + conflict_log | C1–C9 |
| Không trùng / không áp dụng hai lần | `opId` + `processed_ops` cùng transaction | R2, R3, R7, R8 |
| Không mất op khi crash | Outbox bền; `in_flight` → `pending` khi khởi động | R7 |
| Hội tụ | Khi mọi thiết bị đã push, pull hết và mọi conflict đã giải quyết, mọi bản sao bằng bản server | E3, C3 |
| Pull không bỏ sót | Advisory lock + sequence | integration pull |

**Không đảm bảo:** tính nhất quán giữa nhiều phiếu; thấy thay đổi của người khác ngay lập tức (chỉ sau lần pull kế tiếp); đồng bộ khi app đóng.

## Các phương án đã cân nhắc

| Phương án | Ưu | Nhược | Lý do loại |
|---|---|---|---|
| **Last-Write-Wins** (theo timestamp) | Đơn giản nhất | Mất dữ liệu âm thầm; phụ thuộc đồng hồ client; không giải thích được | Vi phạm yêu cầu "giải thích được" |
| **Server-wins, từ chối ghi lệch** | Đơn giản | Người dùng phải nhập lại thủ công; mất công sức thực địa | UX kém, dữ liệu dễ mất |
| **CRDT** (Yjs, Automerge) | Tự hội tụ, không cần server phân xử | Phức tạp, thư viện lớn; tự gộp cả khi cần con người quyết định (hai số nhân khẩu khác nhau không có "gộp" đúng); khó giải thích | Quá sức 8 tuần, sai ngữ nghĩa |
| **Khoá bi quan** (check-out phiếu) | Không có conflict | Không khả thi khi offline | Mâu thuẫn bài toán |
| **PouchDB/CouchDB replication** | Có sẵn sync + revision tree | Conflict chọn winner tuỳ ý rồi để app tự xử lý; hàng đợi bị ẩn → khó chứng minh retry; team không quen CouchDB | Không cho evidence rõ ràng |
| **Merge cấp bản ghi (không theo field)** | Đơn giản hơn | Mọi sửa đồng thời đều thành conflict, kể cả khác field | Quá nhiều conflict giả |

## Hệ quả

**Tích cực:** mô hình dễ giải thích cho người dùng và giảng viên; logic merge là hàm thuần test được; idempotency làm retry an toàn tuyệt đối; tombstone + revisions cho lịch sử đầy đủ.

**Tiêu cực / chấp nhận:**
- Người dùng đôi khi phải tự giải quyết conflict.
- Admin sửa phiếu có thể tạo conflict cho điều tra viên (chủ ý: đây cũng là kịch bản demo).
- Ghi vào `responses` bị tuần tự hoá toàn cục — đủ cho ≤ 10 user đồng thời; nếu mở rộng cần thay bằng cơ chế cursor khác (ngoài phạm vi).
- Client phải giữ `baseData` → tăng gấp đôi dung lượng dữ liệu text (không đáng kể so với ảnh).
- `processed_ops` tăng dần, không dọn trong MVP.

## Kiểm chứng

| Quyết định | Test |
|---|---|
| 3, 4 | C1, C2, C3, C6, C7 (unit `packages/shared/test/merge.test.ts`); C3 integration + E2E |
| 4, 9 | C4, C5 (unit + E2E) |
| 5 | C3 integration kiểm tra `conflict_log`; C9 |
| 6 | R2, R3, R7, R8; integration replay `processed_ops` |
| 7 | R6 |
| 8 | C8 |
| 11 | integration pull: ghi đồng thời không làm cursor bỏ sót |

Chi tiết từng ca: [TESTING.md](../TESTING.md).
