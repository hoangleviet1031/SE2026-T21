# TV1 – Form, PWA, màn hình dự án, staging

Sở hữu: `client/src/components/`, `client/src/pages/` (trừ `ConflictPage.tsx`), `server/src/routes/forms.ts`, `server/src/routes/members.ts`, `client/vite.config.ts`, staging. Xem [team-plan](../team-plan.md#thành-viên-1-form-pwa-màn-hình-dự-án-và-môi-trường-demo).

Cách làm mỗi ticket: [vibe-coding.md §2](../vibe-coding.md#2-quy-trình-cho-một-ticket).

---

## TV1-01 · Staging HTTPS · **Người làm**

- **Trạng thái:** —
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

- **Trạng thái:** —
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

- **Trạng thái:** —
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

- **Trạng thái:** —
- **Tuần:** 3 · **Phụ thuộc:** TV1-03
- **Spec:** design §4.1 (Builder UI, Tiêu chí chấp nhận), UI phác ở cuộc thảo luận UI (màn hình 5)
- **File:** `client/src/pages/BuilderPage.tsx` (mới), `client/src/components/FieldEditor.tsx` (mới), `client/src/App.tsx` (route `#/builder/<formId>` và `#/builder/new`), `client/src/sync/api.ts` (hàm `saveForm`)

**Việc**
- Danh sách trường: nút lên/xuống, chọn trường để sửa, "+ Thêm trường" (chọn loại).
- Panel thuộc tính: nhãn, id (chỉ sửa được với trường mới), bắt buộc, options (select/multiselect), ẩn.
- "Xem trước" dùng `FormRenderer` với dữ liệu rỗng.
- "Lưu bản mới": chạy `validateFormSchema` ở client trước, hiện lỗi; online thì gọi API, offline thì báo "Cần kết nối để lưu form".
- Chỉ hiện với `supervisor` (tạm thời: luôn hiện cho tới TV2-05; ghi TODO(TV1-06)).

**Xong khi:** tạo form 7 loại trường, lưu, quay lại trang chủ thấy form sau một vòng đồng bộ; sửa form tạo version mới.

**Test:** E2E `e2e/builder.spec.ts`: tạo form có 3 trường, lưu, tạo phiếu từ form đó.

---

## TV1-05 · Validate phiếu + trạng thái nháp · **Lõi**

- **Trạng thái:** —
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

- **Trạng thái:** —
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

- **Trạng thái:** —
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

- **Trạng thái:** —
- **Tuần:** 5 · **Phụ thuộc:** TV2-04
- **Spec:** design §4.7, §7 (`P/members`), §7.1 `last_supervisor`; ADR 0002 §2, §6
- **File:** `server/src/routes/members.ts` (mới), `server/test/members.test.ts` (mới), `client/src/pages/MembersPage.tsx` (mới), `client/src/sync/api.ts`

**Việc**
- `GET/PUT/DELETE P/members[/:userId]` (supervisor). Không cho rút hoặc hạ giám sát viên cuối cùng → `409 last_supervisor`.
- Màn hình: danh sách (tên, `userId`, vai trò), thêm bằng `userId` + chọn vai trò, đổi vai trò, rút (hộp xác nhận). Cần online.

**Xong khi:** integration A4 + ca thành công + surveyor gọi → `403` + dự án khác → `403 not_member`.

**Review kỹ (Lõi phía server):** mọi SQL có `project_id = ctx.projectId`.

---

## TV1-09 · Màn hình Dự án cho admin · **Cắt được**

- **Trạng thái:** —
- **Tuần:** 5 · **Phụ thuộc:** TV2-04
- **Spec:** design §4.7, §7 (`/admin/*`)
- **File:** `client/src/pages/AdminProjectsPage.tsx` (mới)

**Việc:** liệt kê, tạo, đổi tên, lưu trữ dự án; chỉ định giám sát viên đầu tiên bằng `userId`. Chỉ hiện khi `isAdmin`.

**Xong khi:** admin tạo dự án mới và chỉ định giám sát viên; người đó thấy dự án sau một vòng đồng bộ.

---

## TV1-10 · `formVersion`, trường ẩn, xuất/nhập form

- **Trạng thái:** —
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

- **Trạng thái:** —
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
- `docs/user-guide.md`: cho điều tra viên (cài app, nhập mã, điền phiếu, xử lý xung đột, khi nào an toàn để đổi máy), giám sát viên (form, thành viên, xuất), quản trị (CLI, tạo dự án). AI viết nháp, người sửa theo app thật, kèm ảnh chụp màn hình.
