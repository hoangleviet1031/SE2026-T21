# TV2 – Đồng bộ, server, multi-tenancy

Sở hữu: `client/src/sync/`, `client/src/db/`, `shared/`, `server/src/routes/records.ts`, `server/src/db.ts`, `server/src/auth.ts`, `server/src/repo/`, `docs/adr/`. Xem [team-plan](../team-plan.md#thành-viên-2-đồng-bộ-và-server-giữ-adr).

Phần lớn ticket của TV2 là **Lõi**: viết test trước, hai người duyệt. Cách làm: [vibe-coding.md §2](../vibe-coding.md#2-quy-trình-cho-một-ticket).

---

## TV2-01 · Migration + schema multi-tenancy · **Lõi** · **Người làm** (thiết kế)

- **Trạng thái:** ✅ PR #8 (chung với TV2-02, TV2-03, TV3-02)
- **Tuần:** 1–2 · **Phụ thuộc:** không
- **Spec:** design §6.1, §12 (Migration CSDL server); ADR 0002 §1–2
- **File:** `server/src/db.ts`, `server/test/db.test.ts` (mới)

**Việc**
- **Người viết trước** (trong mô tả PR): danh sách bảng, cột, khoá, index cuối cùng, dựa trên design §6.1.
- Cơ chế migration theo `PRAGMA user_version`: mảng `migrations: ((db) => void)[]`, chạy các bước có chỉ số ≥ `user_version` trong một transaction, cập nhật `user_version`.
- Migration 1 = schema hiện tại; migration 2 = `projects`, `users`, `memberships`, cột `project_id` (và `created_by`, `request_hash`, ...), index mới. Khung chưa có dữ liệu thật nên migration 2 được phép tạo lại bảng.
- `seed(db)` cũ đổi thành seed dự án `demo-yte` có form mẫu (TV3-02 làm `seed:demo` đầy đủ).

**Xong khi:** `openDb` chạy trên DB rỗng và trên DB ở `user_version = 1` đều ra cùng schema; test kiểm tra danh sách cột bằng `PRAGMA table_info`.

**Review kỹ:** migration chạy trong transaction; lỗi giữa chừng không để DB ở trạng thái nửa vời.

---

## TV2-02 · Xác thực, `requireMember`, lớp `ctx` · **Lõi**

- **Trạng thái:** ✅ PR #8 (chung với TV2-01, TV2-03, TV3-02)
- ⚠ **ADR 0003:** `requireAuth` tra `users.token_hash` là **bản cũ, vẫn đang chạy**; TV2-14 đổi sang bảng `sessions` và thêm vai trò `owner` vào `requireMember`. Nội dung dưới đây giữ nguyên như lúc làm.
- **Tuần:** 2 · **Phụ thuộc:** TV2-01
- **Spec:** design §9, §7.1 (`401`, `403 not_member`, `403 forbidden`); ADR 0002 §2–3
- **File:** `server/src/auth.ts` (mới), `server/src/repo/` (mới: `records.ts`, `forms.ts`, `memberships.ts`), `server/src/app.ts`, `server/test/auth.test.ts` (mới)

**Việc**
- `hashToken(token)` (SHA-256 hex). Middleware `requireAuth`: đọc `Authorization: Bearer`, tra `users.token_hash`, bỏ qua `disabled`, gắn `req.user`. Sai → `401 unauthorized`.
- `requireMember(minRole: 'surveyor' | 'supervisor')`: tra `memberships` theo `req.params.projectId` và `req.user.id`, dự án không `archived`; gắn `req.ctx = { userId, projectId, role }`. Không là thành viên → `403 not_member`; thiếu vai trò → `403 forbidden`.
- Khai báo kiểu `req.ctx` bằng declaration merging cho Express.
- Lớp `repo/*`: mọi hàm nhận `ctx` làm tham số đầu, tự thêm `project_id = ?` và phạm vi `own`/`all`. Route không gọi `db.prepare` trực tiếp cho bảng dự án.

**Xong khi**
- Test **A1** (không token → 401), token sai → 401, user `disabled` → 401, không là thành viên → 403 `not_member`, sai vai trò → 403 `forbidden`.
- Test cho từng hàm repo: không bao giờ trả dòng của dự án khác.

**Review kỹ:** không có đường nào để `projectId` đến từ body/query; so khớp token dùng hash, không log token.

---

## TV2-03 · Route theo dự án + phạm vi pull · **Lõi**

- **Trạng thái:** ✅ PR #8 (chung với TV2-01, TV2-02; TV3-02 làm phần fixture/helper)
- **Tuần:** 2 · **Phụ thuộc:** TV2-02 · **Làm cùng:** TV3-02 (**một PR**)
- **Spec:** design §5.5, §7 (bảng "Theo dự án", PUT records); ADR 0001 quy tắc 2, 10; ADR 0002 §3
- **File:** `server/src/app.ts`, `server/src/routes/records.ts`, `server/src/routes/forms.ts` (chỉ GET), `shared/src/types.ts`, `client/src/sync/api.ts`, `client/src/sync/engine.ts`, `client/src/sync/outbox.ts`

**Việc**
- Gắn records, forms dưới `/api/projects/:projectId` với `requireMember('surveyor')`.
- PUT: `updatedBy`/`created_by` từ `ctx` (bỏ khỏi `PushRecordRequest`); id đã tồn tại ở dự án khác → `404`; surveyor sửa phiếu không phải của mình → `404`.
- Pull: lọc theo `project_id` và phạm vi; response thêm `scope: 'own' | 'all'` (`PullResponse` trong shared).
- History: cùng quy tắc phạm vi.
- Client: `api.ts` nhận `projectId` và token (tạm lấy dự án mặc định `demo-yte` và token từ `auth.ts` của TV1-02 cho tới TV2-05). Bỏ `getSurveyorName`.

**Xong khi**
- Integration hiện có chạy lại xanh với đường dẫn mới (TV3-02).
- Test **A2** (surveyor chỉ pull phiếu mình), PUT phiếu của người khác (surveyor) → 404, PUT id thuộc dự án khác → 404.
- 3 E2E hiện có xanh (sau khi TV3-02 thêm đăng nhập vào helper).

**Review kỹ:** đây là PR lớn nhất. Đọc từng câu SQL. Trước khi merge, không merge PR nào khác chạm `server/src/routes/`.

---

## TV2-04 · `/api/me`, `/api/admin/projects` · **Lõi**

- **Trạng thái:** ✅ PR #9
- ⚠ **ADR 0003:** `POST /admin/projects`, `PATCH` đổi tên và `PUT /admin/projects/:id/members/:userId` là **bản cũ, vẫn đang chạy**; TV2-15 bỏ chúng (tổ chức chỉ tạo khi admin duyệt yêu cầu, admin chỉ định Owner bằng tên đăng nhập). `GET /me` giữ, TV2-14 thêm `username`. Nội dung dưới đây giữ nguyên như lúc làm.
- **Tuần:** 3 · **Phụ thuộc:** TV2-03
- **Spec:** design §7 (bảng "Không theo dự án"); ADR 0002 §2
- **File:** `server/src/routes/me.ts`, `server/src/routes/admin.ts` (mới), `shared/src/types.ts` (`MeResponse`, `ProjectSummary`, `Role`), `server/test/admin.test.ts` (mới)

**Việc**
- `GET /api/me` → `{ user: { id, name, isAdmin }, projects: [{ id, name, role }] }` (theo design §7: dự án lưu trữ không có trong `/me`, nên không cần `archived`; `archived` chỉ có ở `AdminProject`).
- `/api/admin/projects` (GET, POST), `PATCH /api/admin/projects/:projectId` (tên, `archived`), `PUT /api/admin/projects/:projectId/members/:userId` (chỉ để chỉ định supervisor). Chỉ `isAdmin`.

**Xong khi:** test **T4** (admin không là thành viên đọc phiếu → 403 `not_member`), người thường gọi `/admin/*` → 403 `forbidden`, `/me` không chứa dự án đã bị rút.

---

## TV2-05 · CSDL account + CSDL theo dự án, `api.ts` · **Lõi**

- **Trạng thái:** ✅ PR #10. Dự án đang chọn tạm mặc định `demo-yte` tới TV2-06/TV1-06
- **Tuần:** 3 · **Phụ thuộc:** TV2-04
- **Spec:** design §4.2; ADR 0002 §4
- **File:** `client/src/db/accountDb.ts` (mới), `client/src/db/projectDb.ts` (đổi từ `db.ts`), `client/src/db/current.ts` (mới), `client/src/auth.ts` (chuyển sang accountDb, giữ chữ ký), `client/src/sync/api.ts`, mọi chỗ import `db`

**Việc**
- `AccountDb` (`field-survey-account`): `account`, `projects`.
- `ProjectDb` = schema hiện tại + `SyncState 'draft'` + `attachments.nextAttemptAt` + `validationErrors`, gộp thành **một** lần định nghĩa version (thống nhất với TV1-05, TV3-06).
- `openProjectDb(projectId)` (cache theo id), `useCurrentProjectDb()` hook, `setCurrentProject(id)`.
- Xoá CSDL `field-survey` cũ khi khởi động (design §4.2).
- `api.ts`: mọi hàm nhận `projectId`; tự gắn `Authorization`; `401` → ném `AuthError`.

**Xong khi:** typecheck xanh, mọi E2E hiện có xanh, mở DevTools thấy `field-survey-account` và `field-survey-p-demo-yte`.

**Review kỹ:** không còn import `db` toàn cục ở UI; component lấy CSDL qua hook.

---

## TV2-06 · Sync nhiều dự án + Web Locks · **Lõi**

- **Trạng thái:** ✅ PR #13
- **Tuần:** 3 · **Phụ thuộc:** TV2-05
- **Spec:** design §5.3 (Nhiều dự án, Nhiều tab); ADR 0001 (Nhiều tab)
- **File:** `client/src/sync/engine.ts`, `client/e2e/tabs.spec.ts` (mới)

**Việc**
- `runSync`: lấy Web Lock `field-survey-sync` (`ifAvailable: true`); gọi `/me`, cập nhật `AccountDb.projects`; với mỗi dự án `active` (đang chọn trước): push → (chỗ gọi upload ảnh cho TV3-06, để hàm rỗng) → pull → forms; ghi số đếm cần xử lý/chưa đồng bộ vào `AccountDb`.
- Các hàm `pushAll`, `pullAll`, `onConflict`, ... nhận `ProjectDb` làm tham số thay cho biến toàn cục.
- Offline: không gọi `/me`, dùng danh sách đã lưu.

**Xong khi:** E2E **O6**: hai tab cùng mở, lưu phiếu ở tab 1 → server nhận đúng một PUT cho op đó (đếm qua log server hoặc route test).

---

## TV2-07 · Cursor theo scope + thay đổi thành viên · **Lõi**

- **Trạng thái:** ✅ PR #14. T7 mới kiểm phần dữ liệu, banner do TV1-06
- **Tuần:** 4 · **Phụ thuộc:** TV2-06
- **Spec:** ADR 0001 quy tắc 10; ADR 0002 §5–6
- **File:** `client/src/sync/engine.ts`, `client/src/sync/membership.ts` (mới), `client/e2e/membership.spec.ts` (mới)

**Việc**
- `meta.pull = { cursor, scope }`; response `scope` khác → cursor 0.
- `membership.ts`: so sánh danh sách `/me` mới với `AccountDb.projects`:
  - dự án mới → tạo CSDL, cursor 0;
  - mất dự án hoặc nhận `403 not_member` → `status: 'removed'`; `hasUnsentData(projectDb)` (outbox, ảnh chưa `done`, `draft`, `conflict`) = false → `Dexie.delete`; = true → giữ;
  - hạ `supervisor` → `surveyor` → xử lý như rút rồi thêm lại.
- `exportUnsentJson(projectId)` và `forgetProject(projectId)` cho banner của TV1-06.

**Xong khi:** E2E **T7**, **T8**, **T9** (ADR 0002).

**Review kỹ:** `hasUnsentData` đủ cả 4 nguồn; không có đường nào gọi `Dexie.delete` khi còn dữ liệu chưa gửi.

---

## TV2-08 · Idempotency hash, dọn key, fault `drop` sau khi ghi · **Lõi**

- **Trạng thái:** ✅ PR #15
- **Tuần:** 4 · **Phụ thuộc:** TV2-03
- **Spec:** ADR 0001 quy tắc 3; design §10.1 R2, R3, R6
- **File:** `server/src/routes/records.ts`, `server/src/routes/faults.ts` (phối hợp TV3), `server/src/index.ts` (job dọn), `server/test/records.test.ts`, `client/e2e/retry.spec.ts` (mới)

**Việc**
- Lưu `project_id`, `record_id`, `request_hash` (SHA-256 của JSON chuẩn hoá: khoá sắp xếp, gồm `projectId`, `recordId`, thân). Key trùng mà hash khác → `422 idempotency_key_reused`.
- Dọn key > 30 ngày khi khởi động và mỗi 24 giờ.
- Fault `drop`: cho request đi qua handler, ghi xong mới huỷ socket (vd. `res.on('finish')` không dùng được; bọc `res.json` để huỷ socket thay vì gửi).

**Xong khi:** integration **R6**; E2E **R2** (timeout 15 s, client huỷ sau 10 s, retry, một bản ghi) và **R3** (server đã ghi, socket bị cắt, retry nhận `Idempotent-Replayed`, một bản ghi, version 1).

---

## TV2-09 · Op `failed`, thử lại, cảnh báo tồn lâu

- **Trạng thái:** ✅ PR #16
- **Tuần:** 5 · **Phụ thuộc:** TV2-06
- **Spec:** design §5.1 (`error → pending`), §5.2 (Op tồn lâu), §8
- **File:** `client/src/sync/engine.ts`, `client/src/sync/outbox.ts`, `client/src/pages/HomePage.tsx` (phối hợp TV1), `client/e2e/errors.spec.ts` (mới)

**Việc**
- `retryFailed(recordId)`: op `failed` → `queued`; phiếu → `pending`. *Đã chốt khi làm:* giữ `attempts` (4xx tính một lần gửi) thay vì đặt về 0, để sửa phiếu sau đó không gộp vào op đã gửi (bất biến 3).
- Sửa phiếu `error` → *đã chốt khi làm:* bỏ op `failed`, gửi dữ liệu mới trong op mới với `opId` mới, thay vì sửa `data` của op cũ (bất biến 3). Kết quả với server như nhau.
- Nút "Thử lại", "Xuất JSON phiếu này" trên phiếu lỗi.
- Cảnh báo `attempts ≥ 5` và phiếu chưa lên server > 24 giờ.

**Xong khi:** E2E **R5**: server trả 400 (fault mode mới `'400'` hoặc thân sai) → phiếu "Lỗi", không retry; bấm Thử lại sau khi tắt fault → "Đã đồng bộ".

---

## TV2-10 · Engine: khoá khi conflict, 409 lặp, bỏ qua nháp · **Lõi**

- **Trạng thái:** ✅ PR #34. Thêm (được duyệt khi làm): op tự gộp sau 409 gửi lại ngay trong cùng vòng (C1, C8 cần); `FillPage` báo khi bị từ chối lưu. `pullAll` bỏ qua nháp đã có từ TV1-05, ticket này thêm E2E
- **Tuần:** 5 · **Phụ thuộc:** TV1-05, TV2-06
- **Spec:** ADR 0001 quy tắc 7, 8; design §4.5, §10.1 C1, C6, C8
- **File:** `client/src/sync/engine.ts`, `client/src/sync/outbox.ts`, `client/src/db/projectDb.ts`, `client/e2e/conflict.spec.ts`

**Việc**
- `saveRecordLocally` từ chối khi phiếu `conflict` (ném lỗi rõ ràng; UI của TV3-07 không cho gọi tới). Bỏ trạng thái op `blocked`.
- `resolveConflict`: giữ nguyên hành vi, kiểm tra lại 409 lần hai đi đúng quy tắc 5 với base = `conflict.server`.
- `pullAll`: bỏ qua phiếu `draft`.

**Xong khi:** E2E **C1** (khác trường tự gộp, không hiện conflict), **C6** (sửa 3 lần offline → server version tăng 1), **C8** (trong lúc đang ở màn hình conflict, server đổi tiếp trường khác → tự gộp; cùng trường → conflict mới).

---

## TV2-11 · Hiệu năng pull

- **Trạng thái:** —
- **Tuần:** 6 · **Phụ thuộc:** TV2-07
- **Spec:** design §11.2
- **File:** `server/src/cli/seedPerf.ts` (mới), `client/e2e/perf/pull.spec.ts` (mới), `docs/perf.md` (mới)

**Việc:** seed 5.000 phiếu trong một dự án; đo pull lần đầu (supervisor), danh sách 2.000 phiếu, đổi dự án; kiểm tra `EXPLAIN QUERY PLAN` dùng index `(project_id, seq)`. Ghi số đo vào `docs/perf.md`.

**Xong khi:** số đo đạt chỉ tiêu §11.2, hoặc có ghi rõ chỗ chưa đạt và lý do.

---

## TV2-12 · Sửa lỗi, tài liệu kỹ thuật

- **Trạng thái:** —
- **Tuần:** 7–8
- **File:** `docs/sync-internals.md` (mới), `docs/adr/*`

**Việc:** rà ADR khớp code (sửa ADR nếu có quyết định mới, viết ADR 0003 nếu đổi hướng); tài liệu kỹ thuật: luồng một op từ lúc lưu tới lúc lên server, kèm sơ đồ; cách thêm route theo dự án an toàn.

---

## TV2-13 · Xoá phiếu: logic phía client và đồng bộ · **Lõi**

- **Trạng thái:** ✅ PR #35. Phần ảnh làm được luôn vì bảng `attachments` phía client đã có (TV3-03); "ngừng upload" ghi thành yêu cầu ở TV3-06. Nút "Xoá phiếu" hiện có hỏi bằng `window.confirm` rồi gọi `deleteRecordLocally` (đã duyệt; bất biến 1); pull bỏ qua tombstone của phiếu máy không có
- **Tuần:** 5 · **Phụ thuộc:** TV2-05; phần ảnh cần bảng `attachments` phía client (TV3-06), chưa có thì để lại phần ảnh và ghi rõ trong PR
- **Spec:** design §5.7, §5.2 (gộp op); ADR 0001 quy tắc 6; CLAUDE.md bất biến 1, 2, 3
- **File:** `client/src/sync/outbox.ts` (`deleteRecordLocally`), `client/src/sync/engine.ts`, `client/e2e/delete.spec.ts` (mới)

**Việc**
- `deleteRecordLocally(recordId)` cạnh `saveRecordLocally`, một transaction Dexie gồm `records`, `outbox`, `attachments`. Từ chối (ném lỗi rõ ràng) khi phiếu đang `conflict`.
- Chưa thể tới server (`baseVersion = 0` và mọi op có `attempts = 0`): xoá hẳn phiếu, mọi op, mọi ảnh; không gửi gì.
- Có thể đã tới server: `deleted = true`, op xoá theo quy tắc gộp §5.2 (op chưa gửi thì sửa op đó, op đã gửi thì thêm op mới). `data` của op = dữ liệu hợp lệ mới nhất (`baseData` nếu phiếu là nháp).
- Engine: op xoá được server xác nhận thì xoá phiếu và blob ảnh khỏi máy; ngừng upload ảnh của phiếu `deleted`. `409` khi xoá đi theo luồng conflict có sẵn (C4, TV3-08).
- Xuất hàm cho TV1-13 dùng; đường xoá cũ `saveRecordLocally({ deleted: true })` trong `FillPage` do TV1-13 thay.

**Xong khi:** E2E **O7**, **O8** (design §10.1).

**Review kỹ (TV1 duyệt):** điều kiện "chưa thể tới server": nhầm sang xoá hẳn khi server đã có bản ghi sẽ để phiếu mồ côi trên server; không sửa `data` của op có `attempts > 0`; transaction bao đủ ba bảng; không xoá gì ngoài phiếu đang xoá.

---

# Theo ADR 0003 (bản mới)

Các ticket dưới đây làm theo [ADR 0003](../adr/0003-accounts-and-owner-role.md) và các mục 🆕 trong design.md. Code hiện tại (TV2-02, TV2-04) vẫn chạy theo bản cũ cho tới khi các ticket này xong; khi xong thì xoá đoạn 🕘 tương ứng trong design.md cùng PR.

---

## TV2-14 · Migration 3, tài khoản + phiên, vai trò `owner` (server) · **Lõi**

- **Trạng thái:** ✅ PR #36 (chung với TV3-12) · thành **migration 4** vì số 3 đã là `attachments` (TV3-05). MG1/MG2 dựng DB ở `user_version = 3` ("giữ 2" trong ticket đọc là "giữ phiên bản trước"). Cầu nối tới TV3-12: `seed:demo`, `user:add`, `user:rotate-token` ghi token thành phiên
- **Tuần:** 3 · **Phụ thuộc:** không · **Làm cùng:** TV3-12 (**một PR**, vì đổi đăng nhập làm vỡ mọi test đang dùng token)
- **Spec:** ADR 0003 §1, §2, §5; design §6.1 (migration 3), §6.2, §7 (`/auth/*`), §7.1, §9
- **File:** `docs/deploy.md` (bước nâng cấp), `server/src/db.ts`, `server/src/auth.ts`, `server/src/password.ts` (mới, `scrypt`), `server/src/rateLimit.ts` (mới), `server/src/routes/auth.ts` (mới), `server/src/routes/me.ts`, `server/src/repo/memberships.ts`, `server/src/repo/records.ts` (`scopeOf` cho `owner`), `server/src/routes/testMemberships.ts` (nhận `owner`), `shared/src/types.ts`, `server/test/db.test.ts`, `server/test/auth.test.ts`, `server/test/accounts.test.ts` (mới)

**Việc**
- Migration 3 theo design §6.1: `users.username`, `users.password_hash`, bảng `sessions` (chép `users.token_hash` cũ thành phiên), `projects.public`, **tạo lại `memberships`** (chép dữ liệu, `CHECK` có `owner`, thêm `added_by`). Bảng `project_requests` để TV2-15.
- **Dữ liệu cũ (ADR 0003 §5):** bước đầu của migration 3 kiểm tra tài khoản `is_admin = 1` có membership; có thì ném lỗi liệt kê `username`/`userId`, `projectId`, vai trò → transaction rollback, `user_version` giữ 2, server không khởi động. Không tự chọn Owner cho tổ chức cũ; `requireMember` và luật `last_owner` phải chạy đúng với tổ chức chưa có Owner.
- `password.ts`: `hashPassword`, `verifyPassword` bằng `scrypt` + `timingSafeEqual`; hàm thuần, có unit test.
- `POST /api/auth/register`, `/login`, `/logout` (design §7). Giới hạn tần suất trong bộ nhớ: 10 lần sai/15 phút theo tên hoặc IP, 5 đăng ký/giờ/IP.
- `requireAuth` tra `sessions` (không còn `users.token_hash`), cập nhật `last_seen_at`; `disabled` → `401`.
- `Role` thêm `owner`; `ROLE_RANK` `surveyor < supervisor < owner`; `scopeOf(owner) = 'all'`; `/me` trả `username`.

**Xong khi**
- Test **U1–U6** (design §10.1).
- `db.test.ts`: **MG1** (admin là thành viên → lỗi, rollback, dữ liệu không đổi) và **MG2** (lên 3 không mất membership nào; vai trò cũ giữ nguyên; token cũ vẫn đăng nhập được qua `sessions`; supervisor dùng được `P/...` khi chưa có Owner).
- `docs/deploy.md`: thêm bước kiểm tra trước khi nâng cấp staging (truy vấn admin có membership) và chỉ định Owner sau khi nâng cấp.
- Test cũ của `auth.test.ts`, `records.test.ts` … vẫn xanh sau khi TV3-12 đổi fixture (không nới assertion).

**Review kỹ:** migration tạo lại `memberships` trong transaction, đếm số dòng trước/sau; không log mật khẩu hay token; so sánh hằng thời gian; sai tên và sai mật khẩu trả cùng lỗi.

---

## TV2-15 · Yêu cầu mở tổ chức, danh bạ công khai, API admin mới (server) · **Lõi**

- **Trạng thái:** ✅ PR #49. Thêm (được duyệt khi làm): duyệt kiểm lại giới hạn 3 tổ chức (vượt thì yêu cầu vẫn chờ); `?status=` mặc định `pending`; route kiểm thử `PUT /api/__test/projects/:projectId` thay `POST /admin/projects` cho 5 file E2E; vế D1 của D2
- **Tuần:** 3–4 · **Phụ thuộc:** TV2-14
- **Spec:** ADR 0003 §3, §4, §6; design §6.1 (`project_requests`), §7, §7.1
- **File:** `server/src/db.ts` (bảng `project_requests` là migration 5: số 3 là `attachments` của TV3-05, số 4 là tài khoản của TV2-14), `server/src/repo/projectRequests.ts` (mới), `server/src/repo/projects.ts`, `server/src/routes/projectRequests.ts` (mới), `server/src/routes/directory.ts` (mới), `server/src/routes/admin.ts`, `server/test/projectRequests.test.ts` (mới), `server/test/admin.test.ts`

**Việc**
- `/api/project-requests` (GET, POST, DELETE) và `/api/admin/project-requests` (GET, POST duyệt/từ chối). Duyệt: **một transaction** tạo dự án (`id` = `p-` + 8 ký tự), membership `owner` cho người gửi (`added_by` = admin), cập nhật yêu cầu. Admin không có membership.
- Giới hạn: 1 yêu cầu đang chờ, Owner của tối đa 3 tổ chức chưa lưu trữ → `409 project_limit_reached`.
- `GET /api/directory`: chỉ `id`, `name` của tổ chức `public = 1`, chưa lưu trữ, mình chưa thuộc.
- `/api/admin/projects`: GET thêm `ownerUsernames`, `memberCount`; `PATCH` chỉ còn `archived`; thêm `PUT …/owners/:username`; **bỏ** `POST /admin/projects` và `PUT …/members/:userId` (sửa test cũ trong `admin.test.ts` cho đúng spec mới, ghi lý do trong PR).

**Xong khi:** test **Q1–Q7**, **D1**, **A8**; T4 vẫn xanh.

**Review kỹ:** duyệt yêu cầu không bao giờ thêm admin vào `memberships`; route `/directory`, `/project-requests` không chạm form/phiếu; `projectId` mới do server sinh, không đọc từ thân.

---

## TV2-16 · Client: đăng nhập bằng phiên, vai trò `owner`, chặn tài khoản admin · **Lõi**

- **Trạng thái:** ✅ `feat/tv2-16-client-session`. Thêm (được duyệt khi làm, phương án A): màn hình nhập mã hiện có đi qua `signInWithToken` (kiểm mã bằng `/me` trước khi lưu) để Q11 và E2E đổi tài khoản chạy được trước TV1-14; điều phối đăng nhập ở `client/src/signIn.ts` (mới, tránh import vòng `auth.ts` ↔ `api.ts`); phiên bị từ chối được huỷ trên server; `logout.ts` gọi `/auth/logout`. Nút "Xuất JSON" ở thông báo từ chối để TV1-14
- **Tuần:** 4 · **Phụ thuộc:** TV2-14
- **Spec:** ADR 0003 §1, §8; design §4.2, §4.7, §4.9
- **File:** `client/src/sync/api.ts` (`register`, `login`, `logout`), `client/src/auth.ts`, `client/src/db/accountDb.ts` (`username`), `client/src/sync/accountSync.ts` (vai trò `owner`), `client/src/sync/engine.ts`, `client/src/sync/*.test.ts`

**Việc**
- `api.ts`: `register`, `login` trả `{ token, user }`; `logout` gọi `/auth/logout` rồi xoá token. Giữ chữ ký `getToken/setToken/clearToken` để màn hình của TV1-14 dùng.
- Đăng nhập bằng tài khoản `isAdmin`: không lưu token, báo lỗi `AdminAccountError` để màn hình hiện "Tài khoản quản trị dùng trang /admin"; không tạo CSDL nào.
- `needsRescope` và phạm vi pull hiểu `owner` (như `supervisor`); unit test.
- Logic "đăng nhập tài khoản khác khi còn dữ liệu chưa gửi" (design §4.7) chạy sau `login`.

**Xong khi:** unit test cho `owner`; E2E **Q11**; mọi E2E hiện có xanh với helper mới của TV3-12.

**Review kỹ:** không có đường nào xoá CSDL dự án khi đăng nhập tài khoản khác mà còn dữ liệu chưa gửi (bất biến 1).

---

## TV2-17 · API quản lý tài khoản cho màn hình A3 · **Cắt được**

- **Trạng thái:** —
- **Tuần:** 6 · **Phụ thuộc:** TV2-15
- **Spec:** ADR 0003 §8 (A3); design §7
- **File:** `server/src/routes/admin.ts`, `server/src/repo/users.ts` (mới, dùng chung với CLI của TV3-12), `server/test/admin.test.ts`

**Việc:** `GET /api/admin/users?q=`, `POST /api/admin/users/:id/disable | reset-password | revoke-sessions`; cùng hành vi với CLI (dùng chung hàm trong `repo/users.ts`).

**Xong khi:** integration: admin làm được ba thao tác; người thường → `403`; mật khẩu tạm chỉ trả một lần, DB chỉ có hash.

---

# Chia thêm sau PR #59 (nhóm chốt 2026-10-22)

Việc chưa ai nhận, chia theo mức MoSCoW ở [design §1](../design.md#1-mục-tiêu-và-phạm-vi).

---

## TV2-18 · Danh sách phiếu: tìm kiếm, lọc theo người tạo, 2.000 phiếu · **Cắt được**

- **Trạng thái:** —
- **Mức:** Could (lọc theo trạng thái là Must, đã có ở TV3-07)
- **Tuần:** 5–6 (trễ thì cắt, không làm qua đóng băng giữa tuần 7) · **Phụ thuộc:** TV1-17 (`createdBy`, `createdByName`), TV3-07 (`recordFilter.ts`)
- **Spec:** design §4.8, §11.2; [tech-debt](../tech-debt.md) N6
- **File:** `client/src/recordFilter.ts` (+ unit), `client/src/pages/HomePage.tsx`, E2E mới

**Việc**
- Ô tìm kiếm theo tiêu đề phiếu (cách lấy tiêu đề như §4.8), lọc trong bộ nhớ cùng bộ lọc trạng thái.
- Với `supervisor`: lọc theo người tạo (`createdBy`), hiện tên người tạo trên mỗi dòng.
- Kiểm danh sách 2.000 phiếu cuộn mượt (§4.8 "Hiệu năng"); không đạt thì chỉ render phần đang thấy, tự viết, không thêm thư viện.

**Xong khi:** unit cho hàm lọc (tìm theo tiêu đề, theo người tạo, kết hợp với trạng thái); E2E supervisor lọc theo người tạo và tìm theo tiêu đề; ghi số đo 2.000 phiếu (cùng chỗ với TV2-11). N6 chuyển xuống "Đã trả".

---

## TV2-19 · Thân JSON hỏng trả `invalid_body`; log request

- **Trạng thái:** —
- **Mức:** Should (`invalid_body`); Could (log request, **cắt được**)
- **Tuần:** 4–5 (`invalid_body`), 5–6 (log, trễ thì cắt) · **Phụ thuộc:** không
- **Spec:** design §7.1, §8, §12 (log và theo dõi); [tech-debt](../tech-debt.md) N1
- **File:** `server/src/app.ts`, `server/test/` (integration mới)

**Việc**
- Thân request không phải JSON hợp lệ: hiện `express.json` (`server/src/app.ts`) ném lỗi mà không có chỗ bắt, Express trả trang HTML. Thêm chỗ xử lý lỗi trả `400 { error: 'invalid_body' }` (mã đã có trong §7.1); lỗi khác giữ như hiện tại.
- Log request (Could): một dòng JSON mỗi request bằng middleware trong `app.ts` (method, đường dẫn, mã trả về, thời gian, `userId`), **không ghi token** hay thân request; không thêm thư viện (§12).

**Xong khi:** integration: gửi thân JSON hỏng tới một route có thân → `400 invalid_body` dạng JSON. Nếu làm log: test middleware không ghi header `Authorization`; `deploy.md` "Xem log" ghi cách đọc; N1 chuyển xuống "Đã trả".
