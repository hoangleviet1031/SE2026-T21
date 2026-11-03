# VT-082: thông báo phiếu mới (spec)

Baseline: `ef92b35` (main, 2026-11-03). Bài cá nhân 3, Đỗ Tùng Dương, 23001858.

## Problem statement

Giám sát viên và Owner chỉ biết có phiếu mới khi tự mở app và pull, nên phiếu sai hoặc thiếu được phát hiện muộn, lúc điều tra viên có thể đã rời địa bàn. Khi một phiếu mới tới server, hệ thống cần báo cho họ. Lần gửi phiếu là thứ không được mất (offline-first, QS1 trong design §11.4), nên lỗi hoặc chậm ở kênh thông báo không được làm hỏng hay làm chậm giao dịch ghi phiếu.

## Acceptance criteria

- **AC1. Đúng người, một lần.** `PUT /api/projects/:p/records/:id` tạo phiếu lần đầu (`201`, `version = 1`, `deleted = false`) sinh đúng một thông báo `record.created`, gửi tới supervisor và Owner còn hoạt động của dự án đó, trừ chính người tạo. Không có người nhận thì không gọi kênh.
- **AC2. Không báo sai sự kiện.** Không có thông báo với: sửa phiếu (`200`), replay cùng `Idempotency-Key` (client offline gửi lại), phiếu tạo ra đã ở trạng thái xoá (design §5.7), `400`, `404`, `409`, `422`, `413`.
- **AC3. Lỗi kênh không ảnh hưởng giao dịch.** Kênh ném lỗi, reject hoặc treo: client vẫn nhận đúng status và body như khi kênh chạy tốt; `records`, `record_history`, `idempotency` đã commit; lỗi được ghi log, không kèm dữ liệu phiếu.
- **AC4. Đầu vào lớn không kéo theo công việc lớn.** Phiếu lớn tới giới hạn `2mb` vẫn ghi thành công và thông báo chỉ chứa metadata, không chứa `data`. Hàng đợi có giới hạn: quá sức chứa thì bỏ thông báo và đếm lại, không chặn request.
- **AC5. Cách ly dự án.** Người nhận chỉ lấy từ dự án của `ctx` (ADR 0002): thành viên dự án khác không bao giờ nhận.

## Non-functional constraints

- **N1. Tải.** 120 `PUT` tạo phiếu đồng thời: p95 ≤ 3,5 s, ở cả kênh tốt, lỗi và treo.
- **N2. Không chờ kênh.** Đường request không `await` kênh. Mỗi lần gửi có timeout.
- **N3. Bộ nhớ có chặn trên.** Hàng đợi có sức chứa cố định và không giữ `data` của phiếu.
- **N4. Phụ thuộc.** Không thêm package runtime, không đổi schema CSDL trong slice này.

## Invariant quan trọng nhất

> Với mọi trạng thái của kênh thông báo, kết quả `PUT` (status, body, dữ liệu đã commit) giống hệt như khi không có thông báo. Thông báo chỉ phát sinh **sau khi commit**, tối đa một lần cho mỗi phiếu được tạo trong một tiến trình server.

Hợp đồng: `Notifier.recordCreated()` không bao giờ ném lỗi và không bao giờ chờ I/O.
