import type { RecordData } from '@field-survey/shared';
import type { LocalRecord, OutboxOp, ProjectDb } from '../db/projectDb';

/**
 * Lưu bản ghi cục bộ và đưa vào outbox trong cùng một transaction,
 * nên không bao giờ có bản ghi đã sửa mà không có op tương ứng.
 */
export async function saveRecordLocally(
  db: ProjectDb,
  input: {
    id: string;
    formId: string;
    formVersion: number;
    data: RecordData;
    deleted?: boolean;
  },
): Promise<void> {
  await db.transaction('rw', db.records, db.outbox, async () => {
    const existing = await db.records.get(input.id);
    const now = new Date().toISOString();
    const deleted = input.deleted ?? false;
    const record: LocalRecord = {
      id: input.id,
      formId: input.formId,
      formVersion: input.formVersion,
      data: input.data,
      deleted,
      baseData: existing?.baseData ?? {},
      baseVersion: existing?.baseVersion ?? 0,
      syncState: existing?.syncState === 'conflict' ? 'conflict' : 'pending',
      updatedAt: now,
    };
    await db.records.put(record);

    let ops = await db.outbox.where('recordId').equals(input.id).sortBy('seq');
    const createdAt = earliestCreatedAt(ops) ?? Date.now();

    // Op failed đã bị server từ chối (4xx, server không lưu key cho response lỗi), nên bỏ đi
    // được: dữ liệu mới của phiếu nằm trong op mới với opId mới, không dùng lại key cũ cho dữ
    // liệu khác (CLAUDE.md bất biến 3, design §5.1 "error → pending").
    const failed = ops.filter((op) => op.status === 'failed');
    if (failed.length > 0) {
      // seq!: op đọc từ CSDL nên luôn có khoá tự tăng
      await db.outbox.bulkDelete(failed.map((op) => op.seq!));
      ops = ops.filter((op) => op.status !== 'failed');
    }

    // Gộp vào op cuối nếu op đó chưa từng được gửi. Op đã gửi (attempts > 0) có thể
    // đã được server áp dụng, nên phải giữ nguyên opId và thêm op mới phía sau.
    const last = ops[ops.length - 1];
    if (last && last.attempts === 0 && last.status === 'queued') {
      await db.outbox.update(last.seq!, { data: input.data, deleted });
    } else {
      await db.outbox.add({
        opId: crypto.randomUUID(),
        recordId: input.id,
        data: input.data,
        deleted,
        attempts: 0,
        nextAttemptAt: 0,
        // Đang chờ giải quyết conflict thì op mới cũng phải chờ
        status: existing?.syncState === 'conflict' ? 'blocked' : 'queued',
        createdAt,
      });
    }
  });
}

/** `createdAt` sớm nhất trong các op của một phiếu, để giữ mốc "chưa đồng bộ từ lúc nào". */
export function earliestCreatedAt(ops: OutboxOp[]): number | undefined {
  const times = ops.map((op) => op.createdAt).filter((t): t is number => t !== undefined);
  return times.length > 0 ? Math.min(...times) : undefined;
}

/**
 * Nút "Thử lại" trên phiếu "Lỗi": gửi lại đúng op đã bị từ chối, cùng opId và cùng dữ liệu.
 * Giữ nguyên `attempts` (≥ 1 vì lần bị 4xx đã tính là một lần gửi), nên sửa phiếu sau đó sẽ
 * thêm op mới thay vì sửa op này (bất biến 3). Nơi gọi tự gọi syncNow.
 */
export async function retryFailed(db: ProjectDb, recordId: string): Promise<void> {
  await db.transaction('rw', db.records, db.outbox, async () => {
    const failed = await db.outbox
      .where('recordId')
      .equals(recordId)
      .filter((op) => op.status === 'failed')
      .toArray();
    if (failed.length === 0) return;
    for (const op of failed) {
      // seq!: op đọc từ CSDL nên luôn có khoá tự tăng
      await db.outbox.update(op.seq!, { status: 'queued', nextAttemptAt: 0, lastError: undefined });
    }
    await db.records.update(recordId, { syncState: 'pending', lastError: undefined });
  });
}
