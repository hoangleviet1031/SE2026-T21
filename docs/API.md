# API — Hợp đồng REST (dự kiến, v0.1)

> Hợp đồng này được hiện thực hoá bằng Zod trong `packages/shared/src/schemas/api.ts`. **Mọi thay đổi hợp đồng phải qua PR có đủ A, B, C duyệt** và cập nhật file này.
> Liên quan: [DATA_MODEL.md](DATA_MODEL.md) · [SYNC.md](SYNC.md)

## 1. Quy ước chung

| Mục | Quy ước |
|---|---|
| Base URL | `/api` (cùng origin với web qua Caddy) |
| Định dạng | JSON UTF-8; upload dùng `multipart/form-data` |
| Thời gian | ISO 8601 UTC (`2026-10-05T03:15:00Z`); client tự đổi sang giờ địa phương |
| Auth | `Authorization: Bearer <JWT>` cho mọi endpoint trừ `POST /auth/login` và `GET /attachments/:id` có chữ ký |
| Thiết bị | `X-Device-Id: <uuid>` trên mọi request ghi (lưu vào `response_revisions.device_id`) |
| Idempotency | `Idempotency-Key: <opId uuid>` **bắt buộc** với `PUT/DELETE /responses/:id` |
| Lỗi | `{ "error": { "code": "VERSION_CONFLICT", "message": "…", "details": … } }` |
| Phân trang | `?page=1&pageSize=50` → `{ items, total }` |
| ID | Response & attachment: UUIDv7 do client sinh. Còn lại: server sinh. |

## 2. Mã lỗi

| HTTP | `code` | Khi nào | Client sync xử lý ([SYNC §5](SYNC.md#5-phân-loại-kết-quả-và-retry)) |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Body/headers sai định dạng | permanent |
| 401 | `UNAUTHENTICATED` | Thiếu/sai/hết hạn token | auth |
| 403 | `FORBIDDEN` | Không đủ quyền (vd surveyor sửa phiếu người khác) | permanent |
| 404 | `NOT_FOUND` | Không tồn tại (vd `baseVersion` ≠ null nhưng phiếu không có) | permanent |
| 409 | `VERSION_CONFLICT` | `baseVersion` ≠ version hiện tại | **conflict** |
| 409 | `FORM_VERSION_IMMUTABLE`, `DRAFT_EXISTS` | Chỉ ở API admin | — (UI admin) |
| 413 | `FILE_TOO_LARGE` | Vượt giới hạn dung lượng | permanent |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | MIME/magic bytes không cho phép | permanent |
| 422 | `VALIDATION_FAILED` | Data không hợp lệ theo schema; `details: [{ fieldId, message }]` | permanent |
| 422 | `ATTACHMENT_MISSING` | Data tham chiếu attachment chưa upload | permanent (không xảy ra nếu `dependsOn` đúng) |
| 422 | `FORM_VERSION_NOT_PUBLISHED` | Phiếu gắn version draft/không tồn tại | permanent |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Cùng `opId` nhưng request khác | permanent (lỗi client) |
| 422 | `HASH_MISMATCH`, `ATTACHMENT_ID_TAKEN` | Upload sai hash / id đã dùng cho file khác | permanent |
| 422 | `SCHEMA_INVALID` | Publish schema không hợp lệ | — (UI admin) |
| 429 | `RATE_LIMITED` | (Dự phòng, MVP không giới hạn) | retry |
| 5xx | `INTERNAL` | Lỗi server | retry |

## 3. Auth

### 3.1 `POST /api/auth/login`
```json
// request
{ "email": "sv1@demo.local", "password": "…" }
// 200
{ "token": "<jwt>", "expiresAt": "2026-10-12T03:00:00Z", "user": { "id": "…", "name": "Trần B", "role": "surveyor" } }
```
401 `UNAUTHENTICATED` nếu sai thông tin.

### 3.2 `GET /api/auth/me`
200 `{ "user": { "id", "name", "role" } }` — dùng kiểm tra token khi online.

## 4. Forms (admin)

`FormVersionDTO`: `{ id, formId, formTitle, versionNo, status, schema, publishedAt, serverSeq }`

| Method & path | Body | Kết quả |
|---|---|---|
| `GET /api/forms` | — | `[{ id, title, description, createdAt, versions: [{ id, versionNo, status, publishedAt, responseCount }] }]` |
| `POST /api/forms` | `{ title, description? }` | 201 `{ form, draftVersion: FormVersionDTO }` (version 1, schema rỗng) |
| `GET /api/forms/:id` | — | `{ form, versions: FormVersionDTO[] }` |
| `PUT /api/form-versions/:id` | `{ schema }` | 200 `FormVersionDTO`; 409 `FORM_VERSION_IMMUTABLE` nếu đã publish; 422 `VALIDATION_FAILED` nếu sai Zod |
| `POST /api/forms/:id/versions` | — | 201 draft mới clone từ version published mới nhất (giữ field `id`); 409 `DRAFT_EXISTS` |
| `POST /api/form-versions/:id/publish` | — | 200 `FormVersionDTO` (status `published`, có `serverSeq`); 422 `SCHEMA_INVALID` (≥ 1 field, label không rỗng, choice ≥ 2 option không trùng) |

Surveyor **không** gọi các endpoint này; nhận form version qua `/sync/pull`.

## 5. Responses

### 5.1 DTO

```jsonc
// ResponseDTO
{
  "id": "0192…", "formVersionId": "…",
  "data": { "f_hh7k2m9a": 5, "f_p0x4n6re": ["0192…a1"] },
  "version": 3, "deleted": false,
  "createdBy": { "id": "…", "name": "Trần B" }, "createdAt": "…",
  "updatedBy": { "id": "…", "name": "Nguyễn A" }, "updatedAt": "…",
  "serverSeq": 1042,
  "attachments": [ { "id": "0192…a1", "fieldId": "f_p0x4n6re", "filename": "nha.jpg", "mime": "image/jpeg", "size": 412331, "url": "/api/attachments/0192…a1?exp=…&sig=…" } ]
}

// RevisionDTO
{ "version": 3, "data": { … }, "deleted": false,
  "changedBy": { "id": "…", "name": "Nguyễn A" }, "deviceId": "…", "changedAt": "…" }

// Resolution (gửi kèm khi ghi là kết quả của conflict)
{ "conflictId": "uuid", "kind": "field" | "edit_vs_delete" | "delete_vs_edit",
  "autoMerged": true, "baseVersion": 2, "serverVersion": 3,
  "decision": "merge" | "restore" | "accept_delete" | "delete" | "keep_server",
  "fields": [ { "fieldId": "…", "base": 4, "local": 5, "remote": 6, "choice": "local" | "remote" | "auto_local" | "auto_remote" } ] }
```

### 5.2 `PUT /api/responses/:id`
Tạo mới hoặc cập nhật (kể cả khôi phục tombstone). Headers: `Authorization`, `Idempotency-Key`, `X-Device-Id`.

```json
{ "formVersionId": "…", "data": { … }, "baseVersion": null, "resolution": null }
```

| Tình huống | Kết quả |
|---|---|
| `Idempotency-Key` đã xử lý, cùng request hash | Trả **nguyên văn** kết quả đã lưu (200) |
| `Idempotency-Key` đã xử lý, khác request hash | 422 `IDEMPOTENCY_KEY_REUSED` |
| Chưa tồn tại, `baseVersion = null` | Tạo version 1 → 200 `{ response: ResponseDTO }` |
| Chưa tồn tại, `baseVersion ≠ null` | 404 `NOT_FOUND` |
| Tồn tại, `baseVersion = version` (kể cả tombstone → khôi phục) | Cập nhật, version + 1 → 200 `{ response }` |
| Tồn tại, `baseVersion` khác (hoặc `null`) | 409 `VERSION_CONFLICT` + `{ current: ResponseDTO, revisions: RevisionDTO[] }` (các revision có version > `baseVersion`, tăng dần; rỗng nếu `baseVersion = null`) |
| Data sai schema / attachment chưa có / version form chưa publish | 422 tương ứng |
| Surveyor ghi phiếu của người khác | 403 |

Nếu có `resolution` → ghi `conflict_log` trong cùng transaction. Chi tiết xử lý: [SYNC §7](SYNC.md#7-server-xử-lý-ghi).

### 5.3 `DELETE /api/responses/:id`
Headers như PUT. Body: `{ "baseVersion": 3, "resolution": null }`.

| Tình huống | Kết quả |
|---|---|
| `baseVersion = version`, chưa xoá | Tombstone, version + 1 → 200 `{ response }` |
| `baseVersion = version`, đã là tombstone | 200 không đổi version (vẫn ghi `conflict_log` nếu có `resolution`) |
| `baseVersion` khác | 409 `VERSION_CONFLICT` như PUT |

### 5.4 Admin
| Method & path | Kết quả |
|---|---|
| `GET /api/responses?formVersionId=&createdBy=&includeDeleted=false&page=&pageSize=` | `{ items: ResponseDTO[], total }` — admin: mọi phiếu; surveyor: 403 |
| `GET /api/responses/:id` | `ResponseDTO` (surveyor: chỉ phiếu của mình) |
| `GET /api/responses/:id/history` | `{ revisions: RevisionDTO[], conflicts: ConflictLogDTO[] }` (`ConflictLogDTO` = các cột của `conflict_log` + `resolvedBy: {id, name}`) |

Admin sửa/xoá dùng **cùng** `PUT/DELETE` ở trên (UI admin tự sinh `Idempotency-Key` cho mỗi lần lưu). Nhận 409 → UI báo tải lại (FR54).

## 6. Attachments

### 6.1 `PUT /api/attachments/:id`
`multipart/form-data`: `file`, `responseId`, `fieldId`, `sha256`. Headers: `Authorization`, `X-Device-Id`. Idempotent theo `id + sha256` (không cần `Idempotency-Key`).

| Tình huống | Kết quả |
|---|---|
| Chưa có, hash khớp, MIME & size hợp lệ | Lưu file → 200 `{ attachment: AttachmentDTO }` |
| Đã có với cùng `sha256` | 200 như trên (không ghi lại) |
| Đã có với `sha256` khác | 422 `ATTACHMENT_ID_TAKEN` |
| Hash tính được ≠ `sha256` gửi lên | 422 `HASH_MISMATCH` |
| Quá dung lượng / MIME không cho phép | 413 / 415 |

`AttachmentDTO`: `{ id, responseId, fieldId, filename, mime, size, sha256, url }`.

### 6.2 `GET /api/attachments/:id`
Trả file. Được phép khi: có Bearer token hợp lệ và có quyền với phiếu, **hoặc** có `?exp=&sig=` hợp lệ (HMAC-SHA256 của `id + exp` bằng secret server). `url` trong DTO có hạn 24 giờ; URL trong export có hạn 7 ngày. Lý do: thẻ `<img>` và Excel không gửi được header `Authorization`.

## 7. Sync

### 7.1 `GET /api/sync/pull?cursor=<int>&limit=200`
Trả thay đổi có `server_seq > cursor`, sắp theo `server_seq` tăng dần, tổng tối đa `limit` bản ghi (gộp hai loại).

```json
{
  "formVersions": [ FormVersionDTO ],   // chỉ published
  "responses":    [ ResponseDTO ],      // surveyor: chỉ phiếu created_by = mình; gồm tombstone
  "nextCursor": 1042,
  "hasMore": false
}
```
Client lặp tới khi `hasMore = false`, lưu `nextCursor` vào `meta.syncCursor`.

## 8. Conflict resolutions

### 8.1 `POST /api/conflict-resolutions`
Chỉ dùng cho quyết định **không ghi dữ liệu** (`accept_delete` khi server đã xoá, `keep_server`, hoặc chọn toàn bộ giá trị server). Quyết định có ghi dữ liệu gửi `resolution` trong PUT/DELETE.

```json
{ "responseId": "…", "resolution": Resolution }
```
Idempotent theo `resolution.conflictId` (PK `conflict_log`) → 200 `{ ok: true }`.

## 9. Export (admin)

### 9.1 `GET /api/export/form-versions/:id?format=csv|json`
- `csv`: theo FR49 — UTF-8 BOM, header `response_id,created_by,created_at,updated_at,version,<label field 1>,…`. `Content-Disposition: attachment; filename="<slug-tiêu-đề>_v<no>_<yyyyMMdd>.csv"`.
- `json`: `{ formVersion: FormVersionDTO, exportedAt, responses: [ResponseDTO without url → url 7 ngày] }`.
- Bỏ tombstone. Chỉ admin.

## 10. Test-only (chỉ khi `NODE_ENV=test`)

| Method & path | Mục đích |
|---|---|
| `POST /api/__test__/reset` | Truncate + seed cố định: `admin@demo.local`, `sv1@demo.local`, `sv2@demo.local`, 1 form published mẫu |
| `POST /api/__test__/forms` | `{ title, schema }` → tạo & publish form, trả `FormVersionDTO` |
| `POST /api/__test__/token` | `{ userId, expiresInSec }` → JWT với hạn tuỳ ý (R5: token hết hạn) |
| `POST /api/__test__/faults` | **Dự phòng** — chỉ làm nếu spike Tuần 1 cho thấy `page.route` không chặn được request khi SW hoạt động: `{ method, pathPrefix, mode: "500" \| "timeout" \| "drop_after_commit", times }` |

## 11. Tóm tắt endpoint

| Endpoint | Vai trò | Dùng bởi |
|---|---|---|
| `POST /api/auth/login`, `GET /api/auth/me` | cả hai | S1, khởi động |
| `GET/POST /api/forms`, `GET /api/forms/:id`, `POST /api/forms/:id/versions` | admin | S6, S7 |
| `PUT /api/form-versions/:id`, `POST /api/form-versions/:id/publish` | admin | S7 |
| `PUT /api/responses/:id`, `DELETE /api/responses/:id` | cả hai | sync engine, S8 |
| `GET /api/responses`, `GET /api/responses/:id`, `GET /api/responses/:id/history` | admin (surveyor: phiếu mình, trừ list) | S8 |
| `PUT /api/attachments/:id`, `GET /api/attachments/:id` | cả hai | sync engine, hiển thị |
| `GET /api/sync/pull` | surveyor | sync engine |
| `POST /api/conflict-resolutions` | cả hai | S5 |
| `GET /api/export/form-versions/:id` | admin | S8 |
