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
  status: 'queued' | 'blocked' | 'failed';
  lastError?: string;
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
  /** TODO(Thành viên 3): chunk đã upload, để tiếp tục khi mất mạng */
  uploadedChunks: number[];
  uploadState: 'pending' | 'uploading' | 'done';
  /** Thời điểm được thử upload lại (backoff), TV3-06 dùng (design §5.6) */
  nextAttemptAt?: number;
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
