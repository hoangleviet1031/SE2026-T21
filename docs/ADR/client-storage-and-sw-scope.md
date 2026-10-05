# ADR-002: IndexedDB (Dexie) cho dữ liệu, service worker chỉ cho app shell

- Trạng thái: **Proposed**
- Ngày: 2026-09-30
- Người quyết định: A, B, C (owner: B)

## Bối cảnh
PWA cần: mở được khi offline; lưu phiếu, file (Blob), hàng đợi bền vững; ghi nhiều bảng nguyên tử; UI cập nhật khi dữ liệu đổi; test tự động được.

## Quyết định
1. Dữ liệu ứng dụng lưu **chỉ** trong IndexedDB qua **Dexie 4** (transaction nhiều bảng, index, Blob, `liveQuery`).
2. Service worker (vite-plugin-pwa, Workbox `generateSW`) **chỉ** precache app shell + navigation fallback; **không** runtime-cache API.
3. Cập nhật SW theo kiểu **prompt** (không `skipWaiting` tự động).
4. Gọi `navigator.storage.persist()` sau đăng nhập; hiển thị dung lượng dùng.
5. Thay đổi schema Dexie luôn tăng `db.version(n)` kèm migration.

## Các phương án đã cân nhắc
| Phương án | Lý do loại |
|---|---|
| localStorage / localForage | Không transaction nhiều bảng, không index; localStorage giới hạn ~5 MB và đồng bộ chặn UI |
| IndexedDB thuần | Làm được nhưng tốn công, dễ lỗi transaction |
| RxDB / PouchDB | Nặng, kèm cơ chế sync riêng không dùng tới (xem ADR-001) |
| Cache API cho dữ liệu (SW trả dữ liệu API) | Hai nguồn sự thật ở client; khó truy vấn; khó transaction với outbox |
| SW `autoUpdate` | Có thể reload giữa lúc người dùng điền phiếu/đang sync |

## Hệ quả
- Một nguồn dữ liệu duy nhất ở client → repository + `liveQuery` đơn giản.
- Test logic lưu trữ bằng `fake-indexeddb`; offline shell kiểm chứng bằng E1, E6.
- iOS Safari có thể xoá dữ liệu site không được cài/không dùng lâu → khuyến khích cài PWA, sync thường xuyên, ghi trong [RISKS.md](../RISKS.md).

## Kiểm chứng
E1 (shell offline), E2 (dữ liệu + Blob sống qua reload), E6 (update không mất dữ liệu).
