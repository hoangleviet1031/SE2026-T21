# SYNC — Offline storage, sync queue, retry và conflict resolution

> Tài liệu kỹ thuật quan trọng nhất (owner: **B**). Mô hình nhất quán và lý do: [ADR-001](ADR/consistency-model.md). Cấu trúc dữ liệu: [DATA_MODEL.md](DATA_MODEL.md). Hợp đồng: [API.md](API.md). Hằng số: [SPEC §4](SPEC.md#4-giá-trị-chuẩn-constants).

## 1. Tổng quan

```
 UI ──(transaction)──► IndexedDB: responses + attachments + outbox
                                   │
         trigger ──► Sync Engine ──┤ 1. PUSH: lấy op kế tiếp → gửi → phân loại kết quả
         (Web Lock 'sync')         │ 2. PULL: /sync/pull từ cursor → áp dụng
                                   ▼
                      409 → threeWayMerge → tự gộp | Conflict UI → op mới
```

Nguyên tắc: **ghi local luôn thành công ngay** (không chờ mạng); đồng bộ là việc nền, có thể thất bại và thử lại bao nhiêu lần cũng an toàn (idempotent).

## 2. Offline storage

| Dữ liệu | Nơi lưu | Ghi chú |
|---|---|---|
| App shell (HTML/JS/CSS/icon) | Cache Storage (SW precache) | [ARCHITECTURE §6](ARCHITECTURE.md#6-service-worker--phạm-vi) |
| Form versions đã publish | IndexedDB `formVersions` | Nhận qua pull |
| Phiếu (nháp + đã lưu) | IndexedDB `responses` | Nháp không bao giờ vào outbox |
| File đính kèm | IndexedDB `attachments` (Blob) | Blob gốc bị bỏ sau upload, giữ thumbnail ảnh |
| Hàng đợi | IndexedDB `outbox` | Op `done` bị xoá ngay |
| Xung đột chờ giải quyết | IndexedDB `conflicts` | |
| Token, cursor, deviceId | IndexedDB `meta` | Không dùng localStorage |

- Sau đăng nhập gọi `navigator.storage.persist()`; hiển thị `navigator.storage.estimate()` ở S4.
- Ghi thất bại do `QuotaExceededError` → transaction rollback, UI báo "Bộ nhớ thiết bị đầy", không có dữ liệu nửa vời.
- Logout: chặn nếu `outbox` không rỗng; nếu cho phép → `db.delete()` toàn bộ.

## 3. Outbox

### 3.1 Loại op
| `entityType` | `opType` | Gửi bằng | Payload |
|---|---|---|---|
| `attachment` | `upload` | `PUT /api/attachments/:id` | đọc Blob từ `attachments` |
| `response` | `upsert` | `PUT /api/responses/:id` | `{ formVersionId, data }` (+ `resolution?`) |
| `response` | `delete` | `DELETE /api/responses/:id` | (+ `resolution?`) |
| `response` | `resolution` | `POST /api/conflict-resolutions` | `{ resolution }` — quyết định không ghi dữ liệu |

**`baseVersion` không lưu trong op**: engine đọc `responses.serverVersion` **tại thời điểm gửi**. Nhờ FIFO theo entity, op sau luôn dùng version mà op trước vừa nhận về.

### 3.2 Hành động local → outbox (mỗi dòng là **một** transaction Dexie)

"Op chưa gửi" = op của entity có `status = pending` và `attempts = 0`.

| Hành động | Điều kiện | Ghi `responses` / `attachments` | Outbox |
|---|---|---|---|
| Lưu phiếu mới | — | `syncState = pending`, `serverVersion = null`, `baseData = null` | Thêm op `upload` cho từng file; thêm op `upsert` với `dependsOn` = các op upload |
| Sửa phiếu | Có op `upsert` chưa gửi | Cập nhật `data` | **Gộp**: thay `payload` op đó (giữ `opId`); thêm op upload cho file mới, nối vào `dependsOn` |
| Sửa phiếu | Không có op chưa gửi | Cập nhật `data`, `syncState = pending` | Thêm op `upsert` mới |
| Gỡ file chưa upload | Op upload của file chưa gửi | Xoá bản ghi `attachments` | Xoá op upload, bỏ khỏi `dependsOn` |
| Xoá phiếu | `serverVersion = null` **và** mọi op của entity đều chưa gửi | Xoá hẳn phiếu + file | Xoá mọi op của entity |
| Xoá phiếu | Có op `upsert` chưa gửi, `serverVersion ≠ null` | `deleted = true`, `syncState = pending` | Đổi op đó thành `delete` |
| Xoá phiếu | Còn lại | `deleted = true`, `syncState = pending` | Thêm op `delete` |
| Sửa phiếu đang "Lỗi" | Op `failed` | Cập nhật `data`, `syncState = pending` | Thay payload, `status = pending`, `attempts = 0`, **`opId` mới** |
| Huỷ thay đổi phiếu "Lỗi" | Op `failed` | `data = baseData`, `syncState = synced`; nếu `serverVersion = null` thì xoá hẳn | Xoá op `failed` (và op upload liên quan chưa gửi) |

Vì sao chỉ gộp op **chưa gửi**: op đã gửi có thể đã được server áp dụng mà client không biết (mất response); sửa payload của nó sẽ khiến lần gửi lại mang nội dung khác cùng `opId` → `IDEMPOTENCY_KEY_REUSED`.

## 4. Sync engine

### 4.1 Trigger
- Sự kiện `online`; `visibilitychange` → visible; khởi động app; timer mỗi `SYNC_INTERVAL` (30 s) khi online; nút "Đồng bộ ngay"; ngay sau khi lưu local (nếu online).
- Timer phụ đặt tới `nextAttemptAt` sớm nhất của op đang chờ backoff.
- **Không** dùng Background Sync API ([ADR-003](ADR/sync-trigger-in-app.md)).

### 4.2 Vòng chạy
```
runSync():
  if !navigator.onLine or meta.syncPaused → return
  navigator.locks.request('sync', { ifAvailable: true }, async lock => {
    if !lock → return                      // tab khác đang sync
    reset mọi op in_flight → pending       // op mồ côi do tab/app bị đóng giữa chừng (R7)
    while (op = nextOp()) and online and !syncPaused:
      dispatch(op)
    if !syncPaused: pull()
    meta.lastSyncAt = now
  })
```

### 4.3 Chọn op kế tiếp
```
nextOp():
  for op in outbox where status = 'pending' and nextAttemptAt <= now, order by seq:
    if tồn tại op khác cùng entityId có seq nhỏ hơn → skip   // FIFO theo entity; op trước failed/conflict chặn entity
    if bất kỳ opId trong dependsOn còn trong outbox → skip   // file phải lên trước phiếu
    return op
```
Op `done` bị xoá khỏi outbox ngay → "còn trong outbox" nghĩa là "chưa xong". Entity bị chặn không làm chặn entity khác.

### 4.4 Gửi
1. Transaction: `status = in_flight`, `attempts += 1`.
2. Tạo request; `baseVersion = responses[entityId].serverVersion`; headers `Idempotency-Key: opId`, `X-Device-Id`. Timeout 30 s (upload 120 s).
3. `shared.classifyHttpResult(result)` → xử lý theo §5 trong một transaction.

## 5. Phân loại kết quả và retry

| Kết quả | Loại | Xử lý op | Xử lý phiếu / engine |
|---|---|---|---|
| 2xx | success | Xoá op | Xem §5.1 |
| Lỗi mạng khi `navigator.onLine = false` | offline | `pending`, `nextAttemptAt = now` (không backoff) | Dừng vòng; chờ sự kiện `online` |
| Lỗi mạng / timeout / 5xx / 429 | retry | `pending`, `nextAttemptAt = now + backoff(attempts)`, ghi `lastError` | Tiếp op khác. Nếu `attempts ≥ 5` → UI cảnh báo |
| 401 | auth | `pending` | `meta.syncPaused = 'auth_required'`, dừng vòng, UI yêu cầu đăng nhập lại |
| 409 `VERSION_CONFLICT` | conflict | Xem §9 | |
| 400 / 403 / 404 / 413 / 415 / 422 | permanent | `failed`, ghi `lastError` | `syncState = failed`, hiển thị thông điệp |

**Backoff** (`shared.computeBackoff`): `delay = min(BACKOFF_CAP, BACKOFF_BASE × 2^(attempts−1)) × random(0.5, 1)` — 2 s, 4 s, 8 s … tối đa 5 phút; jitter tránh nhiều thiết bị dồn cùng lúc. Nếu server trả `Retry-After` thì dùng giá trị lớn hơn. Retry **không giới hạn số lần** với lỗi tạm thời. Khi offline engine không gửi gì, nên `attempts` không tăng (R1).

### 5.1 Xử lý thành công
| Op | Cập nhật local |
|---|---|
| `upload` | `attachments.uploaded = true`; `blob = null` (ảnh giữ `thumbnail`) |
| `upsert` | `serverVersion = dto.version`; `baseData = dto.data`; `lastChangedBy` từ DTO; nếu entity không còn op nào → `syncState = synced`. **Không** ghi đè `data` (user có thể đã sửa tiếp trong lúc gửi — thay đổi đó nằm ở op sau) |
| `delete` | Xoá phiếu + file khỏi local |
| `resolution` | Không có gì thêm |

## 6. Pull

```
pull():
  loop:
    res = GET /api/sync/pull?cursor=meta.syncCursor&limit=200
    transaction:
      upsert res.formVersions vào formVersions
      for dto in res.responses:
        if outbox có op cho dto.id → bỏ qua        // thay đổi local thắng tạm thời; 409 lúc push sẽ xử lý
        elif dto.deleted → xoá phiếu + file local
        else → put { data, serverVersion = dto.version, baseData = dto.data, syncState = synced, lastChangedBy }
               + tạo bản ghi attachments (metadata, blob = null, uploaded = true) nếu chưa có
      meta.syncCursor = res.nextCursor
    until !res.hasMore
```
Form version luôn có `server_seq` nhỏ hơn mọi phiếu tham chiếu nó (publish trước khi có phiếu) → pull theo thứ tự seq luôn nhận form trước phiếu.

## 7. Server xử lý ghi

Mọi `PUT/DELETE /responses/:id`, `POST /conflict-resolutions` và publish form version:

```
BEGIN
  pg_advisory_xact_lock(SYNC_LOCK_KEY)          -- tuần tự hoá ghi → server_seq tăng theo thứ tự commit
  p = SELECT FROM processed_ops WHERE op_id = :key
  if p: return (p.request_hash = hash(req)) ? p.result : 422 IDEMPOTENCY_KEY_REUSED
  row = SELECT FROM responses WHERE id = :id FOR UPDATE
  kiểm tra quyền, form version published, validate data theo schema, attachment được tham chiếu tồn tại
  áp dụng quy tắc version (API §5.2 / §5.3) → nếu lệch: ROLLBACK, 409 { current, revisions > baseVersion }
  INSERT/UPDATE responses: version + 1, server_seq = nextval('sync_seq'), updated_by, updated_at
  INSERT response_revisions (version, data, deleted, changed_by, device_id, op_id)
  if resolution: INSERT conflict_log ON CONFLICT (id) DO NOTHING
  INSERT processed_ops (op_id, user_id, request_hash, 200, result)
COMMIT
```

- Ghi `processed_ops` **cùng transaction** với dữ liệu → hoặc cả hai, hoặc không gì cả. Gửi lại sau khi mất response (R3) nhận đúng kết quả cũ.
- Chỉ lưu kết quả 2xx; 4xx/409 không được lưu (tính lại mỗi lần).
- Advisory lock toàn cục làm ghi tuần tự: chấp nhận ở quy mô MVP (≤ 10 user đồng thời), đổi lại pull theo cursor không bao giờ bỏ sót.

## 8. Merge 3-way

`shared.threeWayMerge(base, local, remote) → { merged, autoMerged[], conflicts[] }`, so sánh bằng `valuesEqual` (chuẩn hoá, mảng = tập hợp — [DATA_MODEL §3](DATA_MODEL.md#3-response-data)). `base = null` được coi như `{}`.

Với mỗi `fieldId` trong hợp các key của ba phía:

| Điều kiện (b = base, l = local, r = remote) | Kết quả field | Ghi nhận |
|---|---|---|
| `l = r` | `r` | không conflict (C2) |
| `l = b`, `r ≠ b` | `r` | `autoMerged: from remote` |
| `r = b`, `l ≠ b` | `l` | `autoMerged: from local` |
| `l ≠ b`, `r ≠ b`, `l ≠ r` | — | **conflict** (C3, C7) |

Đơn vị merge là **field**. Field `attachment` là một giá trị (tập id) như mọi field khác — không gộp từng file (C7). Hàm thuần, không I/O → unit test đầy đủ C1–C7.

## 9. Luồng conflict

### 9.1 Khi op `upsert` nhận 409
1. `remote = current`. Nếu `remote.deleted` → conflict `edit_vs_delete` (§9.3).
2. `m = threeWayMerge(response.baseData, op.payload.data, remote.data)`.
3. Nếu `m.conflicts` rỗng:
   - `m.merged = remote.data` → không cần ghi: phiếu = remote, `serverVersion = remote.version`, `baseData = remote.data`, xoá op, `synced`.
   - Ngược lại → **tự gộp**, trong một transaction: `data = m.merged`, `serverVersion = remote.version`, `baseData = remote.data`; op: `payload.data = m.merged`, `resolution = { kind: field, autoMerged: true, decision: merge, … }`, **`opId` mới**, `status = pending`, `attempts = 0`. Hiện thông báo "Đã tự gộp thay đổi của {người}".
4. Nếu có conflict → tạo bản ghi `conflicts` (`kind = field`, kèm lời giải thích §9.4); op `status = conflict`; phiếu `syncState = conflict`.

### 9.2 Khi op `delete` nhận 409
- `remote.deleted` → cả hai cùng muốn xoá: xoá local, xoá op, không log.
- Ngược lại → conflict `delete_vs_edit`.

### 9.3 Quyết định của người dùng (S5)
Sau khi chọn, trong một transaction: xoá bản ghi `conflicts`; `serverVersion = remote.version`, `baseData = remote.data`; op cũ được thay bằng op mới với **`opId` mới**:

| Kind | Lựa chọn | Kết quả local | Op mới |
|---|---|---|---|
| `field` | Chọn từng field; kết quả ≠ `remote.data` | `data` = kết quả | `upsert` + `resolution(decision: merge)` |
| `field` | Kết quả = `remote.data` (chọn toàn bộ server) | `data = remote.data` | `resolution(decision: merge)` |
| `edit_vs_delete` | Khôi phục bằng bản của tôi | giữ `data` local | `upsert` + `resolution(restore)` → server khôi phục tombstone |
| `edit_vs_delete` | Chấp nhận xoá | xoá phiếu local | `resolution(accept_delete)` |
| `delete_vs_edit` | Vẫn xoá | `deleted = true` | `delete` + `resolution(delete)` |
| `delete_vs_edit` | Giữ bản server | `data = remote.data`, `deleted = false` | `resolution(keep_server)` |

Op mới đi qua hàng đợi như mọi op khác (offline vẫn giải quyết được, gửi khi có mạng). Nếu server lại thay đổi trước khi op mới tới → 409 mới → vòng conflict mới (C9), không mất dữ liệu.

### 9.4 Lời giải thích (`shared.explain`)
Từ `revisions` (version > baseVersion, tăng dần) tìm, với mỗi field, **revision cuối cùng làm đổi giá trị** của field đó → `changedBy`, `deviceId`, `changedAt`.
- Nếu `changedBy.id` = mình và `deviceId` ≠ thiết bị này → "Bạn (trên thiết bị khác)".
- Thời điểm phía local = `responses.updatedAt` (lần lưu cuối trên thiết bị).
- Mẫu: *"Bạn đổi '{label}' {base} → {local} lúc {giờ} (offline). {Tên người} đổi {base} → {remote} lúc {giờ}."*
- Giá trị hiển thị theo loại field: choice → label của option; attachment → thumbnail/số file; `null` → "(trống)".

## 10. State machine

**`responses.syncState`**
```
draft ──Lưu──► pending ──push xong, hết op──► synced ──sửa/xoá──► pending
                  │  ▲                            ▲
        409 thật  │  │ giải quyết                  │ pull (cập nhật / tombstone → xoá local)
                  ▼  │                             │
               conflict      pending ──4xx──► failed ──sửa lại──► pending
                                              failed ──huỷ thay đổi──► synced | (xoá nếu chưa từng lên server)
```

**`outbox.status`**
```
pending ──gửi──► in_flight ──2xx──► (xoá)
   ▲                 │──lỗi tạm thời / 401 / offline──► pending (có hoặc không backoff)
   │                 │──409 thật──► conflict ──giải quyết──► (thay bằng op mới, opId mới)
   │                 │──4xx vĩnh viễn──► failed ──sửa lại──► pending (opId mới) | huỷ ──► (xoá)
   └── app khởi động lại / lấy được lock: in_flight mồ côi ──► pending
```

## 11. Attachments trong sync

- Mỗi file = 1 op `upload`, gửi trước op phiếu tham chiếu nó (`dependsOn`). Upload idempotent theo `id + sha256` ([ADR-004](ADR/attachments.md)).
- Upload lỗi tạm thời → retry như op khác; phiếu phụ thuộc chờ (R6).
- Upload lỗi vĩnh viễn (413/415/422) → op `failed`; phiếu bị chặn; người dùng gỡ file khỏi phiếu (§3.2) để mở chặn.
- Phiếu nhận qua pull chỉ có metadata file; ảnh đầy đủ tải khi online qua `url` có chữ ký.

## 12. Trường hợp biên đã tính

| Tình huống | Hành vi |
|---|---|
| Sửa phiếu trong lúc op của nó đang `in_flight` | Tạo op mới sau op đang gửi; op mới dùng `serverVersion` mà op trước trả về |
| Hai tab cùng mở | Web Lock chỉ cho 1 tab sync; tab kia vẫn ghi local, UI cập nhật qua `liveQuery` (R8) |
| Đóng app khi đang gửi | Op `in_flight` → `pending` khi lấy lock lần sau; gửi lại cùng `opId` (R7) |
| Token hết hạn khi offline | Vẫn ghi local; lúc online nhận 401 → dừng, đăng nhập lại, tiếp tục (R5) |
| Cùng user, hai thiết bị | Phân biệt bằng `device_id` trong revision; conflict như với người khác |
| Đồng hồ thiết bị sai | Không ảnh hưởng — phân xử chỉ dùng `version`; timestamp chỉ hiển thị |
| Admin publish version mới khi surveyor offline | Phiếu theo version cũ vẫn hợp lệ (C8); phiếu mới sau pull dùng version mới |
| Bản app mới trong lúc có op chờ | Chỉ hiện banner; dữ liệu IndexedDB giữ nguyên qua update (E6). Thay đổi schema Dexie phải có migration |
