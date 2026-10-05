# ADR-003: Sync chạy trong app, không dựa vào Background Sync API

- Trạng thái: **Proposed**
- Ngày: 2026-09-30
- Người quyết định: A, B, C (owner: B)

## Bối cảnh
Background Sync API cho phép SW sync khi có mạng kể cả lúc tab đã đóng, nhưng **chỉ Chromium hỗ trợ**; Safari (iOS) và Firefox không có. Logic sync chạy trong SW cũng khó debug và khó test hơn trong Playwright.

## Quyết định
1. Sync engine chạy ở **main thread** của trang, trong `apps/web/src/offline/sync`.
2. Trigger: sự kiện `online`, tab visible, khởi động app, timer 30 s khi online, sau khi lưu local, nút "Đồng bộ ngay".
3. Dùng **Web Locks API** (`navigator.locks`, lock `'sync'`) để chỉ một tab sync tại một thời điểm.
4. Không đăng ký Background Sync / Periodic Background Sync trong MVP.

## Các phương án đã cân nhắc
| Phương án | Lý do loại |
|---|---|
| Background Sync API | Không có trên iOS/Firefox → vẫn phải có đường sync trong app; hai đường = gấp đôi bug |
| Sync trong SW (message từ trang) | Khó debug, vòng đời SW không ổn định, `page.route` của Playwright khó can thiệp |
| Web Worker riêng | Không cần thiết: khối lượng sync nhỏ, không chặn UI đáng kể |

## Hệ quả
- Dữ liệu chỉ đồng bộ khi app đang mở → UI nhắc "Mở app khi có mạng để đồng bộ" nếu còn thay đổi chờ.
- Hành vi giống nhau trên mọi trình duyệt → test một lần.
- Web Locks có trên Chrome, Edge, Firefox, Safari ≥ 15.4 → đủ cho baseline iOS 16.4.

## Kiểm chứng
E3 (sync khi có mạng), R1 (offline không gửi), R8 (hai tab chỉ một tab sync).
