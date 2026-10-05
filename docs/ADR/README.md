# Architecture Decision Records

Ghi lại các quyết định kiến trúc **khó đảo ngược hoặc dễ bị chất vấn**. Một ADR đã `Accepted` không sửa nội dung quyết định — muốn đổi thì viết ADR mới ở trạng thái `Supersedes ADR-xxx`.

Tên file: `<chủ-đề>.md` (kebab-case, không đánh số ở đầu). Số ADR chỉ nằm trong tiêu đề file và bảng dưới đây.

| ADR | Tiêu đề | Trạng thái | Owner |
|---|---|---|---|
| [001](consistency-model.md) | Consistency model và chiến lược conflict | Proposed (mục tiêu Accepted cuối Tuần 7) | B |
| [002](client-storage-and-sw-scope.md) | IndexedDB (Dexie) cho dữ liệu, service worker chỉ cho app shell | Proposed | B |
| [003](sync-trigger-in-app.md) | Sync chạy trong app, không dựa vào Background Sync API | Proposed | B |
| [004](attachments.md) | Attachments: upload trước, content hash, giới hạn dung lượng | Proposed | C |

Vòng đời: `Proposed` → (review cả nhóm, có test chứng minh) → `Accepted` → (`Superseded`).

## Template

```markdown
# ADR-NNN: <Tiêu đề>

- Trạng thái: Proposed | Accepted | Superseded by ADR-xxx
- Ngày: YYYY-MM-DD
- Người quyết định: A, B, C

## Bối cảnh
Vấn đề, ràng buộc, lực tác động.

## Quyết định
Chúng ta sẽ …

## Các phương án đã cân nhắc
| Phương án | Ưu | Nhược | Lý do loại |

## Hệ quả
Tích cực / tiêu cực / việc phải làm.

## Kiểm chứng
Test nào chứng minh quyết định được hiện thực đúng.
```
