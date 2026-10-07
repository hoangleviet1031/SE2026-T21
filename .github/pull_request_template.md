## Ticket

<!-- vd. TV2-03 – Route theo dự án + phạm vi pull (docs/plan/tv2-sync-server.md) -->

## Thay đổi

<!-- 2–5 gạch đầu dòng: làm gì, vì sao. Đổi API/kiểu/schema thì ghi rõ. -->

## Tiêu chí "Xong khi" → test

| Tiêu chí trong ticket | Test kiểm chứng |
|---|---|
| | |

## AI đã làm gì / tôi đã kiểm tra gì

- Công cụ AI dùng:
- Phần AI viết chính:
- Phần tôi tự viết hoặc sửa tay:
- Tôi đã tự đọc toàn bộ diff: [ ] có
- Tôi giải thích được mọi đoạn trong diff: [ ] có
- Đã thử trên điện thoại thật (nếu có UI): [ ] có / [ ] không áp dụng

## Người review cần đọc kỹ

<!-- Chỉ ra file/hàm rủi ro nhất: transaction, SQL dự án, xoá dữ liệu, merge, ... -->

## Checklist (docs/vibe-coding.md §4)

- [ ] Chỉ chạm file trong phạm vi ticket (hoặc đã giải thích)
- [ ] Không thêm thư viện mới (hoặc nhóm đã đồng ý)
- [ ] Không xoá/skip/nới test có sẵn; không `waitForTimeout`
- [ ] Không `any`, `@ts-ignore`, `catch` nuốt lỗi
- [ ] Giữ bất biến trong CLAUDE.md (không mất dữ liệu, transaction phiếu+op, `projectId` từ `ctx`, `updatedBy` từ token)
- [ ] `npm run typecheck` và `npm test` xanh
- [ ] Đã cập nhật design.md / ADR / trạng thái ticket nếu cần
- [ ] Chạm vùng **Lõi** → đã nhờ hai người duyệt

## Phát hiện ngoài phạm vi

<!-- Lỗi hoặc chỗ lệch spec thấy được nhưng không sửa trong PR này -->
