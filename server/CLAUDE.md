# server/ – quy tắc riêng

Express 5 + `node:sqlite` (`DatabaseSync`, đồng bộ). Spec: design §6.1, §7, §9; ADR 0001 quy tắc 1–3; ADR 0002 §2–3.

- **Mọi lần ghi nằm trong `tx(db, ...)`** (`BEGIN IMMEDIATE`). Cấp `seq` bằng `nextSeq(db)` bên trong cùng transaction với lần ghi phiếu; không cấp `seq` ngoài transaction (cursor sẽ sai, xem design §5.5).
- **Đổi schema:** thêm bước migration mới theo `PRAGMA user_version` trong `db.ts`, không sửa câu `CREATE TABLE` cũ đã chạy. Chỉ thêm cột/bảng.
- **Route theo dự án** gắn dưới `/api/projects/:projectId` và đi qua `requireMember(minRole)`. Trong handler chỉ dùng `req.ctx.projectId`, `req.ctx.userId`, `req.ctx.role`.
- **Truy vấn dữ liệu dự án** đi qua hàm trong lớp truy cập dữ liệu nhận `ctx` làm tham số đầu tiên; không viết `db.prepare(...)` trực tiếp trong route cho bảng có `project_id`.
- **Phạm vi:** `surveyor` chỉ thấy phiếu `created_by = ctx.userId`. Phiếu ngoài phạm vi hoặc thuộc dự án khác → `404 not_found` (không phải `403`).
- **Idempotency:** chỉ lưu response `< 300`, trong cùng transaction với lần ghi. So `request_hash` trước khi replay.
- Ép kiểu kết quả `.get()/.all()` qua interface `*Row` rồi đổi sang kiểu `shared` bằng hàm `toX(row)`, như `toRecord` trong `routes/records.ts`.
- Validate thân request ở đầu handler, trả `400 invalid_body` (hoặc mã cụ thể hơn trong design §7.1).
- Route tiêm lỗi chỉ đăng ký khi `ENABLE_TEST_ROUTES=1`.
- Token: chỉ lưu và so sánh SHA-256; dùng `crypto.timingSafeEqual` khi so chuỗi bí mật.

**Test** (`server/test/*.test.ts`): server thật cổng ngẫu nhiên, `openDb(':memory:')`, fixture hai dự án từ `test/fixtures.ts` (TV3-02). Mỗi route mới cần ít nhất: ca thành công, ca sai quyền, ca dự án khác.
