import { openProjectDb, projectDbExists } from '../db/current';
import type { ConflictEntry, LocalRecord, ProjectDb, SyncState } from '../db/projectDb';

// Xuất phiếu chưa gửi ra JSON để người dùng tự giữ khi không gửi lên server được: bị rút khỏi
// dự án (nút "Xuất JSON", TV1-06) hoặc phiếu "Lỗi" (nút "Xuất JSON phiếu này", design §8).
// Ảnh chỉ có id trong `data`, không kèm nội dung ảnh.

const UNSENT_STATES: SyncState[] = ['draft', 'pending', 'error', 'conflict'];

export type ExportedRecord = Pick<
  LocalRecord,
  'id' | 'formId' | 'formVersion' | 'data' | 'deleted' | 'syncState' | 'updatedAt'
>;

export interface UnsentExport {
  projectId: string;
  exportedAt: string;
  records: ExportedRecord[];
  conflicts: ConflictEntry[];
}

function toExported({ id, formId, formVersion, data, deleted, syncState, updatedAt }: LocalRecord): ExportedRecord {
  return { id, formId, formVersion, data, deleted, syncState, updatedAt };
}

function emptyExport(projectId: string): UnsentExport {
  return { projectId, exportedAt: new Date().toISOString(), records: [], conflicts: [] };
}

/** Mọi phiếu chưa gửi (nháp, chờ gửi, lỗi, xung đột) và bản server đang xung đột của một dự án. */
export async function exportUnsentJson(projectId: string): Promise<string> {
  const result = emptyExport(projectId);
  if (await projectDbExists(projectId)) {
    const db = openProjectDb(projectId);
    result.records = (await db.records.where('syncState').anyOf(UNSENT_STATES).toArray()).map(toExported);
    result.conflicts = await db.conflicts.toArray();
  }
  return JSON.stringify(result, null, 2);
}

/** Một phiếu, cùng định dạng với exportUnsentJson để nhập lại được bằng cùng một cách. */
export async function exportRecordJson(db: ProjectDb, recordId: string): Promise<string> {
  const result = emptyExport(db.projectId);
  const record = await db.records.get(recordId);
  if (record) result.records = [toExported(record)];
  const conflict = await db.conflicts.get(recordId);
  if (conflict) result.conflicts = [conflict];
  return JSON.stringify(result, null, 2);
}
