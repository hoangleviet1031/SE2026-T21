# AI log 03: patch cho `createNotifier` và route

Công cụ: Claude Code, subagent `general-purpose` (Claude Opus 5.5). Commit lúc chạy: `4c014fb`. Output: diff ở `evidence/patch-ai.diff`.

## Prompt

```text
Repo ở D:\School\BT3_VT-082\repo, nhánh bt3/vt082-notify-new-record. Không đọc CLAUDE.md / CLAUDE.local.md.

Goal: làm xanh test thông báo phiếu mới bằng patch nhỏ nhất.
Đọc: docs/bt3-vt082/SPEC.md, docs/bt3-vt082/PLAN-REVIEW.md (các quyết định R1-R5 đã chốt), server/test/notifications.test.ts, server/test/notificationsRecords.test.ts.
Được sửa đúng 3 file: server/src/notifications.ts, server/src/repo/memberships.ts (hàm listNotificationRecipients), server/src/routes/records.ts.
Ràng buộc:
- Không sửa test, không thêm package, không đổi schema, không sửa file khác.
- recordCreated không ném lỗi, không chờ I/O; route chỉ gọi notifier sau khi tx đã commit. Không dựa vào status === 201 vì replay cũng trả 201.
- Tra người nhận ở worker, ngoài đường request. Người nhận: supervisor/owner, users.disabled = 0, trừ người tạo, chỉ trong ctx.projectId.
- Kiểm sức chứa hàng đợi bằng phép so sánh `>` (số phần tử sau khi thêm > capacity thì bỏ). recordId hoặc formId dài hơn MAX_ID_CHARS = 256 thì bỏ qua và đếm skipped.
- Log lỗi: console.error một dòng JSON {event:'notification_failed', reason, errorName?, projectId, recordId}, tuyệt đối không ghi err.message. reason là 'timeout' | 'channel_error' | 'recipients_error' | 'overflow'. Overflow chỉ log một dòng mỗi đợt tràn.
- logChannel ghi console.log một dòng JSON của notification.
- Comment tiếng Việt, ngắn, theo phong cách code xung quanh; bỏ `_` tiền tố và dòng "Khung" ở chỗ đã có hành vi.

Chạy trong server/: `npx vitest run test/notifications.test.ts test/notificationsRecords.test.ts`, `npx vitest run`, và `npx tsc -p .`. Không commit. Báo lại: file đã sửa, kết quả ba lệnh, điều gì bạn chưa chắc chắn.
```

## Báo cáo của agent (rút gọn)

35/35 test thông báo, 453/453 toàn server, `tsc` sạch; chỉ sửa 3 file được phép. Agent tự nêu điều chưa chắc: `recordCreated` không có try/catch bao ngoài; chưa có test cho kênh tôn trọng `signal`; đường `recipients_error` không được kiểm nội dung log; `errorName` lấy từ `err.name` do kênh đặt; N1 chưa đo.

## Review diff (bốn lớp, Lecture 06)

- **Scope:** đúng 3 file, không thêm package, không đổi schema (`git diff --stat`). Thêm `timer.unref()` ngoài prompt: chấp nhận, để kênh treo không giữ tiến trình sống.
- **Design:** `created` chỉ sinh ở nhánh ghi thật trong `applyPush`, replay không đi qua: đúng. Worker dùng `setImmediate`: đúng N2.
- **Correctness:** **sửa.** `recordCreated` nằm sau commit nhưng ngoài mọi try/catch. Ném lỗi ở đó thì client nhận `500` cho phiếu đã ghi, vi phạm invariant. Thêm chốt chặn ở route, test đỏ trước: xem `evidence/04-red-guard.txt`.
- **Evidence:** "agent báo xanh" không tính: chạy lại độc lập ở `evidence/03-green-after-patch.txt`. Thêm test kênh tôn trọng `signal` và nội dung log `recipients_error`.
