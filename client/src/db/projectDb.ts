import Dexie, { type EntityTable } from 'dexie';
import type { ConflictResponse, FormSchema, MergeResult, RecordData, RecordLevelConflict } from '@field-survey/shared';

// Mỗi dự án một CSDL `field-survey-p-<projectId>`, cùng một schema (design §4.2, ADR 0002 §4).
// Chỉ mở qua `openProjectDb` trong current.ts để mỗi dự án có đúng một kết nối.

/** `draft`: lưu khi chưa qua validate, không có op (design §5.1; client TV1-05 dùng). */
export type SyncState = 'draft' | 'synced' | 'pending' | 'conflict' | 'error';

/** Bản ghi phía client. data = trạng thái mới nhất người dùng thấy. */
export interface LocalRecord {
  id: string;
  formId: string;
  formVersion: number;
  data: RecordData;
  deleted: boolean;
  /** Dữ liệu và version server lần cuối hai bên thống nhất (gốc cho three-way merge) */
  baseData: RecordData;
  baseVersion: number;
  syncState: SyncState;
  updatedAt: string;
  lastError?: string;
  /** Lỗi validate theo id trường, chỉ có khi `syncState = 'draft'` (design §4.1) */
  validationErrors?: Record<string, string>;
  /**
   * Người tạo theo server (design §6.2), có từ lần đầu nhận bản server sau TV1-17. Phiếu mới tạo
   * trên máy chưa gửi, hoặc tải về trước TV1-17, thì chưa có: coi như chưa biết.
   */
  createdBy?: string;
  createdByName?: string;
}

/** Một thao tác chờ gửi. opId đồng thời là Idempotency-Key. */
export interface OutboxOp {
  seq?: number;
  opId: string;
  recordId: string;
  /** Ảnh chụp dữ liệu tại thời điểm tạo op */
  data: RecordData;
  deleted: boolean;
  attempts: number;
  nextAttemptAt: number;
  /**
   * Không còn `blocked`: phiếu đang conflict không sửa được nên không sinh op mới (ADR 0001 quy
   * tắc 7). Op `blocked` do bản cũ tạo, nếu còn trên máy, vẫn bị pushAll bỏ qua như mọi op không
   * phải `queued` và bị xoá khi người dùng giải quyết xung đột (design §5.2).
   */
  status: 'queued' | 'failed';
  lastError?: string;
  /**
   * Lúc phiếu bắt đầu có thay đổi chưa lên server (ms, giờ thiết bị, chỉ để hiển thị cảnh báo
   * "chưa đồng bộ hơn 1 ngày", design §5.2). Giữ nguyên khi gộp hoặc thay op. Op tạo trước
   * TV2-09 không có trường này.
   */
  createdAt?: number;
}

/** Conflict cần người dùng quyết định */
export interface ConflictEntry {
  recordId: string;
  detectedAt: string;
  server: ConflictResponse['current'];
  history: ConflictResponse['history'];
  merge: MergeResult;
  recordLevel: RecordLevelConflict;
}

export interface LocalAttachment {
  id: string;
  recordId: string;
  fieldId: string;
  blob: Blob;
  mimeType: string;
  /** Chunk server đã nhận theo lần hỏi `status` gần nhất; chỉ để hiển thị, nguồn sự thật là server */
  uploadedChunks: number[];
  /** Hàng đợi ảnh (design §5.6). `uploading` bị bỏ dở (đóng tab) thì vòng sau coi như `pending`. */
  uploadState: 'pending' | 'uploading' | 'done' | 'failed';
  /** Thời điểm được thử upload lại (backoff, ms giờ thiết bị) */
  nextAttemptAt?: number;
  /** Số lần lỗi tạm thời liên tiếp, để tính backoff như op */
  attempts?: number;
  /** Số lần nhận `422 checksum_mismatch`; lần thứ hai thì `failed` (§5.6) */
  checksumFailures?: number;
  /** Câu báo lỗi khi `failed` */
  lastError?: string;
  /** Lúc chọn ảnh (ms): upload cũ trước mới sau. Ảnh lưu trước TV3-06 không có trường này. */
  createdAt?: number;
  // Các trường thêm ở TV3-06 không cần index nên không nâng version Dexie.
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const projectDbName = (projectId: string) => `field-survey-p-${projectId}`;

export class ProjectDb extends Dexie {
  forms!: EntityTable<FormSchema & { key: string }, 'key'>;
  records!: EntityTable<LocalRecord, 'id'>;
  outbox!: EntityTable<OutboxOp, 'seq'>;
  conflicts!: EntityTable<ConflictEntry, 'recordId'>;
  attachments!: EntityTable<LocalAttachment, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(readonly projectId: string) {
    super(projectDbName(projectId));
    // CSDL mới (khác tên với `field-survey` của khung), nên gộp mọi thay đổi đã chốt (draft,
    // validationErrors, attachments.nextAttemptAt) vào version 1 thay vì nâng version.
    // Từ đây đổi schema: thêm this.version(2).stores(...) kèm .upgrade(), không sửa version(1).
    this.version(1).stores({
      forms: 'key, id',
      records: 'id, formId, syncState, updatedAt',
      outbox: '++seq, &opId, recordId, nextAttemptAt',
      conflicts: 'recordId',
      attachments: 'id, recordId, uploadState, nextAttemptAt',
      meta: 'key',
    });
  }
}

export const formKey = (id: string, version: number) => `${id}@${version}`;

export async function getMeta<T>(db: ProjectDb, key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export function setMeta(db: ProjectDb, key: string, value: unknown) {
  return db.meta.put({ key, value });
}
