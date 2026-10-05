# DATA_MODEL — PostgreSQL, form schema và IndexedDB

> Liên quan: [API.md](API.md) (DTO) · [SYNC.md](SYNC.md) (cách dữ liệu di chuyển) · [ADR-001](ADR/consistency-model.md)

## 1. Tổng quan quan hệ

```
users 1───* forms 1───* form_versions 1───* responses 1───* response_revisions
  │                                            │  ▲
  │                                            │  └── attachments.response_id (không FK, xem §4.6)
  ├──* responses (created_by / updated_by)     └──* conflict_log
  ├──* processed_ops
  └──* response_revisions (changed_by)
```

- Một **form** có nhiều **form version**; version `published` bất biến.
- Một **response** gắn đúng 1 form version, mọi lần ghi tạo 1 **revision**.
- `server_seq` lấy từ **một sequence chung** `sync_seq` cho cả `responses` và `form_versions` → một cursor duy nhất cho pull.

## 2. Form schema (JSON)

Lưu trong `form_versions.schema` (jsonb), validate bằng Zod `FormSchema` trong `packages/shared`.

```json
{
  "fields": [
    { "id": "f_hh7k2m9a", "type": "number", "label": "Số nhân khẩu", "required": true, "min": 0, "max": 50, "integer": true },
    { "id": "f_w1q8z3cd", "type": "single_choice", "label": "Nguồn nước", "required": true,
      "options": [ { "value": "tap", "label": "Nước máy" }, { "value": "well", "label": "Giếng" } ] },
    { "id": "f_p0x4n6re", "type": "attachment", "label": "Ảnh nhà", "required": false, "maxFiles": 3, "accept": "image" }
  ]
}
```

**Thuộc tính chung:** `id` (string, `f_` + 8 ký tự ngẫu nhiên, sinh bởi builder, **giữ nguyên khi clone version**), `type`, `label` (bắt buộc), `description?`, `required` (bool). Thứ tự field = thứ tự trong mảng.

| `type` | Thuộc tính riêng | Kiểu giá trị trong `data` |
|---|---|---|
| `text` | `maxLength?` (≤ 500) | `string` |
| `textarea` | `maxLength?` (≤ 5 000) | `string` |
| `number` | `min?`, `max?`, `integer?` | `number` |
| `date` | — | `string` dạng `YYYY-MM-DD` |
| `single_choice` | `options: {value, label}[]` (≥ 2, `value` duy nhất) | `string` (một `value`) |
| `multi_choice` | `options` như trên | `string[]` (các `value`) |
| `attachment` | `maxFiles` (1–5), `accept`: `"image"` \| `"image_pdf"` | `string[]` (các `attachmentId`) |

## 3. Response data

`data` là object `{ [fieldId]: value }`.

- **Chuẩn hoá** (hàm `normalizeValue` trong shared, dùng cho validate, merge, export): `undefined`, `""`, `[]` → `null`; chuỗi được trim.
- **So sánh** (hàm `valuesEqual`): sau chuẩn hoá; mảng (`multi_choice`, `attachment`) so như **tập hợp** (bỏ qua thứ tự).
- Key của field không còn trong schema bị bỏ qua khi validate/export (không xảy ra với version bất biến, chỉ là phòng thủ).

## 4. PostgreSQL (server)

Kiểu: `uuid`, `text`, `int`, `bigint`, `jsonb`, `timestamptz` (UTC). Mọi bảng có `created_at timestamptz default now()` nếu không ghi khác.

### 4.1 `users`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| email | text | unique, not null |
| name | text | not null |
| password_hash | text | bcrypt |
| role | text | `admin` \| `surveyor` |

### 4.2 `forms`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| title | text | not null |
| description | text | null |
| created_by | uuid | FK users |

### 4.3 `form_versions`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| form_id | uuid | FK forms |
| version_no | int | unique (`form_id`, `version_no`) |
| status | text | `draft` \| `published` |
| schema | jsonb | FormSchema |
| published_at | timestamptz | null khi draft |
| server_seq | bigint | null khi draft; gán từ `sync_seq` lúc publish |
| updated_at | timestamptz | |

Partial unique index: tối đa 1 `draft` mỗi form (`unique (form_id) where status = 'draft'`).

### 4.4 `responses`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK — **UUIDv7 do client sinh** |
| form_version_id | uuid | FK form_versions (phải `published`) |
| created_by | uuid | FK users |
| data | jsonb | Response data (§3) |
| version | int | not null, bắt đầu 1, +1 mỗi lần ghi (kể cả xoá/khôi phục) |
| deleted_at | timestamptz | null; ≠ null = tombstone |
| updated_by | uuid | FK users |
| updated_at | timestamptz | giờ server |
| server_seq | bigint | not null, unique; gán mới mỗi lần ghi |

Index: (`created_by`, `server_seq`) cho pull; (`form_version_id`) cho admin/export.

### 4.5 `response_revisions`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | bigserial | PK |
| response_id | uuid | FK responses |
| version | int | unique (`response_id`, `version`) |
| data | jsonb | ảnh chụp dữ liệu sau lần ghi |
| deleted | bool | true nếu lần ghi này là xoá |
| changed_by | uuid | FK users |
| device_id | uuid | từ header `X-Device-Id` (để giải thích "bạn trên thiết bị khác") |
| op_id | uuid | null với ghi của admin không qua outbox |
| changed_at | timestamptz | giờ server |

### 4.6 `attachments`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK — do client sinh |
| response_id | uuid | **không FK** — file được upload **trước** phiếu; PUT phiếu kiểm tra tham chiếu |
| field_id | text | |
| filename | text | tên gốc, chỉ để hiển thị |
| mime | text | thuộc `ALLOWED_MIME` |
| size | int | bytes |
| sha256 | char(64) | |
| storage_key | text | đường dẫn trong `StorageAdapter` (= id) |
| uploaded_by | uuid | FK users |

### 4.7 `processed_ops` (idempotency)
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| op_id | uuid | PK |
| user_id | uuid | FK users |
| request_hash | char(64) | SHA-256 của method + path + body chuẩn hoá |
| status_code | int | chỉ lưu kết quả 2xx |
| result | jsonb | body trả về |

Không dọn trong MVP.

### 4.8 `conflict_log`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK — = `conflictId` do client sinh (ghi log idempotent) |
| response_id | uuid | FK responses |
| kind | text | `field` \| `edit_vs_delete` \| `delete_vs_edit` |
| auto_merged | bool | |
| base_version | int | version mà thay đổi local dựa trên |
| server_version | int | version server lúc phát hiện conflict |
| fields | jsonb | `[{ fieldId, base, local, remote, choice }]`, `choice` ∈ `local` \| `remote` \| `auto_local` \| `auto_remote` |
| decision | text | `merge` (kind=field) \| `restore` \| `accept_delete` \| `delete` \| `keep_server` |
| resolved_by | uuid | FK users |
| resolved_at | timestamptz | |
| op_id | uuid | op mang quyết định (null nếu log qua `/conflict-resolutions`) |

### 4.9 Sequence
`CREATE SEQUENCE sync_seq;` — `nextval` chỉ được gọi bên trong transaction đã giữ `pg_advisory_xact_lock(SYNC_LOCK_KEY)` (xem [SYNC §7](SYNC.md#7-server-xử-lý-ghi)).

## 5. IndexedDB (client)

Database `field-survey`, Dexie version 1. Chỉ index những trường cần truy vấn.

```
formVersions : 'id, formId'
responses    : 'id, formVersionId, syncState, updatedAt'
attachments  : 'id, responseId'
outbox       : '++seq, &opId, entityId, status'
conflicts    : 'id, responseId'
meta         : 'key'
```

### 5.1 `formVersions`
`{ id, formId, formTitle, versionNo, schema, publishedAt, serverSeq }` — chỉ version `published`.

### 5.2 `responses`
| Trường | Ý nghĩa |
|---|---|
| id | UUIDv7 |
| formVersionId | |
| data | dữ liệu hiện tại ở local (đã gồm thay đổi chưa sync) |
| syncState | `draft` \| `pending` \| `synced` \| `conflict` \| `failed` |
| serverVersion | version server đã biết gần nhất; `null` nếu chưa từng lên server |
| baseData | ảnh chụp `data` tại `serverVersion` — **base cho merge 3-way**; `null` nếu chưa lên server |
| deleted | `true` khi đã xoá local và đang chờ gửi op xoá |
| createdAt / updatedAt | giờ thiết bị, **chỉ để hiển thị** |
| lastChangedBy | `{ id, name, at }` từ server (hiển thị) |

### 5.3 `attachments`
`{ id, responseId, fieldId, filename, mime, size, sha256, blob: Blob | null, thumbnail: Blob | null, uploaded: boolean }` — `blob` bị xoá (null) sau khi upload được xác nhận (ảnh vẫn giữ `thumbnail`).

### 5.4 `outbox`
| Trường | Ý nghĩa |
|---|---|
| seq | auto-increment — thứ tự FIFO |
| opId | UUID, idempotency key (unique) |
| entityType | `response` \| `attachment` |
| entityId | responseId hoặc attachmentId |
| opType | `upsert` \| `delete` \| `resolution` (response), `upload` (attachment) — xem [SYNC §3.1](SYNC.md#31-loại-op) |
| payload | `{ formVersionId, data }` với upsert; không có với delete/upload/resolution (upload đọc Blob từ `attachments`) |
| resolution | metadata quyết định conflict gửi kèm (xem [API §5.2](API.md#52-put-apiresponsesid)) |
| dependsOn | `opId[]` phải `done` trước (op upload của các file được tham chiếu) |
| status | `pending` \| `in_flight` \| `failed` \| `conflict` \| `done` |
| attempts | số lần đã gửi |
| nextAttemptAt | epoch ms |
| lastError | `{ kind, httpStatus?, code?, message, at }` |
| createdAt | |

**Không lưu `baseVersion` trong op** — lấy từ `responses.serverVersion` tại thời điểm gửi ([SYNC §3](SYNC.md#3-outbox)). Op `done` được xoá ngay sau khi xử lý xong.

### 5.5 `conflicts`
| Trường | Ý nghĩa |
|---|---|
| id | `conflictId` (UUID) — dùng lại làm `conflict_log.id` |
| responseId | |
| kind | `field` \| `edit_vs_delete` \| `delete_vs_edit` |
| baseData / localData / remoteData | ba phía của merge |
| remoteVersion | version server lúc 409 |
| conflictFields | `[{ fieldId, label, base, local, remote, localChangedAt, remoteChangedBy: {id, name, deviceId}, remoteChangedAt }]` |
| autoMerged | `[{ fieldId, label, from: 'local' \| 'remote' }]` |
| choices | lựa chọn đang làm dở của user |
| createdAt | |

### 5.6 `meta` (key → value)
| Key | Giá trị |
|---|---|
| `auth` | `{ token, user: {id, name, role}, expiresAt }` |
| `deviceId` | UUID sinh lần đầu, gửi qua header `X-Device-Id` |
| `syncCursor` | `server_seq` lớn nhất đã pull (mặc định 0) |
| `lastSyncAt` | epoch ms |
| `syncPaused` | `null` \| `'auth_required'` |

## 6. Bất biến (invariants)

1. `form_versions` có `status = published` không bao giờ bị sửa `schema`.
2. `responses.version` tăng đúng 1 mỗi lần ghi; mỗi version có đúng 1 dòng `response_revisions`.
3. Không hard delete `responses`; xoá = tombstone có version.
4. Mỗi `op_id` áp dụng tối đa một lần (ràng buộc PK `processed_ops`, ghi cùng transaction).
5. `server_seq` tăng theo đúng thứ tự commit (advisory lock).
6. Ở client: mọi thay đổi `responses`/`attachments` và op tương ứng trong `outbox` nằm trong **một** transaction Dexie.
7. Ở client: một response có tối đa **một** op chưa gửi (`attempts = 0`) — các thay đổi tiếp theo được gộp vào op đó.
