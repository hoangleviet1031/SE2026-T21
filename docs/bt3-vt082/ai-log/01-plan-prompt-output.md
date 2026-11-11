# AI log 01: implementation plan (nguyên văn)

Công cụ: Claude Code, subagent `Plan` (Claude Opus 5.5), chỉ đọc repo, không sửa file. Commit lúc chạy: `ff44664`.

## Prompt

```text
Repo ở D:\School\BT3_VT-082\repo (PWA khảo sát offline-first, server Express 5 + node:sqlite, test bằng vitest). Không đọc các file CLAUDE.md / CLAUDE.local.md.

Goal: thêm thông báo cho sự kiện "có phiếu mới" theo spec ở docs/bt3-vt082/SPEC.md; lỗi gửi thông báo không được làm hỏng giao dịch ghi phiếu.
Scope: chỉ một vertical slice nhỏ ở server chạy được, có test. Chưa viết code.
Risk trọng tâm: đầu vào lớn gây timeout hoặc suy giảm hiệu năng (mục tiêu 120 tác vụ đồng thời, p95 ≤ 3,5 s).

Hãy lập implementation plan gồm:
1. Assumptions về repo và về nghiệp vụ.
2. Danh sách file dự định tạo/sửa, mỗi file thay đổi gì.
3. Thiết kế: event phát ở đâu, hàng đợi, timeout, cách lấy người nhận, xử lý lỗi.
4. Test sẽ viết.
5. Các điểm rủi ro còn lại.
Viết bằng tiếng Việt, ngắn gọn, không quá 1 trang rưỡi.
```

## Output

# Plan VT-082: thông báo `record.created` (chưa viết code, không sửa file nào)

**Phát hiện cần chốt trước:** N1 có thể không đạt với 120 phiếu 2 MB, dù chưa thêm thông báo. `PUT` chạy đồng bộ trên một event loop nên các request xếp hàng nối tiếp.
- Tôi đo `node -e` phần JSON trên phiếu 1,84 MB, 20.000 khoá, chỉ trong bộ nhớ: parse 5,4 ms, stringify 6,7 ms, canonical 10,4 ms (hàm mô phỏng, không phải `canonicalJson` thật).
- Mỗi `PUT` có khoảng 2 parse, 3 stringify và 1 canonical, tức khoảng 41 ms. Nhân 120 được khoảng 4,9 s, chưa tính SQLite ghi 3 bản dữ liệu, fsync và SHA-256.
- Đây là ước lượng, chưa đo đầu-cuối. Spec cũng không ghi N1 áp cho cỡ phiếu nào.
- Đề xuất: bước 1 đo baseline. N1 gate với phiếu thường, còn 120 × 2 MB chỉ đo và báo cáo. Tối ưu đường ghi nằm ngoài slice.

## 1. Assumptions
**Repo**
- HEAD `ff44664` chỉ thêm spec so với baseline `ef92b35`; working tree sạch.
- Chưa có thông báo, hàng đợi hay logger; log hiện dùng `console.*` với JSON một dòng.
- Server không có vitest config, nên timeout mặc định 5 s và test load phải tự đặt timeout.
- Theo yêu cầu, tôi không đọc CLAUDE.md, nên quy ước trong đó (vd. có phải cập nhật `design.md` không) chưa được đối chiếu.

**Nghiệp vụ**
- Spec chưa chỉ định kênh thật, nên slice dùng interface `NotificationChannel`. Production dùng `logChannel`, chưa giao tới người dùng thật.
- "Còn hoạt động" = `users.disabled = 0` và `projects.archived = 0`. Đây là cách tôi diễn giải, spec không định nghĩa.
- Người nhận tính lúc dispatch, nên ai bị rút khỏi dự án khi event đang chờ sẽ không nhận.
- Giao "tối đa một lần": server crash thì mất event trong hàng đợi, spec chấp nhận và N4 cấm đổi schema.

## 2. File dự định tạo/sửa
Tất cả nằm dưới `D:\School\BT3_VT-082\repo\`.

| File | Thay đổi |
|---|---|
| `server\src\notifications.ts` (mới) | Các type, `createNotifier({db, channel, capacity, concurrency, timeoutMs})`, `noopNotifier`, `logChannel` |
| `server\src\repo\memberships.ts` | Thêm `listNotificationRecipients(ctx, db)`, chỉ lọc theo `ctx.projectId` |
| `server\src\routes\records.ts` | `recordsRouter(db, notifier)`; `applyPush` trả thêm `created`; gọi notifier sau `tx()` |
| `server\src\app.ts` | Thêm `opts.notifier`, mặc định `noopNotifier` để test cũ không đổi |
| `server\src\index.ts` | Tạo notifier thật với `logChannel` |
| `server\test\fixtures.ts` | Truyền `notifier` qua `createTestServer` |
| `server\test\notifications.test.ts` (mới) | Unit và integration |
| `server\test\notifications.load.test.ts` (mới) | Test tải N1 |
| `docs\bt3-vt082\evidence\` | Số đo baseline và sau khi thêm thông báo |

Không thêm package, không có migration, không thêm route.

## 3. Thiết kế
**Điểm phát event**
- Trong `PUT`, ngay sau khi `tx()` trả về (đã commit) và trước `res.json`. Fault `drop` vẫn báo đúng một lần, lần gửi lại thành replay nên không báo trùng.
- Điều kiện đặt trong `applyPush`: `created` chỉ có khi `currentVersion === 0 && !saved.deleted`.
- Nhánh replay không có `created`. Không được dựa vào `status === 201`, vì replay cũng trả 201 từ bảng `idempotency`.
- Lỗi trong tx thì rollback và không tới được điểm phát.

**Hợp đồng và dữ liệu**
- `recordCreated(ctx, {id, formId, formVersion, createdAt})` trả `void`, bọc `try/catch` toàn bộ, chỉ push vào mảng rồi `setImmediate(pump)`.
- Không truyền `ServerRecord` để event không giữ tham chiếu tới `data`.
- `isValidPush` không giới hạn độ dài `formId`, nên `formId` có thể gần 2 MB và phá N3. Không được từ chối request vì invariant, nên `formId` dài hơn 128 ký tự thành `null`.
- Không dùng `slice`, vì chuỗi cắt có thể còn giữ chuỗi gốc trong bộ nhớ. `recordId` đã bị chặn bởi giới hạn header HTTP.

**Hàng đợi**
- FIFO trong bộ nhớ, `capacity` 1000, đầy thì bỏ event mới và tăng `dropped`, không chặn request.
- Log drop tối đa một dòng mỗi 60 s để tránh bão log.
- `concurrency` 4. `stats()` trả `{sent, failed, timedOut, dropped, noRecipients}`; `idle()` để test chờ, không phải polling.
- Các giá trị trên là mặc định khởi điểm, chưa suy ra từ số đo; riêng capacity 1000 đủ cho burst 120.

**Timeout**
- Gọi `send(notification, signal)`, 5 s mỗi lần qua `Promise.race` với timer `unref`, rồi abort `signal`.
- Hết timeout thì giải phóng slot dù kênh bỏ qua abort.
- Kênh treo hoàn toàn: thông lượng khoảng 0,8 event/s, hàng đợi đầy thì drop, request không bị ảnh hưởng.

**Người nhận**
- Lấy trong worker, ngoài đường request, sau `setImmediate`. Do `tx` đồng bộ, worker không chen được vào giữa transaction.
- SQL dùng PK `(project_id, user_id)`: `memberships JOIN users JOIN projects WHERE m.project_id = ? AND m.role IN ('supervisor','owner') AND u.disabled = 0 AND p.archived = 0 AND m.user_id <> ?`.
- Danh sách rỗng thì không gọi kênh. Mỗi phiếu gọi `send` đúng một lần, kèm mảng `recipients`.

**Xử lý lỗi**
- Gọi kênh qua `Promise.resolve().then(...)` để bắt cả lỗi ném đồng bộ. Lỗi tra CSDL cũng được bắt và đếm.
- Log `{event, reason, errorName, projectId, recordId}`, không ghi `err.message` vì message của kênh có thể chứa bất cứ gì.
- Không retry trong slice này.

**Phương án đã loại**
- Gọi notifier trong tx: lỗi sẽ rollback phiếu, vi phạm AC3.
- Tra người nhận trong request: tốn thêm việc trên đường ghi và phải tự cách ly lỗi.
- Outbox trong CSDL: bền hơn nhưng đổi schema, vi phạm N4.

## 4. Test
Seed demo đã đủ ca: `demo-yte` có `lan` supervisor, `minh` surveyor, `chu` owner; `demo-nongnghiep` có `lan` surveyor, `chu` owner. Dùng fake channel.

- **AC1:** `minh` tạo thì nhận `[chu, lan]`, đúng một lần. `lan` tạo thì nhận `[chu]`. `chu` tạo ở `nongnghiep` thì kênh không được gọi. Tài khoản bị khoá không nhận.
- **AC2:** không có thông báo với `200`, replay cùng key (kể cả sau `drop`), tạo với `deleted: true`, `400`, `404` (kể cả id thuộc dự án khác), `409`, `422`, `413`. Thêm ca SQL trigger làm `saveResponse` lỗi: 500, rollback, không thông báo.
- **AC3:** kênh chạy tốt, ném đồng bộ, reject và treo đều cho cùng status và body (bỏ qua `updatedAt`), giống cả khi dùng `noopNotifier`. Kiểm 3 bảng đã commit. Spy `console.error` với chuỗi sentinel trong `data`: log không chứa chuỗi đó. Kênh reject muộn sau timeout không gây `unhandledRejection`.
- **AC4/N3:** phiếu gần 2 MB trả 201, `JSON.stringify(notification)` không chứa sentinel và nhỏ hơn 1 KB. `formId` khổng lồ cho `formId: null`. Với `capacity: 2` và kênh treo: request vẫn 201, `dropped` đúng, hàng đợi không vượt capacity.
- **AC5:** `lan` là supervisor ở `yte` nhưng không nhận khi `nongnghiep` có phiếu; thêm ca dùng trực tiếp hàm repo.
- **Hợp đồng/N2:** `recordCreated` trả về đồng bộ khi kênh treo và không ném kể cả khi `db` đã đóng; timeout dùng `timeoutMs` nhỏ.
- **N1 (`load.test`):** CSDL file WAL trong thư mục tạm (`:memory:` không có fsync), 120 `PUT` đồng thời, ba chế độ kênh, assert p95 ≤ 3.500 ms.
  - Mặc định dùng phiếu thường, nên chạy được trong CI.
  - `VT082_LOAD=1` thêm bản 2 MB, chỉ ghi số vào evidence.
  - Client và server chung event loop nên số đo hơi bi quan.

## 5. Rủi ro còn lại
1. **N1 với 2 MB** (mục đầu): có thể cần sửa đường ghi, ngoài slice. Nên chốt lại phạm vi N1 trong spec.
2. **Bộ nhớ khi tải lớn:** 120 body 2 MB có thể dùng vài trăm MB heap ở `express.json`, độc lập với hàng đợi, và kéo theo GC. Chưa đo.
3. **Test tải flaky:** vitest chạy song song nhiều file và CI dùng Node 22 trong khi máy đo dùng Node 24. Chỉ gate phiếu thường, số 2 MB chỉ để tham khảo.
4. **Kênh chặn event loop** (vòng lặp đồng bộ): timeout không cứu được. Hợp đồng yêu cầu kênh phải bất đồng bộ.
5. **Promise treo bỏ qua abort:** chiếm bộ nhớ cho đến khi kết thúc. Cần lưu ý khi viết kênh thật.
6. **Mất thông báo:** khi tràn hàng đợi hoặc crash, chỉ có bộ đếm và log, không gửi bù. Giám sát viên vẫn thấy phiếu khi pull.
7. **Phiếu tạo ở trạng thái xoá rồi khôi phục (`200`):** không bao giờ có thông báo, đúng theo spec nhưng là khoảng trống nghiệp vụ.
8. **Dự án rất nhiều supervisor:** mảng `recipients` không bị giới hạn, chi phí tăng tuyến tính theo số thành viên.
9. **`formId: null`:** kênh thật phải chấp nhận giá trị này. `recordId` dài vẫn giữ nguyên, tệ nhất khoảng 16 MB nếu đầy 1000 event (ước tính theo giới hạn header mặc định của Node).

### Critical Files for Implementation
- D:\School\BT3_VT-082\repo\server\src\routes\records.ts
- D:\School\BT3_VT-082\repo\server\src\notifications.ts (mới)
- D:\School\BT3_VT-082\repo\server\src\repo\memberships.ts
- D:\School\BT3_VT-082\repo\server\src\app.ts
- D:\School\BT3_VT-082\repo\server\test\fixtures.ts
