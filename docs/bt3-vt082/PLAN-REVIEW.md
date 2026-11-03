# Review implementation plan của AI bằng repo thật

Plan gốc: [ai-log/01-plan-prompt-output.md](ai-log/01-plan-prompt-output.md). Mỗi dòng có lệnh hoặc file để kiểm lại.

## Sửa hoặc bác bỏ

| # | Plan đề xuất | Quyết định | Evidence |
|---|---|---|---|
| R1 | Test tải `notifications.load.test.ts` gate trong `npm test` | **Bác bỏ.** Harness riêng, server chạy ở tiến trình khác | Server không có vitest config nên mọi `*.test.ts` vào `npm test` và CI (`.github/workflows/ci.yml`, Node 22). Client, server chung event loop thì số đo trộn hai bên, chính plan cũng thừa nhận. `docs/perf.md:34`: bộ đo hiệu năng của nhóm cố ý không chạy trong CI |
| R2 | `createApp` mặc định `noopNotifier`, chỉ `index.ts` nối notifier thật | **Sửa.** Mặc định là notifier thật với `logChannel`, `index.ts` không đổi | `grep -rn "src/index" server/test` rỗng: không test nào chạm `index.ts`, còn `createApp` có 10 chỗ gọi trong test. Quên nối dây thì toàn bộ test vẫn xanh mà production im lặng |
| R3 | N1 chỉ gate phiếu thường; 120 × 2 MB "chỉ để tham khảo" | **Bác bỏ.** Phiếu lớn là risk trọng tâm của VT-082: phải đo đầu-cuối, so với 3,5 s và có nhóm đối chứng tại baseline | Con số 41 ms/PUT của plan đo trên hàm mô phỏng, không phải `canonicalJson` thật và không qua SQLite. Thu hẹp N1 trước khi đo là đổi yêu cầu cho vừa ước lượng |
| R4 | `formId` dài hơn 128 ký tự thì thành `null` | **Sửa.** Bỏ qua thông báo và đếm vào `skipped`; kiểu `formId` giữ `string` | Rủi ro có thật: `isValidPush` (`routes/records.ts:12`) không giới hạn độ dài, `records.form_id` không có FK tới `forms` (`db.ts`). Nhưng `null` làm hợp đồng của mọi kênh sau này phải xử lý một trường không có ý nghĩa nghiệp vụ |
| R5 | Log drop tối đa một dòng mỗi 60 s | **Sửa.** Log một dòng khi bắt đầu tràn, hết tràn thì reset | Giới hạn theo đồng hồ thêm state và phụ thuộc thời gian vào test (Lecture 07: flaky do time) |

## Đã kiểm và giữ nguyên

- Không dựa vào `status === 201`: nhánh replay ở `routes/records.ts:92` trả lại `seen.status`, tức 201.
- Worker không chen vào transaction: `tx` đồng bộ (`db.ts:295`), `grep -rn "tx(db, async" server/src` rỗng.
- Phát event trước `res.json`: fault `drop` thay `res.json` bằng cắt socket (`routes/faults.ts`), commit đã xong nên vẫn cần báo.
- Tạo phiếu với `deleted: true` có thật ở production: op đã gửi rồi mới xoá vẫn có `baseVersion = 0` (design §5.7).

## File thay đổi sau review

`server/src/notifications.ts` (mới), `server/src/repo/memberships.ts`, `server/src/routes/records.ts`, `server/src/app.ts`, `server/test/fixtures.ts`, test và harness. **Bỏ** `server/src/index.ts` và `notifications.load.test.ts` khỏi danh sách.
