import type { FieldValue, RecordData } from './types';

// Three-way merge theo từng trường. Xem docs/adr/0001-consistency-model.md.
//
//   base   = dữ liệu ở baseVersion (bản client đã sửa dựa trên)
//   local  = dữ liệu client muốn gửi
//   remote = dữ liệu hiện tại trên server

export interface FieldConflict {
  field: string;
  base: FieldValue | undefined;
  local: FieldValue | undefined;
  remote: FieldValue | undefined;
}

export interface AutoResolution {
  field: string;
  /** Bên nào thắng và lý do, để hiển thị cho người dùng */
  takenFrom: 'local' | 'remote' | 'both';
}

export interface MergeResult {
  merged: RecordData;
  conflicts: FieldConflict[];
  autoResolved: AutoResolution[];
}

export function valuesEqual(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  // Mảng (multiselect, photo) được coi là tập hợp: thứ tự không quan trọng
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export function threeWayMerge(base: RecordData, local: RecordData, remote: RecordData): MergeResult {
  const merged: RecordData = {};
  const conflicts: FieldConflict[] = [];
  const autoResolved: AutoResolution[] = [];
  const fields = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);

  for (const field of fields) {
    const b = base[field];
    const l = local[field];
    const r = remote[field];
    let value: FieldValue | undefined;

    if (valuesEqual(l, r)) {
      value = l;
      if (!valuesEqual(l, b)) autoResolved.push({ field, takenFrom: 'both' });
    } else if (valuesEqual(l, b)) {
      value = r; // chỉ server sửa
      autoResolved.push({ field, takenFrom: 'remote' });
    } else if (valuesEqual(r, b)) {
      value = l; // chỉ client sửa
      autoResolved.push({ field, takenFrom: 'local' });
    } else {
      conflicts.push({ field, base: b, local: l, remote: r });
      value = r; // tạm giữ giá trị server cho tới khi người dùng chọn
    }

    if (value !== undefined) merged[field] = value;
  }

  return { merged, conflicts, autoResolved };
}

export type RecordLevelConflict = 'none' | 'local-deleted-remote-edited' | 'local-edited-remote-deleted';

/** Xung đột mức bản ghi: một bên xoá, bên kia sửa. Luôn cần người dùng quyết định. */
export function detectDeleteConflict(
  base: RecordData,
  local: { data: RecordData; deleted: boolean },
  remote: { data: RecordData; deleted: boolean },
): RecordLevelConflict {
  if (local.deleted && !remote.deleted) {
    return threeWayMerge(base, base, remote.data).autoResolved.length > 0 ? 'local-deleted-remote-edited' : 'none';
  }
  if (!local.deleted && remote.deleted) {
    return threeWayMerge(base, local.data, base).autoResolved.length > 0 ? 'local-edited-remote-deleted' : 'none';
  }
  return 'none';
}
