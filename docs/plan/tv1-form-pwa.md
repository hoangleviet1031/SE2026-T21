# TV1 – Form, PWA, màn hình dự án, staging

Sở hữu: `client/src/components/`, `client/src/pages/` (trừ `ConflictPage.tsx`), `server/src/routes/forms.ts`, `server/src/routes/members.ts`, `client/vite.config.ts`, staging. Xem [team-plan](../team-plan.md#thành-viên-1-form-pwa-màn-hình-dự-án-và-môi-trường-demo).

Cách làm mỗi ticket: [vibe-coding.md §2](../vibe-coding.md#2-quy-trình-cho-một-ticket).

---

## TV1-01 · Staging HTTPS · **Người làm**

- **Trạng thái:** ✅ PR #12 – Dương, Hoàng (Android), Đại (iPhone) cài app, tắt mạng mở lại vẫn chạy
- **Tuần:** 1–2 · **Phụ thuộc:** không
- **Spec:** design §12
- **File:** `docs/deploy.md` (mới), `scripts/deploy.sh` hoặc `Caddyfile` (mới)

**Việc**
- Chọn một trong: VPS + Caddy (tự cấp chứng chỉ), hoặc máy nhóm + Cloudflare Tunnel. Ghi lý do chọn vào `docs/deploy.md`.
- Build client (`npm run build`), phục vụ `client/dist` và proxy `/api` tới server cùng origin.
- Chạy server với `DB_PATH` cố định, `NODE_ENV=production`, **không** đặt `ENABLE_TEST_ROUTES`.
- Viết các bước triển khai lại sau mỗi lần merge `main` (thủ công cũng được, một lệnh là tốt nhất).

**Xong khi**
- Cả 3 thành viên mở được URL HTTPS trên điện thoại Android thật, "Thêm vào màn hình chính", tắt mạng, mở lại app vẫn chạy.
- `docs/deploy.md` đủ để một bạn khác triển khai lại mà không cần hỏi.

**Review kỹ:** route `/api/__test/*` trả 404 trên staging.

---

## TV1-02 · Màn hình nhập mã đăng nhập

- **Trạng thái:** ✅ PR #6
- ⚠ **ADR 0003:** màn hình nhập mã (token) là **bản cũ, đã bỏ**: TV1-14 thay bằng Đăng nhập / Tạo tài khoản (tên + mật khẩu). Nội dung dưới đây giữ nguyên như lúc làm.
- **Tuần:** 2 · **Phụ thuộc:** không (dùng stub); nối thật sau TV2-05
- **Spec:** design §4.7 (Lần đầu mở app), §9
- **File:** `client/src/pages/LoginPage.tsx` (mới), `client/src/auth.ts` (mới, stub), `client/src/App.tsx`

**Việc**
- `auth.ts` xuất `getToken(): Promise<string | null>`, `setToken(token)`, `clearToken()`. Tạm lưu trong bảng `meta` của Dexie hiện có. TV2-05 sẽ chuyển sang `field-survey-account`, **giữ nguyên chữ ký hàm**.
- `App.tsx`: chưa có token thì chỉ hiện `LoginPage`.
- `LoginPage`: một ô nhập mã, nút "Tiếp tục", ghi chú "Nhận mã từ quản trị viên". Khi online, gọi `GET /api/me` để kiểm tra (trước TV2-04 thì bỏ qua bước này); `401` thì báo "Mã không đúng".
- Xoá ô "tên điều tra viên" nhập tay (`getSurveyorName` trong `outbox.ts` để TV2 bỏ ở TV2-03).

**Xong khi**
- Mở app lần đầu thấy màn hình nhập mã; nhập xong vào trang chủ; tải lại vẫn ở trang chủ.
- Offline lần đầu (chưa có mã): thông báo "Cần kết nối mạng để đăng nhập lần đầu".

**Test:** E2E nhỏ `e2e/login.spec.ts`. Sửa helper trong các spec hiện có để đặt token trước (phối hợp TV3-02).

---

## TV1-03 · Validate form + `POST P/forms`

- **Trạng thái:** ✅ PR #19 (`validateFormSchema` + unit test, `POST P/forms` + integration, A3 phần forms, A5 phần supervisor/surveyor; A5 phần Owner chờ TV2-14)
- **Tuần:** 2 (phần thuần) → 3 (route, sau TV2-03)
- **Phụ thuộc:** TV2-03 cho phần route
- **Spec:** design §4.1 (Validate ở server khi lưu form), §7, §7.1 `invalid_form`
- **File:** `shared/src/formValidation.ts` + `.test.ts` (mới), `shared/src/types.ts` (`hidden?: boolean`), `server/src/routes/forms.ts`, `server/test/forms.test.ts` (mới)

**Việc**
- Hàm thuần `validateFormSchema(next: FormSchema, prev?: FormSchema): string[]` trả danh sách lỗi tiếng Việt: id trường trùng / sai mẫu, select thiếu option, option trùng, so với `prev`: thiếu trường cũ, đổi `type`, bỏ option.
- `POST /api/projects/:projectId/forms` (supervisor): validate, `version = max + 1` (hoặc 1), lưu `created_by` từ `ctx`, trả form đã lưu. Lỗi → `400 { error: 'invalid_form', details: string[] }`.
- `GET` forms lọc theo `ctx.projectId` (TV2-03 đã chuyển đường dẫn; ticket này chỉ thêm POST).

**Xong khi**
- Unit test bao mọi luật trên (mỗi luật ít nhất một ca đúng, một ca sai).
- Integration: supervisor tạo v1, v2; surveyor gọi → `403 forbidden`; form của dự án A không hiện ở dự án B.

**Review kỹ:** `version` tính trong `tx` (hai request song song không cùng ra một version).

---

## TV1-04 · Form builder

- **Trạng thái:** ✅ PR #24 (🆕 hiện cho `owner` chờ TV2-16; Xuất/Nhập form ở TV1-10)
- **Tuần:** 3 · **Phụ thuộc:** TV1-03
- **Spec:** design §4.1 (Builder UI, Tiêu chí chấp nhận), [ui.md màn hình 5](../ui.md#5-form-builder)
- **File:** `client/src/pages/BuilderPage.tsx` (mới), `client/src/components/FieldEditor.tsx` (mới), `client/src/App.tsx` (route `#/builder/<formId>` và `#/builder/new`), `client/src/sync/api.ts` (hàm `saveForm`)

**Việc**
- Danh sách trường: nút lên/xuống, chọn trường để sửa, "+ Thêm trường" (chọn loại).
- Panel thuộc tính: nhãn, id (chỉ sửa được với trường mới), bắt buộc, options (select/multiselect), ẩn.
- "Xem trước" dùng `FormRenderer` với dữ liệu rỗng.
- "Lưu bản mới": chạy `validateFormSchema` ở client trước, hiện lỗi; online thì gọi API, offline thì báo "Cần kết nối để lưu form".
- Chỉ hiện với `supervisor` (tạm thời: luôn hiện cho tới TV2-05; ghi TODO(TV1-06)). 🆕 ADR 0003: hiện cho cả `owner`.

**Xong khi:** tạo form 7 loại trường, lưu, quay lại trang chủ thấy form sau một vòng đồng bộ; sửa form tạo version mới.

**Test:** E2E `e2e/builder.spec.ts`: tạo form có 3 trường, lưu, tạo phiếu từ form đó.

---

## TV1-05 · Validate phiếu + trạng thái nháp · **Lõi**

- **Trạng thái:** ✅ PR #7 (`validateRecord` + unit test), PR #17 (nháp, lỗi dưới trường, E2E O5)
- **Tuần:** 3 · **Phụ thuộc:** không
- **Spec:** design §4.1 (Validate phiếu), §5.1 (sơ đồ trạng thái), ADR 0001 quy tắc 8
- **File:** `shared/src/recordValidation.ts` + `.test.ts` (mới), `client/src/db/db.ts` (`SyncState` thêm `'draft'`, `validationErrors?`), `client/src/sync/outbox.ts`, `client/src/components/FormRenderer.tsx`, `client/src/pages/FillPage.tsx`, `client/src/pages/HomePage.tsx` (nhãn "Nháp")

**Việc**
- `validateRecord(form, data): Record<fieldId, string>`: required (bỏ qua trường `hidden`), number hợp lệ, date `YYYY-MM-DD`.
- `saveRecordLocally`: có lỗi → lưu phiếu `syncState: 'draft'`, `validationErrors`, **không** tạo/cập nhật op; nếu phiếu đang có op `attempts === 0` thì giữ op đó (dữ liệu cũ hợp lệ vẫn gửi được) – ghi rõ quyết định này trong PR và hỏi TV2.
- Hết lỗi → `pending` + op như cũ.
- `FormRenderer` hiện lỗi dưới từng trường; trang chủ hiện nhãn "Nháp".

**Xong khi**
- Unit test cho `validateRecord`.
- E2E **O5**: lưu thiếu tên chủ hộ → "Nháp", không có request PUT; điền đủ → "Đã đồng bộ".

**Review kỹ (TV2 duyệt):** transaction trong `saveRecordLocally` vẫn bao cả records và outbox; không có đường nào để phiếu `pending` mà thiếu op.

---

## TV1-06 · Bộ chọn dự án

- **Trạng thái:** ✅ PR #23 (phần đang chạy; 🆕 nhãn Owner chờ TV2-16; "Tổ chức khác…" và 0 tổ chức → màn hình 9 làm ở TV1-15, ✅ PR #54; nút builder/Xuất/Thành viên chưa có màn hình, dùng `canManageProject` trong `client/src/projects.ts`)
- 🆕 **Cập nhật theo ADR 0003:** nhãn vai trò có thêm "Owner"; nút builder, Xuất, Thành viên hiện cho cả `owner`; mục "Tổ chức khác…" mở màn hình 9 (TV1-15); không có tổ chức nào thì vào màn hình 9 thay cho câu "Gửi mã người dùng `<userId>`".
- **Tuần:** 4 · **Phụ thuộc:** TV2-05, TV2-06
- **Spec:** design §4.7, ADR 0002 §4
- **File:** `client/src/components/ProjectSwitcher.tsx` (mới), `client/src/App.tsx`, `client/src/pages/HomePage.tsx`

**Việc**
- Thanh trên: tên dự án đang chọn; mở ra liệt kê dự án từ `field-survey-account` kèm vai trò, số cần xử lý, số chưa đồng bộ; dự án `removed` hiện mờ "Đã rời".
- Chọn dự án → `setCurrentProject(id)` (API của TV2-05), mọi trang dùng CSDL dự án đó.
- Chỉ một dự án → không hiện danh sách, chỉ hiện tên. Không có dự án nào → màn hình "Bạn chưa được thêm vào dự án nào. Gửi mã người dùng `<userId>` cho giám sát viên."
- Ẩn/hiện nút builder, Xuất, Thành viên theo vai trò.
- Banner "Bạn không còn thuộc dự án X. N phiếu chưa gửi được" với nút "Xuất JSON" / "Xoá khỏi máy" (gọi hàm TV2-07).

**Xong khi:** đổi dự án ≤ 1 s kể cả offline (design §11.2); `data-testid="project-switcher"`.

---

## TV1-07 · Cập nhật SW, Cài đặt, kiểm tra trình duyệt

- **Trạng thái:** ✅ phần 1 PR #20 (trang Cài đặt: tên, `userId`, dung lượng, Đăng xuất) · ✅ phần 2a PR #27: `registerType: 'prompt'` + `UpdatePrompt`, icon PNG + `apple-touch-icon`, runtime cache theo dự án, `/admin/` trong denylist; E2E `update.spec.ts` · ✅ phần 2b PR #28: `browserSupport.ts` + màn hình "Trình duyệt không được hỗ trợ", `storage.persist()` sau khi lưu phiếu, hướng dẫn cài ở Cài đặt, Đăng xuất xoá cache SW `me`/`forms`; unit `browserSupport.test.ts`, E2E `browser-support.spec.ts`, `settings.spec.ts` · còn phần 🆕 theo ADR 0003 (tên đăng nhập, `/auth/logout`) chờ TV2-14/TV2-16
- 🆕 **Cập nhật theo ADR 0003:** trang Cài đặt hiện **tên đăng nhập** (thay `userId`) để gửi cho giám sát viên; Đăng xuất gọi `logout` của TV2-16. Cấu hình SW: thêm `/admin/` vào `navigateFallbackDenylist` nếu TV1-16 chưa làm. Phần 1 (PR #20) theo bản đang chạy: hiện `userId`, Đăng xuất chưa gọi `/auth/logout`.
- **Tuần:** 4 · **Phụ thuộc:** không
- **Spec:** design §4.2 (Chống bị xoá dữ liệu), §4.3, §11.1
- **File:** `client/vite.config.ts`, `client/src/main.tsx`, `client/src/components/UpdatePrompt.tsx` (mới), `client/src/pages/SettingsPage.tsx` (mới), `client/src/browserSupport.ts` (mới), `client/public/icon-192.png`, `icon-512.png`

**Việc**
- `registerType: 'prompt'`; khi có bản mới hiện dải "Có phiên bản mới, [Tải lại]".
- Trang Cài đặt: mã người dùng (`userId`, để gửi cho giám sát viên), dung lượng (`storage.estimate`), "Đăng xuất" (chỉ khi không còn dữ liệu chưa gửi ở mọi dự án), hướng dẫn cài lên màn hình chính (Android/iOS).
- Gọi `navigator.storage.persist()` sau lần lưu phiếu đầu tiên.
- `browserSupport.ts`: kiểm tra Service Worker, IndexedDB, `crypto.randomUUID`, `navigator.locks`, `crypto.subtle`; thiếu thì hiện "Trình duyệt không được hỗ trợ" thay cho app.
- Thêm icon PNG vào manifest.

**Xong khi:** Lighthouse PWA installable trên staging; thông báo cập nhật hiện sau khi deploy bản mới.

---

## TV1-08 · Thành viên dự án (API + màn hình)

- **Trạng thái:** ✅ PR #38 (phần 1: API `P/members`, `P/settings`), PR #39 (phần 2: màn hình Thành viên, thêm `GET P/settings`)
- **Ghi chú phần 1:** D2 chỉ kiểm cột `public`; vế "tổ chức hiện/ẩn ở D1" kiểm khi TV2-15 có `GET /directory`.
- 🆕 **Cập nhật theo ADR 0003** (bản trước: thêm bằng `userId`, `last_supervisor`, chỉ supervisor): thêm bằng **tên đăng nhập**, phân quyền supervisor/owner, `last_owner`, `admin_account`, thêm `P/settings`.
- **Tuần:** 5 · **Phụ thuộc:** TV2-14 (vai trò `owner`, `username`)
- **Spec:** design §4.7 (🆕), §7 (`P/members`, `P/settings`), §7.1 `last_owner`, `already_member`, `admin_account`; ADR 0003 §2, §3, §6; ui.md màn hình 6
- **File:** `server/src/routes/members.ts` (mới), `server/src/repo/memberships.ts` (hàm theo `ctx`, phối hợp TV2), `server/test/members.test.ts` (mới), `client/src/pages/MembersPage.tsx` (mới), `client/src/sync/api.ts`

**Việc**
- `GET P/members` (supervisor), `POST P/members { username, role }`, `PUT/DELETE P/members/:userId`. Supervisor chỉ thêm/đổi/rút `surveyor`; owner mọi vai trò. Không rút/hạ Owner cuối cùng → `409 last_owner`; tài khoản admin → `409 admin_account`; ghi `added_by` = `ctx.userId`.
- `PATCH P/settings { name?, public? }` (owner).
- Màn hình theo ui.md màn hình 6: danh sách (tên, tên đăng nhập, vai trò), thêm bằng tên đăng nhập + chọn vai trò, đổi vai trò, rút (hộp xác nhận); owner có thêm đổi tên tổ chức và ô "Công khai tên tổ chức". Cần online.

**Xong khi:** integration **M1, M2, A6, A7, Q9, D2** + surveyor gọi → `403` + dự án khác → `403 not_member`.

**Review kỹ (Lõi phía server):** mọi SQL có `project_id = ctx.projectId`.

---

## TV1-09 · Màn hình Dự án cho admin · **Cắt được**

- **Trạng thái:** ❌ **Bỏ theo ADR 0003**, thay bởi TV1-16 (trang quản trị riêng `/admin/`, không nằm trong PWA). Nội dung dưới đây giữ để đối chiếu, không làm.
- **Tuần:** 5 · **Phụ thuộc:** TV2-04
- **Spec:** design §4.7, §7 (`/admin/*`)
- **File:** `client/src/pages/AdminProjectsPage.tsx` (mới)

**Việc:** liệt kê, tạo, đổi tên, lưu trữ dự án; chỉ định giám sát viên đầu tiên bằng `userId`. Chỉ hiện khi `isAdmin`.

**Xong khi:** admin tạo dự án mới và chỉ định giám sát viên; người đó thấy dự án sau một vòng đồng bộ.

---

## TV1-10 · `formVersion`, trường ẩn, xuất/nhập form

- **Trạng thái:** ✅ PR #32 (phần 1: formVersion + trường ẩn), PR #33 (phần 2: xuất/nhập form)
- **Tuần:** 5 · **Phụ thuộc:** TV1-04
- **Spec:** design §4.1, §5.3 bước 5, §8 (form version chưa có trên máy)
- **File:** `client/src/pages/FillPage.tsx`, `client/src/components/FormRenderer.tsx`, `client/src/pages/BuilderPage.tsx`

**Việc**
- Phiếu cũ mở bằng đúng `formVersion`; chưa có version đó trên máy và offline → "Cần kết nối để mở phiếu này".
- Trường `hidden` không hiện khi tạo phiếu mới; phiếu cũ đã có giá trị thì vẫn hiện (chỉ đọc).
- Builder: "Xuất form" (tải file JSON), "Nhập form" (chọn file, chạy `validateFormSchema`, lưu thành form mới trong dự án hiện tại). **Cắt được** riêng phần xuất/nhập.

**Xong khi:** E2E: tạo phiếu ở v1, ẩn một trường tạo v2, mở lại phiếu cũ vẫn thấy trường đó.

---

## TV1-11 · E2E O2, O4, T6, T10

- **Trạng thái:** ✅ PR #43
- **Ghi chú:** T6 thêm minh vào dự án mới với vai trò **supervisor**, vì surveyor chỉ thấy phiếu của mình (§5.5) nên không kiểm được "thấy đủ phiếu". T6 dùng phiếu đã đồng bộ ở dự án cũ để so "không đổi" (phiếu chưa gửi sẽ tự gửi khi có mạng).
- **Tuần:** 6 · **Phụ thuộc:** TV1-06, TV2-07
- **Spec:** design §10.1, ADR 0002 Kiểm chứng
- **File:** `client/e2e/offline-install.spec.ts`, `client/e2e/projects.spec.ts` (mới)

**Ca**
- **O2:** đã tải app, mở lại khi offline từ đầu, tạo 10 phiếu, online → đủ 10 phiếu trên server.
- **O4:** lưu phiếu, đóng trang (`page.close()`), mở trang mới → phiếu vẫn được đồng bộ.
- **T6:** người dùng ở dự án A được thêm vào dự án B (qua API trong test) → sau một vòng đồng bộ thấy đủ phiếu B, dữ liệu A không đổi.
- **T10:** offline, chuyển qua lại A ↔ B, mỗi bên chỉ thấy form/phiếu của mình.

---

## TV1-12 · Hoàn thiện UI, tài liệu người dùng

- **Trạng thái:** —
- **Tuần:** 7–8
- **File:** `docs/user-guide.md` (mới), các trang UI

**Việc**
- Rà UI ở bề ngang 360px, chữ đúng design, trạng thái rỗng/đang tải/lỗi ở mọi trang.
- `docs/user-guide.md`: cho điều tra viên (cài app, nhập mã, điền phiếu, xử lý xung đột, khi nào an toàn để đổi máy), giám sát viên (form, thành viên, xuất), quản trị (CLI, tạo dự án). 🆕 ADR 0003: viết theo bản mới: tạo tài khoản và đăng nhập (thay "nhập mã"); Owner (gửi yêu cầu mở tổ chức, thêm giám sát viên, công khai); admin (trang `/admin/`: duyệt yêu cầu, khoá tổ chức, CLI cho tài khoản). AI viết nháp, người sửa theo app thật, kèm ảnh chụp màn hình.

---

## TV1-13 · Nút xoá phiếu và hộp xác nhận

- **Trạng thái:** ✅ PR #42
- **Ghi chú:** (1) Phiếu `conflict` **ẩn** cả Lưu lẫn Xoá theo main (#41, design §4.5), không "khoá nút". (2) "Ẩn nút với surveyor khi phiếu không do mình tạo" **chưa làm** (Dương chốt 2026-10-17): máy không biết người tạo vì `ServerRecord` chưa có `createdBy` (design §6.2 bản 0.4, chưa có code), cần ticket riêng chạm server + shared + client. Hiện surveyor chỉ pull phiếu của mình; phiếu người khác chỉ còn trên máy khi vừa bị hạ vai trò mà còn dữ liệu chưa gửi, xoá thì server trả 404 (op lỗi, không mất dữ liệu).
- **Tuần:** 5 · **Phụ thuộc:** TV2-13
- **Spec:** design §5.7, §4.8 (phiếu đã xoá không hiện); [ui.md](../ui.md) màn hình 4 (trang phiếu)
- **File:** `client/src/pages/FillPage.tsx`, `client/src/components/ConfirmDialog.tsx` (mới), `client/e2e/delete.spec.ts` (phần UI, chung file với TV2-13)

**Việc**
- Nút "Xoá phiếu" ở trang phiếu, hộp xác nhận đúng câu chữ "Xoá phiếu này? Không hoàn tác được trên máy." Bấm "Huỷ" thì không đổi gì.
- Ẩn nút với surveyor khi phiếu không do mình tạo; khoá nút khi phiếu đang `conflict`.
- Gọi `deleteRecordLocally` (TV2-13). Đã có: TV2-13 đã đổi nút "Xoá phiếu" hiện có sang gọi hàm này (kèm bắt `RecordInConflictError`), hỏi trước bằng `window.confirm` đúng câu chữ, và có E2E O7 (cả ca Huỷ), O8. Ticket này thay `window.confirm` bằng `ConfirmDialog`; sửa helper `clickDelete` trong `delete.spec.ts` (đang trả lời hộp thoại của trình duyệt) sang bấm nút trong hộp thoại.
- Danh sách phiếu không hiện phiếu `deleted`.

**Xong khi:** phần UI của E2E **O7**: bấm "Huỷ" thì phiếu còn; bấm "Xoá" thì phiếu biến khỏi danh sách.

---

# Theo ADR 0003 (bản mới)

Các ticket dưới đây làm theo [ADR 0003](../adr/0003-accounts-and-owner-role.md), các mục 🆕 trong design.md và ui.md. Màn hình nhập mã của TV1-02 vẫn chạy cho tới khi TV1-14 xong.

---

## TV1-14 · Màn hình Đăng nhập / Tạo tài khoản

- **Trạng thái:** ✅ PR #53
- **Tuần:** 4 · **Phụ thuộc:** TV2-16 (hàm `register`, `login`); thay cho TV1-02
- **Spec:** design §4.7 (🆕 Tài khoản, Sau khi đăng nhập), §7.1 (`invalid_credentials`, `username_taken`, `too_many_requests`); ui.md màn hình 1 (🆕)
- **File:** `client/src/pages/LoginPage.tsx`, `client/src/App.tsx`, `client/e2e/login.spec.ts`

**Việc**
- Hai tab "Đăng nhập" / "Tạo tài khoản" theo ui.md màn hình 1; kiểm tra phía client: mẫu tên đăng nhập, độ dài mật khẩu, nhập lại khớp.
- Thông báo lỗi đúng câu chữ trong ui.md; offline: "Cần kết nối mạng".
- Tài khoản admin: hiện "Tài khoản quản trị dùng trang /admin" kèm link (lỗi `AdminAccountError` từ TV2-16).
- Sau khi đăng nhập: chưa thuộc tổ chức nào → màn hình 9 (TV1-15), có → trang chủ.
- `data-testid`: `login-username`, `login-password`, `register-name`, `register-password2`.
- Thông báo từ chối "còn phiếu chưa gửi" có nút "Xuất JSON" (design §4.7).
- Dương chốt 2026-10-19: bỏ hẳn màn hình nhập mã; tab Đăng nhập không kiểm mẫu tên (tài khoản cũ `u_xxxxxxxx`); chưa thuộc tổ chức nào thì tạm hiện tên đăng nhập ở trang chủ tới TV1-15; `docs/deploy.md` ghi bước `user:reset-password` cho tài khoản cũ trên staging.

**Xong khi:** E2E **U7** (tạo tài khoản, tải lại vẫn đăng nhập; offline báo cần mạng); sửa `login.spec.ts` cũ theo màn hình mới, ghi rõ trong PR là thay spec TV1-02 chứ không nới assertion.

---

## TV1-15 · Màn hình Tổ chức (danh bạ công khai, mở tổ chức mới)

- **Trạng thái:** ✅ PR #54
- **Tuần:** 4 · **Phụ thuộc:** TV2-15, TV1-14
- **Spec:** design §4.7 (🆕 Màn hình Tổ chức); ui.md màn hình 9
- **File:** `client/src/pages/OrgsPage.tsx` (mới), `client/src/App.tsx` (route `#/orgs`), `client/src/sync/api.ts` (`fetchDirectory`, `requestProject`, `listMyProjectRequests`, `cancelProjectRequest`), `client/e2e/orgs.spec.ts` (mới)

**Việc**
- Hiện tên đăng nhập kèm hướng dẫn gửi cho giám sát viên.
- Danh sách tên tổ chức công khai (không có nút xin vào).
- Form "Mở tổ chức mới" (tên, ghi chú), danh sách yêu cầu của mình kèm trạng thái, nút Huỷ khi đang chờ. Lỗi `409 project_limit_reached`: "Bạn đã có yêu cầu đang chờ hoặc đã sở hữu 3 tổ chức".
- Màn hình cần mạng: offline hiện "Cần kết nối mạng để dùng chức năng này".
- Chưa thuộc tổ chức nào: trang chủ hiện thẳng màn hình này (thay câu tạm của TV1-14), không có link quay lại.
- Mục "Tổ chức khác…" trong bộ chọn dự án (phần 🆕 còn lại của TV1-06).
- Dương chốt 2026-10-19: người chỉ có một tổ chức thấy link "Tổ chức khác…" cạnh tên; câu "Đã duyệt", "Đã huỷ", "Nhập tên tổ chức", "Tên tổ chức tối đa 100 ký tự", "Ghi chú tối đa 500 ký tự"; ô tên `data-testid="org-request-name"`.

**Xong khi:** E2E **Q8** (gửi yêu cầu → admin duyệt qua API → sau một vòng đồng bộ thấy tổ chức với vai trò Owner, tạo được form) và **M3**.

---

## TV1-16 · Trang quản trị `/admin/` (thay TV1-09)

- **Trạng thái:** ⏳ phần 1 (khung + đăng nhập) chờ review
- **Tuần:** 5 · **Phụ thuộc:** TV2-15 (A1, A2); TV2-17 (A3, cắt được)
- **Spec:** design §4.3 (🆕), §4.9; ADR 0003 §8; ui.md "Trang quản trị" A1–A3
- **File:** `client/admin/index.html` (mới), `client/src/admin/` (mới: `main.tsx`, `AdminApp.tsx`, `RequestsPage.tsx`, `ProjectsPage.tsx`, `UsersPage.tsx`), `client/vite.config.ts` (nhiều trang; SW bỏ qua `/admin/`), `client/e2e/admin.spec.ts` (mới), `docs/deploy.md` (Caddy cho `/admin/`)

**Việc**
- Vite build hai trang; `admin/` không đăng ký SW, không manifest, không import Dexie hay `src/sync/engine`. `navigateFallbackDenylist` và precache của PWA loại `/admin/`.
- Đăng nhập bằng `/api/auth/login`; tài khoản không phải admin → "Tài khoản này không phải quản trị", không lưu token. Token trong `sessionStorage`.
- A1 duyệt/từ chối (lý do bắt buộc), A2 khoá/mở, đổi Owner. A3 **cắt được**.
- Bố cục bảng cho máy tính.

**Chia 2 phần** (Dương duyệt 2026-10-19)
- **Phần 1 – khung** `feat/tv1-16-admin-shell`: Vite build hai trang, `admin/index.html`, `src/admin/` (`main.tsx`, `AdminApp.tsx`, `AdminLogin.tsx`, `adminApi.ts`, `session.ts` + unit, `admin.css`); đăng nhập/đăng xuất admin; A1 `/admin/#/`, A2 `/admin/#/projects` (trang trống), A3 ẩn; precache và manifest không có trang admin; E2E `admin.spec.ts` phần đăng nhập (Q10 một phần); deploy.md bước kiểm `/admin/`.
- **Phần 2 – A1, A2** `feat/tv1-16-admin-pages`: bảng yêu cầu (Duyệt, Từ chối có lý do), bảng tổ chức (Khoá/Mở, Đổi Owner), 401 về đăng nhập, E2E Q10 đủ, thử trên staging.
- A3 (TV2-17, PR #51) lượt riêng sau khi #51 merge; cắt được.

**Xong khi:** E2E **Q10** (tài khoản thường bị từ chối; admin duyệt ở A1, khoá ở A2; `indexedDB.databases()` trên trang admin rỗng); thử trên staging, `deploy.md` cập nhật.

**Review kỹ:** trang admin không có đường gọi `P/...`; bản build PWA không chứa mã của trang admin và ngược lại (xem kích thước chunk).

---

## TV1-17 · Tên người tạo/sửa trong `ServerRecord`

- **Trạng thái:** ✅ PR #44 (phần 1: shared + server), PR #45 (phần 2: client)
- **Tuần:** 6 · **Phụ thuộc:** TV2-03 (`P/records`), TV2-05 (CSDL client) · Dương nhận 2026-10-17 (P1 nhóm chốt 2026-10-10, chưa ticket nào có)
- **Spec:** design §6.2 (`createdBy`, `createdByName`, `updatedByName`), §4.5 (tên người sửa ở màn hình xung đột), §5.7 (surveyor chỉ xoá phiếu mình tạo)
- **File:** phần 1: `shared/src/types.ts`, `server/src/repo/records.ts`, `server/test/recordNames.test.ts` (mới). Phần 2: `client/src/db/projectDb.ts`, `client/src/sync/engine.ts`, `client/src/pages/FillPage.tsx`, `client/src/pages/ConflictPage.tsx`, hàm thuần `canDeleteRecord` + unit, E2E

**Chia 2 phần** (Dương duyệt 2026-10-17)
- **Phần 1 – shared + server:** `ServerRecord` thêm `createdBy`, `createdByName`, `updatedByName`; `RecordHistoryEntry` thêm `updatedByName`. Server ghép tên từ `users` lúc đọc (LEFT JOIN, không tìm thấy thì `''`) ở pull, PUT, 409 (`current` + `history`), `GET history`. Không migration.
- **Phần 2 – client:** lưu `createdBy`, `createdByName` theo phiếu (không đổi schema Dexie, không ép pull lại phiếu cũ); màn hình xung đột hiện tên thay userId (bản xung đột cũ không có tên thì hiện userId); ẩn "Xoá phiếu" với surveyor khi đã biết `createdBy` khác mình (phần bỏ ra từ TV1-13).
- Ngoài phạm vi: danh sách phiếu §4.8 (tên người tạo, lọc theo người tạo, "(đã rời dự án)").

**Xong khi:** phần 1: integration pull/PUT/409/history có tên, người tạo giữ nguyên sau khi người khác sửa, tài khoản không tìm thấy thì tên rỗng. Phần 2: màn hình xung đột hiện tên người sửa; E2E surveyor mở phiếu người khác tạo thì không có nút "Xoá phiếu", phiếu của mình thì có.
