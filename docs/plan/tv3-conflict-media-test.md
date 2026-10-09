# TV3 – Conflict UX, ảnh, export, kiểm thử

Sở hữu: `client/src/pages/ConflictPage.tsx`, `server/src/routes/attachments.ts`, `server/src/routes/export.ts`, `server/src/routes/faults.ts`, `server/src/cli/`, `client/e2e/`, `server/test/`, `.github/`. Xem [team-plan](../team-plan.md#thành-viên-3-conflict-ux-ảnh-export-đầu-mối-kiểm-thử).

TV3 là đầu mối kiểm thử: giữ [ma trận E2E](../design.md#101-ma-trận-e2e-bắt-buộc) cập nhật và review test của hai bạn còn lại theo [checklist](../vibe-coding.md#4-checklist-review-người-tự-kiểm-và-người-duyệt), đặc biệt mục "Dấu hiệu AI lách".

---

## TV3-01 · CI, `ENABLE_TEST_ROUTES`, unit test client

- **Trạng thái:** ⏳ `feat/tv3-01-ci-test-routes`
- **Tuần:** 1 · **Phụ thuộc:** không
- **Spec:** design §9 (Route tiêm lỗi), §10.2
- **File:** `.github/workflows/ci.yml` (đã có bản đầu), `server/src/index.ts`, `server/src/app.ts`, `client/playwright.config.ts`, `client/package.json`, `client/vitest.config.ts` (mới), `package.json`

**Việc**
- Đẩy repo lên GitHub, chạy thử `ci.yml`, sửa cho xanh. **Người làm:** bật branch protection cho `main` (cần PR, cần CI xanh, ít nhất 1 review).
- Server: route `/api/__test/*` chỉ đăng ký khi `ENABLE_TEST_ROUTES=1`; `playwright.config.ts` truyền biến này cho webServer API.
- Client: thêm script `test` chạy Vitest (đã có trong repo) cho file `src/**/*.test.ts` môi trường node, dành cho hàm thuần phía client; script `test` gốc chạy cả client.

**Xong khi:** PR mở trên GitHub tự chạy CI; chạy server không có biến → `POST /api/__test/faults` trả 404.

---

## TV3-02 · CLI quản trị, fixture, sửa test theo API mới

- **Trạng thái:** —
- **Tuần:** 2 · **Phụ thuộc:** TV2-02 · **Làm cùng:** TV2-03 (**một PR**)
- **Spec:** design §12 (Lệnh quản trị), §10.1 (fixture chung)
- **File:** `server/src/cli/user.ts`, `server/src/cli/seedDemo.ts` (mới), `server/package.json` (scripts), `server/test/fixtures.ts` (mới), `server/test/records.test.ts`, `client/e2e/helpers.ts` (mới), `client/e2e/*.spec.ts`

**Việc**
- CLI `user:add --name [--admin]` (in `userId` + token **một lần**), `user:rotate-token --user`, `user:disable --user`, `seed:demo` (dự án `demo-yte`, `demo-nongnghiep`, mỗi dự án một form; người dùng: `lan` supervisor yte + surveyor nongnghiep, `minh` surveyor yte, `admin`). Token demo cố định, in trong README phần chạy dev.
- `server/test/fixtures.ts`: `createTestServer()` trả `{ base, tokens, projects }` với đúng bộ dữ liệu trên.
- `client/e2e/helpers.ts`: `login(page, token)`, `api(request, token)` gắn header, URL theo dự án.
- Sửa 3 E2E và integration hiện có theo đường dẫn mới + token, **không đổi ý nghĩa assertion**.

**Xong khi:** CI xanh với đường dẫn mới; README có mục "Tài khoản demo".

---

## TV3-03 · Nén ảnh

- **Trạng thái:** —
- **Tuần:** 2 · **Phụ thuộc:** không
- **Spec:** design §4.4 (Ở client), §11.2 (≤ 600 KB)
- **File:** `client/src/media/compress.ts` (mới), `client/src/components/FormRenderer.tsx` (nhánh `photo`), `client/e2e/photo.spec.ts` (mới), `client/e2e/fixtures/photo-4mb.jpg`

**Việc**
- `compressImage(file): Promise<Blob>`: `createImageBitmap` (`imageOrientation: 'from-image'`), cạnh dài ≤ 1600 px, canvas → JPEG 0.8. Ảnh đã nhỏ hơn thì vẫn chuyển JPEG để bỏ EXIF/GPS trong file.
- Lưu blob đã nén; hiện thumbnail các ảnh đã chọn, nút xoá ảnh khỏi trường.
- `QuotaExceededError` → "Bộ nhớ đầy: đồng bộ rồi dọn ảnh đã tải lên" (design §8).

**Xong khi:** E2E: chọn ảnh 4 MB → blob trong IndexedDB ≤ 600 KB, cạnh dài ≤ 1600.

---

## TV3-04 · Test cách ly T1–T5 · **Lõi**

- **Trạng thái:** —
- **Tuần:** 3 · **Phụ thuộc:** TV2-03, TV3-02
- **Spec:** ADR 0002 Kiểm chứng T1–T5
- **File:** `server/test/isolation.test.ts` (mới)

**Việc**
- **T1** thành viên A gọi API B → 403 `not_member`. **T2** PUT id đã có ở A qua đường dẫn B → 404, dữ liệu A không đổi. **T3** pull surveyor vs supervisor. **T4** (nếu TV2-04 chưa xong thì để `todo`).
- **T5:** duyệt `app._router`/`app.router.stack` để liệt kê mọi route khớp `/api/projects/:projectId/...`, gọi từng route (method tương ứng, thân tối thiểu) bằng token chỉ thuộc dự án khác → khẳng định không route nào trả `2xx`. Route mới thêm sau này tự được kiểm.

**Xong khi:** test chạy trong CI; cố tình bỏ `requireMember` ở một route thì T5 đỏ (thử tay, ghi vào PR).

**Review kỹ:** T5 thật sự tìm được route (assert số route > 0, in danh sách).

---

## TV3-05 · Upload ảnh theo chunk (server) · **Lõi**

- **Trạng thái:** —
- **Tuần:** 3 · **Phụ thuộc:** TV2-03
- **Spec:** design §4.4 (Upload theo chunk), §5.6 (Dọn rác), §7, §7.1, §9 (Upload)
- **File:** `server/src/routes/attachments.ts`, `server/src/db.ts` (migration bảng `attachments`, phối hợp TV2), `server/test/attachments.test.ts` (mới)

**Việc**
- `GET .../status` → `{ received: number[] }`; `PUT .../chunks/:i` (`express.raw`, ≤ 256 KB, lưu `uploads/<projectId>/<id>/<i>.part`, đã có thì 200 không ghi); `POST .../complete` (thiếu → `409 missing_chunks` + `details`; ghép, SHA-256 sai → `422 checksum_mismatch`; magic bytes không phải JPEG/PNG/WebP → `415`; > 10 MB → `413`); `GET .../:id` trả file.
- Phạm vi: ảnh gắn `recordId`; surveyor chỉ với phiếu của mình; dự án khác → 404.
- Dọn chunk tạm > 7 ngày (khi khởi động + mỗi 24 giờ).

**Xong khi:** integration: upload đủ, upload lại chunk, thiếu chunk, sai hash, sai MIME, dự án khác.

**Review kỹ:** đường dẫn file ghép từ id do server kiểm tra (UUID), không có path traversal.

---

## TV3-06 · Hàng đợi upload ảnh (client)

- **Trạng thái:** —
- **Tuần:** 4 · **Phụ thuộc:** TV3-03, TV3-05, TV2-06
- **Spec:** design §5.6
- **File:** `client/src/sync/attachments.ts` (mới), `client/src/sync/engine.ts` (điểm gọi đã chừa ở TV2-06; TV2 duyệt), `client/src/sync/displayState.ts` + `.test.ts` (mới), `client/src/pages/HomePage.tsx`

**Việc**
- `uploadPendingAttachments(projectDb)`: chỉ ảnh của phiếu `baseVersion > 0`; mỗi lần một ảnh; `status` → gửi chunk thiếu → `complete` (SHA-256 bằng `crypto.subtle`); lỗi tạm thời dùng `nextRetryDelay`; lỗi `413/415/422 lần 2` → `failed`.
- `displayState(record, attachments)` thuần: "Đã đồng bộ" / "Đang tải ảnh (n)" / "Lỗi ảnh" / nhãn theo `syncState`. Unit test đủ các nhánh.
- Nút "Thử lại" / "Bỏ ảnh này" cho ảnh lỗi.

**Xong khi:** E2E **O3** (TV3-10) chạy được; phiếu chỉ "Đã đồng bộ" khi ảnh xong.

---

## TV3-07 · Màn hình conflict đầy đủ + chỉ đọc

- **Trạng thái:** —
- **Tuần:** 5 · **Phụ thuộc:** TV2-10
- **Spec:** design §4.5; ADR 0001 quy tắc 7; UI màn hình 3 (thẻ mỗi trường, không dùng bảng 4 cột trên điện thoại)
- **File:** `client/src/pages/ConflictPage.tsx`, `client/src/pages/FillPage.tsx` (làm cùng TV1), `client/e2e/conflict.spec.ts`

**Việc**
- Nhãn trường từ form đúng `formVersion` thay cho id; mỗi trường xung đột là một thẻ (Trước đó / Của bạn / Trên máy chủ); multiselect/photo thêm "Gộp cả hai".
- Mục "Đã gộp tự động (n trường)" thu gọn, mở ra thấy trường nào lấy từ đâu.
- Câu giải thích: người sửa, thời điểm (giờ server), số trường tự gộp.
- `FillPage`: phiếu `conflict` → chỉ đọc + banner "Phiếu này cần xử lý xung đột trước → [Xử lý]".
- Bộ lọc "Cần xử lý" và số đếm trên trang chủ.
- Giữ `data-testid="conflict-table"` cho vùng danh sách thẻ (hoặc sửa test cùng PR).

**Xong khi:** E2E **C2** sửa theo UI mới vẫn xanh; **C7**: mở phiếu đang conflict → không có nút Lưu, có banner; không tạo op.

---

## TV3-08 · Xoá vs sửa

- **Trạng thái:** —
- **Tuần:** 6 · **Phụ thuộc:** TV3-07
- **Spec:** design §4.5 (Xoá vs sửa); ADR 0001 quy tắc 6, 7 (Không chọn hộ)
- **File:** `client/src/pages/ConflictPage.tsx`, `client/src/components/DeleteConflictDialog.tsx` (mới), `client/e2e/delete-conflict.spec.ts` (mới)

**Việc**
- `recordLevel !== 'none'` → hộp thoại hai lựa chọn (đúng câu chữ trong design §4.5); nút Áp dụng khoá tới khi chọn.
- Kết quả truyền đúng `deleted` vào `resolveConflict` (sửa dòng `record.deleted && conflict.server.deleted` hiện tại).

**Xong khi:** E2E **C4** (máy xoá, server sửa: chọn "Giữ phiếu" → server có phiếu chưa xoá; chọn "Vẫn xoá" → `deleted: true`), **C5** (ngược lại).

---

## TV3-09 · Export CSV/JSON

- **Trạng thái:** —
- **Tuần:** 7 · **Phụ thuộc:** TV2-03
- **Spec:** design §4.6
- **File:** `server/src/lib/csv.ts` (mới), `server/test/csv.test.ts` (mới), `server/src/routes/export.ts`, `server/test/export.test.ts` (mới), nút Xuất trong trang form (phối hợp TV1)

**Việc**
- `csv.ts` thuần: escape RFC 4180, chống CSV injection (`= + - @` → tiền tố `'`), BOM.
- Route `P/export/:formId?format=csv|json&includeDeleted=` (supervisor): cột theo design §4.6, gộp nhiều phiên bản form, gps tách 3 cột, photo là URL từ `PUBLIC_BASE_URL`.

**Xong khi:** unit test escape đủ ca; integration: phiếu v1 + v2 cùng file, không lẫn dự án khác, surveyor → 403. Mở file bằng Excel thật một lần, chụp màn hình vào PR.

---

## TV3-10 · E2E O3, R4

- **Trạng thái:** —
- **Tuần:** 7 · **Phụ thuộc:** TV3-06
- **File:** `client/e2e/photo.spec.ts`

**Ca**
- **O3:** offline tạo phiếu có 2 ảnh → online → server có đủ 2 file, SHA-256 khớp, nhãn "Đã đồng bộ" chỉ sau khi ảnh xong.
- **R4:** fault mới cắt kết nối ở chunk thứ 2 → retry tiếp từ chunk thiếu (server nhận mỗi chunk một lần ghi).

---

## TV3-11 · Báo cáo kiểm thử

- **Trạng thái:** —
- **Tuần:** 8
- **File:** `docs/test-report.md` (mới)

**Việc:** ma trận design §10.1 + ADR 0002 T1–T10 với trạng thái cuối, số liệu CI, kết quả thử trên điện thoại thật (máy, trình duyệt), lỗi đã biết, kết quả `docs/perf.md`.
