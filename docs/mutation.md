# Thử đột biến phần lõi

Coverage cao chỉ cho biết dòng code đã chạy qua, không cho biết test có bắt được lỗi hay không. Thử đột biến kiểm điều đó: cố ý sửa sai một chỗ trong code, chạy unit test của chỗ đó. Test đỏ là đột biến **bị bắt**; test vẫn xanh là đột biến **còn sống**, tức là có một lỗi thật kiểu đó mà test không thấy.

Phạm vi: ba phần lõi mà lỗi gây mất dữ liệu hoặc gửi sai (design §5.4, §5.6, ADR 0001): `threeWayMerge`, `valuesEqual`, `detectDeleteConflict` (`shared/src/merge.ts`); `nextRetryDelay` (`shared/src/backoff.ts`); `classifyUploadError`, `isLiveAttachment`, `isUploadable` (`client/src/sync/attachmentRules.ts`).

## Cách chạy

```bash
node scripts/mutation.mjs           # 25 đột biến, khoảng 1 phút
node scripts/mutation.mjs M2,M17    # chỉ vài mã
```

Script sửa từng chỗ, chạy `vitest` trên file test tương ứng, rồi trả file về như cũ (kể cả khi lỗi). Danh sách đột biến và mô tả nằm ngay trong `scripts/mutation.mjs`. Không dùng thư viện đột biến (Stryker) để khỏi thêm phụ thuộc. Không chạy trong CI. Trên Windows chạy từ đường dẫn ổ chữ hoa (`D:\...`), từ `d:\...` vitest của `shared` báo "no tests".

## Kết quả (2026-11-20)

| | Bị bắt | Còn sống |
|---|---|---|
| Trước khi thêm test | 17/25 | M1, M2, M4, M8, M9, M13, M17, M21 |
| Sau khi thêm 8 ca | **25/25** | – |

Đột biến còn sống ở lần chạy đầu và ca thêm để bắt nó:

| Mã | Đột biến | Vì sao test cũ không bắt | Ca thêm |
|---|---|---|---|
| M1 | `null` và trường không có không còn coi là bằng nhau | Không ca nào có giá trị `null` | `merge.test.ts` "M1: null và trường không có…" |
| M2 | Bỏ so độ dài mảng | Chỉ có ca đổi thứ tự, không có ca bỏ bớt lựa chọn | "M2: bỏ bớt một lựa chọn là sửa…" |
| M4 | Mọi object (GPS) coi là bằng nhau | Không ca nào có GPS | "M4: hai toạ độ GPS khác nhau…" |
| M8 | Trường xung đột tạm giữ giá trị client thay vì server | Ca xung đột chỉ kiểm `conflicts`, không kiểm `merged` | "M8: trường xung đột tạm giữ giá trị server…" |
| M9 | Trường bị xoá vẫn nằm trong `merged` với giá trị `undefined` | Không ca nào xoá trường | "M9: client xoá trường…" |
| M13 | Hai bên cùng xoá cũng coi là xoá vs sửa | Không ca nào cả hai cùng xoá | "M13: hai bên cùng xoá…" |
| M17 | Trần backoff 50 phút thay vì 5 phút | Test so với hằng `BACKOFF_MAX_MS` nên đổi hằng thì test đổi theo | "M17: trần là 5 phút như design §5.4" (ghi số thẳng) |
| M21 | Mọi `409` đều gửi bù chunk, không riêng `missing_chunks` | Chỉ có ca `409 missing_chunks` | `attachmentRules.test.ts` "409 với mã khác…" |

Các ca mới kiểm hành vi đang có, không đổi ngữ nghĩa `merge.ts` (CLAUDE.md bất biến 8).
