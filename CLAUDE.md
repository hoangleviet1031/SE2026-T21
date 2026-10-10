# CLAUDE.md – hướng dẫn cho AI agent làm việc trong repo này

Dự án: PWA khảo sát thực địa offline-first, nhiều tổ chức (multi-tenant theo dự án). Đồ án 3 sinh viên, 8 tuần, code phần lớn do AI viết dưới sự giám sát của con người. Quy trình làm việc: [docs/vibe-coding.md](docs/vibe-coding.md).

## Đọc trước khi sửa code

1. Ticket đang làm trong [docs/plan/](docs/plan/). Mỗi phiên làm việc chỉ làm **một ticket**.
2. Các mục spec mà ticket trỏ tới trong [docs/design.md](docs/design.md).
3. [ADR 0001](docs/adr/0001-consistency-model.md) nếu đụng tới đồng bộ, merge, outbox, idempotency; [ADR 0002](docs/adr/0002-multi-tenancy.md) nếu đụng tới dự án, người dùng, phân quyền, API.
4. `CLAUDE.md` trong thư mục con đang sửa (`server/`, `client/`, `shared/`).

**Spec là đích, code hiện tại là khung chưa theo kịp spec.** Khi spec và code khác nhau: làm theo spec, nhưng chỉ trong phạm vi ticket. Không "tiện tay" sửa phần khác; ghi lại vào phần "Phát hiện ngoài phạm vi" khi báo cáo.

## Lệnh

```bash
npm install
npm run dev          # API :3001 + web :5173
npm run typecheck    # bắt buộc xanh trước khi báo xong
npm test             # unit (shared) + integration (server)
npm run test:e2e     # Playwright trên bản build; tắt `npm run dev` trước khi chạy
npm test -w shared   # chỉ một workspace
```

Node ≥ 22.13 (cần `node:sqlite`).

## Cấu trúc

```
shared/   kiểu dùng chung, threeWayMerge, backoff, validate – hàm thuần, không I/O
server/   Express 5 + node:sqlite; src/routes/*, src/db.ts; test/ (Vitest, gọi HTTP thật)
client/   React 19 + Vite + Dexie + vite-plugin-pwa; src/db, src/sync, src/pages, src/components; e2e/
docs/     design.md (spec), ui.md (phác thảo màn hình), adr/ (quyết định), plan/ (ticket), worklog/ (nhật ký từng người), vibe-coding.md (quy trình)
```

## Bất biến không được phá (vi phạm = PR bị từ chối)

1. **Không mất dữ liệu người dùng.** Không xoá phiếu, op, ảnh chưa đồng bộ trừ khi người dùng bấm xác nhận. Không tự chọn hộ người dùng khi xung đột (ADR 0001 quy tắc 6, 7).
2. **Lưu phiếu và tạo op trong cùng một transaction Dexie.** Không bao giờ có phiếu đã sửa (không phải nháp) mà thiếu op.
3. **Idempotency key (`opId`) không bao giờ dùng cho dữ liệu khác.** Op đã gửi (`attempts > 0`) không được sửa `data`.
4. **Server quyết định version và thời gian.** Không dùng đồng hồ thiết bị để so sánh thứ tự; pull dùng `seq`.
5. **`projectId` chỉ lấy từ đường dẫn đã qua middleware thành viên** (`req.ctx`), không bao giờ từ body hay query. Mọi truy vấn dữ liệu dự án có `project_id = ?`. Id thuộc dự án khác trả `404`.
6. **`updatedBy`, `created_by` lấy từ token**, không tin client.
7. **UI chỉ đọc/ghi IndexedDB**, không gọi API trực tiếp từ component (trừ màn hình cần online: Thành viên, Dự án, Xuất, builder lưu form).
8. **Không sửa ADR** (`docs/adr/*`) và không đổi ngữ nghĩa `shared/src/merge.ts` nếu người dùng chưa đồng ý rõ ràng.

## Quy ước code

- TypeScript strict. Không `any`, không `@ts-ignore`/`@ts-expect-error`, không `!` để né kiểm tra null trừ chỗ đã chứng minh được (ghi chú lý do).
- Chữ hiển thị cho người dùng và comment viết **tiếng Việt**, giọng thường ngày, giống code hiện có. Tên biến, hàm, file viết tiếng Anh.
- Comment giải thích **vì sao**, không mô tả lại code. Trỏ tới mục spec khi hữu ích: `// Xem docs/design.md §5.6`.
- Lỗi API theo dạng `{ error: '<mã>' }` với mã có trong design §7.1. Mã mới phải thêm vào §7.1 cùng PR.
- Không thêm thư viện mới nếu chưa hỏi. Ưu tiên API có sẵn của trình duyệt/Node.
- Không bắt lỗi rồi nuốt (`catch {}`); hoặc xử lý theo bảng design §8, hoặc ném tiếp.
- Hàm logic thuần (validate, merge, CSV escape, tính trạng thái hiển thị) đặt ở `shared/` hoặc file riêng không phụ thuộc React để unit test được.

## Kiểm thử

- Mỗi thay đổi hành vi có test. Ticket ghi rõ ca test nào (mã O*, C*, R*, A*, T* trong design §10.1 / ADR 0002).
- **Không sửa test có sẵn để nó qua** (nới assertion, thêm `skip`, tăng timeout tuỳ tiện). Nếu test cũ sai theo spec mới, nói rõ lý do trong báo cáo.
- E2E: chọn phần tử bằng role/label/`data-testid`, không dùng CSS class. Không dùng `page.waitForTimeout`; chờ bằng `expect(...).toHaveText(..., { timeout })`.
- Integration server: dùng `openDb(':memory:')` và server cổng ngẫu nhiên như `server/test/records.test.ts`.

## Khi xong một ticket

1. `npm run typecheck` và `npm test` xanh; chạy E2E liên quan nếu có.
2. Cập nhật tài liệu nếu đổi API, kiểu dùng chung, mã lỗi, schema (cùng PR): design.md (kèm bảng lịch sử thay đổi), cột "Trạng thái" trong design §7 và §10.1.
3. Đánh dấu ticket trong `docs/plan/` là xong và thêm một dòng vào `docs/worklog/<tên người làm>.md` (quy ước ở [docs/worklog/README.md](docs/worklog/README.md)). Chỉ sửa file worklog của người đang làm.
4. Báo cáo ngắn: đã làm gì, file nào, test nào, **chỗ nào người review cần đọc kỹ**, phát hiện ngoài phạm vi.
