# PROJECT — APP-01 Offline-first Field Survey

| Thuộc tính | Giá trị |
|---|---|
| Mã đề tài | APP-01 (STT 23) |
| Lĩnh vực | Web / PWA |
| Độ khó | Khá |
| Team | 3 sinh viên (A, B, C — xem [TEAM.md](TEAM.md)) |
| Thời lượng | 8 tuần (xem [PLAN.md](PLAN.md)) |
| Trạng thái tài liệu | v0.1 — chờ team xác nhận ([PLAN §6](PLAN.md#6-quyết-định-cần-team-xác-nhận)) |

## 1. Bài toán

Điều tra viên thực địa thường làm việc ở nơi mạng yếu hoặc không có mạng. Công cụ khảo sát online-only làm mất dữ liệu hoặc buộc ghi giấy rồi nhập lại. Khi cùng một phiếu bị sửa ở hai nơi (hai thiết bị, hoặc điều tra viên và admin), các giải pháp "ghi đè cái mới nhất" làm **mất dữ liệu âm thầm** và không ai biết chuyện gì đã xảy ra.

**Mục tiêu:** một PWA cho phép thu thập khảo sát hoàn toàn offline, tự đồng bộ khi có mạng, không mất và không trùng dữ liệu, và khi có conflict thì **giải thích được cho người dùng** ai đã đổi gì, lúc nào, và để người dùng quyết định.

## 2. Người dùng và vai trò

| Vai trò | Mô tả | Chế độ |
|---|---|---|
| `surveyor` (điều tra viên) | Điền phiếu tại hiện trường, chụp ảnh, sửa/xoá phiếu của mình, giải quyết conflict | **Offline-first** (điện thoại) |
| `admin` (quản trị/giám sát) | Tạo & publish form, xem/sửa/xoá mọi phiếu, export dữ liệu, xem lịch sử conflict | **Online-only** (laptop) |

Tài khoản được seed sẵn, không có đăng ký.

## 3. Mục tiêu đo được

1. Điều tra viên điền và lưu phiếu (kèm ảnh) khi không có mạng; dữ liệu còn nguyên sau reload/đóng trình duyệt.
2. Khi có mạng, mọi phiếu tự đồng bộ; **0 phiếu mất, 0 phiếu trùng** dưới lỗi mạng/lỗi server/mất response.
3. Sửa đồng thời khác field → tự gộp; cùng field → người dùng chọn với lời giải thích rõ ràng; mọi quyết định có log.
4. Admin export được dữ liệu (CSV/JSON) mở được bằng Excel (tiếng Việt không lỗi font).
5. Có evidence tự động trên GitHub: Offline E2E, conflict cases, sync retry tests, ADR consistency model.

## 4. Phạm vi MVP (in-scope)

| # | Tính năng | Tóm tắt | Chi tiết |
|---|---|---|---|
| 1 | Form builder | Admin tạo form với 7 loại field, sắp xếp ↑/↓, preview, publish thành version bất biến | [SPEC §2.2](SPEC.md#22-form-builder) |
| 2 | Offline storage | App shell qua service worker; forms/responses/attachments trong IndexedDB | [SPEC §2.4](SPEC.md#24-offline-storage) |
| 3 | Sync queue | Outbox bền vững, retry có backoff, idempotent, màn hình hàng đợi | [SYNC.md](SYNC.md) |
| 4 | Attachments | Chụp/chọn ảnh & PDF, nén ảnh, lưu offline, upload trước response | [SPEC §2.6](SPEC.md#26-attachments) |
| 5 | Conflict UI | Auto-merge khác field; so sánh từng field có giải thích; xoá-vs-sửa; lịch sử | [SPEC §2.7](SPEC.md#27-conflict) |
| 6 | Export | CSV (UTF-8 BOM) và JSON theo form version | [SPEC §2.8](SPEC.md#28-export) |
| — | Hỗ trợ | Đăng nhập 2 vai trò; admin xem/sửa response online (là "người ghi thứ hai" tạo conflict thực tế) | [SPEC §2.1, §2.9](SPEC.md#21-xác-thực) |

## 5. Ngoài phạm vi (out-of-scope)

Không làm trong MVP; mọi đề xuất mới đưa vào backlog "sau MVP", không vào sprint.

- **Form:** conditional/skip logic, section lồng nhau, drag-and-drop, field GPS/chữ ký/video/barcode, archive/xoá form, template.
- **Sync:** CRDT, cộng tác real-time, WebSocket, push notification, **phụ thuộc Background Sync API**, sync chạy khi app đóng.
- **Admin:** dùng offline, dashboard/biểu đồ, bản đồ, phân công khảo sát.
- **Tài khoản:** đăng ký, quên mật khẩu, refresh token, multi-tenant/tổ chức, phân quyền chi tiết, nhiều user trên một thiết bị.
- **Export:** ZIP kèm file, Excel native (.xlsx), lịch hẹn export.
- **Khác:** đa ngôn ngữ (UI chỉ tiếng Việt), mã hoá dữ liệu cục bộ, native app, dọn attachment mồ côi.

## 6. Giả định và ràng buộc

- Mỗi thiết bị chỉ dùng bởi **một** user; logout bị chặn khi còn thay đổi chưa sync.
- Lần đầu dùng phải **online** để đăng nhập và tải form (không thể offline từ con số 0).
- Trình duyệt mục tiêu: Chrome/Edge Android & desktop (2 bản mới nhất); Safari iOS ≥ 16.4 (hỗ trợ hạn chế, xem [RISKS R-03](RISKS.md#1-risk-register)). Firefox: best-effort.
- Quy mô demo: ≤ 20 form, ≤ 5 000 response, ≤ 10 user đồng thời.
- Triển khai trên 1 VM có HTTPS (bắt buộc cho service worker).

## 7. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Form / Form version | Form là "tên" khảo sát; form version là bản schema cụ thể. Version đã publish **bất biến**. |
| Response | Một phiếu trả lời, gắn với đúng 1 form version. |
| `version` (của response) | Số nguyên do server tăng mỗi lần ghi thành công; dùng để phát hiện conflict. |
| `baseVersion` | Version server mà thay đổi local được dựa trên. |
| Outbox / sync queue | Bảng IndexedDB chứa các thao tác chờ gửi lên server. |
| Op / `opId` | Một thao tác trong outbox; `opId` là idempotency key. |
| Tombstone | Response đã xoá mềm (`deleted_at` ≠ null) nhưng vẫn có version. |
| Auto-merge | Gộp tự động khi hai bên sửa **khác field**. |
| Conflict thật | Hai bên sửa **cùng field** thành giá trị khác nhau → cần người quyết định. |
| Pull cursor | `server_seq` lớn nhất client đã nhận. |
