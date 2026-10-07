import Dexie, { type EntityTable } from 'dexie';
import type { ConflictResponse, FormSchema, MergeResult, RecordData, RecordLevelConflict } from '@field-survey/shared';

export type SyncState = 'synced' | 'pending' | 'conflict' | 'error';

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
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class SurveyDb extends Dexie {
  forms!: EntityTable<FormSchema & { key: string }, 'key'>;
  records!: EntityTable<LocalRecord, 'id'>;
  outbox!: EntityTable<OutboxOp, 'seq'>;
  conflicts!: EntityTable<ConflictEntry, 'recordId'>;
  attachments!: EntityTable<LocalAttachment, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor() {
    super('field-survey');
    // Đổi schema: thêm this.version(2).stores(...) kèm .upgrade(), không sửa version(1)
    this.version(1).stores({
      forms: 'key, id',
      records: 'id, formId, syncState, updatedAt',
      outbox: '++seq, &opId, recordId, nextAttemptAt',
      conflicts: 'recordId',
      attachments: 'id, recordId, uploadState',
      meta: 'key',
    });
  }
}

export const db = new SurveyDb();

export const formKey = (id: string, version: number) => `${id}@${version}`;

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export function setMeta(key: string, value: unknown) {
  return db.meta.put({ key, value });
}
