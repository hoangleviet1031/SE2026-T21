# ADR-004: Attachments — upload trước, content hash, giới hạn dung lượng

- Trạng thái: **Proposed**
- Ngày: 2026-09-30
- Người quyết định: A, B, C (owner: C)

## Bối cảnh
Ảnh chụp tại hiện trường là phần nặng nhất của dữ liệu: dễ làm đầy quota IndexedDB, upload lâu và dễ đứt giữa chừng trên mạng yếu. Phiếu tham chiếu file, nên server cần biết file đã tồn tại khi nhận phiếu.

## Quyết định
1. File có **id do client sinh** (UUIDv7) và **SHA-256** tính ở client.
2. Mỗi file là một op `upload` riêng (`PUT /api/attachments/:id`), **idempotent theo `id + sha256`**; op phiếu `dependsOn` các op upload → server luôn nhận file **trước** phiếu và kiểm tra tham chiếu (`ATTACHMENT_MISSING` nếu thiếu).
3. `attachments.response_id` không có FK (file tồn tại trước phiếu).
4. Nén ảnh ở client: cạnh dài ≤ 1600 px, ≤ 1.5 MB; PDF ≤ 5 MB; ≤ 5 file/field; MIME: jpeg/png/webp/pdf. Server kiểm tra lại size + magic bytes.
5. Sau khi upload xác nhận: bỏ Blob gốc ở client, giữ thumbnail 256 px cho ảnh.
6. Lưu file trên disk (Docker volume) qua interface `StorageAdapter`, tên file = id.
7. Truy cập file bằng Bearer token hoặc URL ký HMAC có hạn (24 giờ trong app, 7 ngày trong export).
8. Field attachment merge như **một giá trị** (tập id) — không gộp từng file.

## Các phương án đã cân nhắc
| Phương án | Lý do loại |
|---|---|
| Nhúng base64 trong JSON phiếu | Payload lớn, retry cả phiếu khi đứt; tốn thêm ~33% dung lượng |
| Upload sau phiếu, phiếu tham chiếu "pending" | Server phải chấp nhận tham chiếu treo; khó kiểm tra toàn vẹn |
| Upload resumable/chunked (tus) | Quá sức 8 tuần; ảnh ≤ 1.5 MB không cần |
| S3/MinIO | Thêm hạ tầng; `StorageAdapter` để ngỏ khả năng đổi sau |
| Lưu file trong PostgreSQL (bytea) | Phình DB, backup nặng |

## Hệ quả
- File mồ côi (upload xong nhưng phiếu bị huỷ) không được dọn trong MVP.
- Mở ảnh đầy đủ của phiếu nhận qua pull cần mạng.
- Hai bên cùng đổi file của một field → conflict cả field (C7), người dùng chọn một bên.

## Kiểm chứng
E2, E3 (ảnh offline → server), R6 (upload lỗi chặn phiếu phụ thuộc), C7, integration: hash sai → 422, upload lặp → 200 không ghi lại.
