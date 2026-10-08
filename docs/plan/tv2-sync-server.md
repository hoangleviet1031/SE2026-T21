# TV2 – Đồng bộ, server, multi-tenancy

Sở hữu: `client/src/sync/`, `client/src/db/`, `shared/`, `server/src/routes/records.ts`, `server/src/db.ts`, `server/src/auth.ts`, `server/src/repo/`, `docs/adr/`. Xem [team-plan](../team-plan.md#thành-viên-2-đồng-bộ-và-server-giữ-adr).

Phần lớn ticket của TV2 là **Lõi**: viết test trước, hai người duyệt. Cách làm: [vibe-coding.md §2](../vibe-coding.md#2-quy-trình-cho-một-ticket).

---

## TV2-01 · Migration + schema multi-tenancy · **Lõi** · **Người làm** (thiết kế)

- **Trạng thái:** ✅ `feat/tv2-multi-tenancy-core` (PR: chưa mở; chung PR với TV2-02, TV2-03, TV3-02)
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

- **Trạng thái:** —
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

- **Trạng thái:** —
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

- **Trạng thái:** —
- **Tuần:** 3 · **Phụ thuộc:** TV2-03
- **Spec:** design §7 (bảng "Không theo dự án"); ADR 0002 §2
- **File:** `server/src/routes/me.ts`, `server/src/routes/admin.ts` (mới), `shared/src/types.ts` (`MeResponse`, `ProjectSummary`, `Role`), `server/test/admin.test.ts` (mới)

**Việc**
- `GET /api/me` → `{ user: { id, name, isAdmin }, projects: [{ id, name, role, archived }] }`.
- `/api/admin/projects` (GET, POST), `PATCH /api/admin/projects/:projectId` (tên, `archived`), `PUT /api/admin/projects/:projectId/members/:userId` (chỉ để chỉ định supervisor). Chỉ `isAdmin`.

**Xong khi:** test **T4** (admin không là thành viên đọc phiếu → 403 `not_member`), người thường gọi `/admin/*` → 403 `forbidden`, `/me` không chứa dự án đã bị rút.

---

## TV2-05 · CSDL account + CSDL theo dự án, `api.ts` · **Lõi**

- **Trạng thái:** —
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

- **Trạng thái:** —
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

- **Trạng thái:** —
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

- **Trạng thái:** —
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

- **Trạng thái:** —
- **Tuần:** 5 · **Phụ thuộc:** TV2-06
- **Spec:** design §5.1 (`error → pending`), §5.2 (Op tồn lâu), §8
- **File:** `client/src/sync/engine.ts`, `client/src/sync/outbox.ts`, `client/src/pages/HomePage.tsx` (phối hợp TV1), `client/e2e/errors.spec.ts` (mới)

**Việc**
- `retryFailed(recordId)`: op `failed` → `queued`, `attempts = 0`; phiếu → `pending`.
- Sửa phiếu `error` → thay `data` của op `failed` (op chưa từng được server chấp nhận nên được phép) và `queued`.
- Nút "Thử lại", "Xuất JSON phiếu này" trên phiếu lỗi.
- Cảnh báo `attempts ≥ 5` và phiếu chưa lên server > 24 giờ.

**Xong khi:** E2E **R5**: server trả 400 (fault mode mới `'400'` hoặc thân sai) → phiếu "Lỗi", không retry; bấm Thử lại sau khi tắt fault → "Đã đồng bộ".

---

## TV2-10 · Engine: khoá khi conflict, 409 lặp, bỏ qua nháp · **Lõi**

- **Trạng thái:** —
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
