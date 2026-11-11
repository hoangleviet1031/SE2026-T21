# AI log 02: sinh test cases

Công cụ: Claude Code, subagent `general-purpose` (Claude Opus 5.5). Commit lúc chạy: `296edc3`. Output là hai file test, giữ nguyên trạng ở commit "bản nháp test do AI sinh"; xem `git show <commit>`.

## Prompt

```text
Repo ở D:\School\BT3_VT-082\repo, nhánh bt3/vt082-notify-new-record. Không đọc CLAUDE.md / CLAUDE.local.md. Đọc docs/bt3-vt082/SPEC.md, server/src/notifications.ts (khung interface, chưa có hành vi), server/src/routes/records.ts, server/test/fixtures.ts, server/test/records.test.ts.

Sinh test vitest cho change request "thông báo phiếu mới":
- server/test/notifications.test.ts: unit cho createNotifier (hàng đợi có giới hạn, timeout, kênh lỗi, stats).
- server/test/notificationsRecords.test.ts: integration qua HTTP thật dùng createTestServer với kênh giả (createTestServer nhận opts.notifier: (db) => Notifier), bám AC1..AC5 trong SPEC.
- Kỹ thuật bắt buộc: pairwise/combinatorial testing trên các yếu tố: vai trò người tạo, loại request (tạo mới, sửa, replay, 409), deleted, trạng thái kênh (tốt, lỗi, treo), cỡ phiếu (nhỏ, gần 2 MB). Có bảng pairwise trong code.
- Có negative test và failure-path test. Cố gắng phủ rộng, khoảng 25-35 test.

Chỉ tạo hai file test trên, không sửa file khác, không sửa src. Chạy `npx vitest run test/notifications.test.ts test/notificationsRecords.test.ts` trong server/ một lần để chắc chắn file biên dịch được và test đỏ vì chưa có hành vi (không phải lỗi import). Không commit. Báo lại ngắn gọn: số test, số đỏ, số xanh.
```

## Báo cáo của agent (rút gọn)

35 test, 34 đỏ, 1 xanh (test kiểm bảng pairwise, không phụ thuộc hành vi). Lỗi đỏ đều là AssertionError vì kênh không được gọi hoặc stats bằng 0. Agent tự nêu giả định: log đi qua `console.*`, `skipped` là không có người nhận, `dropped` tăng đồng bộ khi gọi `recordCreated`.

Kết quả review: [TEST-REVIEW.md](../TEST-REVIEW.md).
