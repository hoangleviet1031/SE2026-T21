import { validateRecord, type RecordData } from '@field-survey/shared';
import { formKey, type LocalRecord, type OutboxOp, type ProjectDb } from '../db/projectDb';

/**
 * Phiếu đang `conflict` là chỉ đọc cho tới khi người dùng giải quyết (ADR 0001 quy tắc 7): cho sửa
 * tiếp thì lúc áp dụng lựa chọn sẽ ghi đè phần vừa sửa. Màn hình nên không cho bấm tới đây (TV3-07);
 * lỗi này chặn ở tầng dữ liệu cho chắc, kể cả khi phiếu vừa thành `conflict` lúc form đang mở.
 */
export class RecordInConflictError extends Error {
  constructor(readonly recordId: string) {
    super(`Phiếu ${recordId} đang xung đột, cần xử lý xung đột trước khi sửa`);
    this.name = 'RecordInConflictError';
  }
}

/**
 * Lưu bản ghi cục bộ và đưa vào outbox trong cùng một transaction,
 * nên không bao giờ có bản ghi đã sửa mà không có op tương ứng.
 *
 * Phiếu chưa qua validate thì lưu thành nháp, không tạo op (design §4.1, §5.1).
 * Trả lỗi theo id trường; object rỗng nghĩa là phiếu hợp lệ và đã vào outbox.
 * Phiếu đang `conflict` thì ném `RecordInConflictError`, không ghi gì (cả lưu lẫn xoá).
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
): Promise<Record<string, string>> {
  return db.transaction('rw', db.records, db.outbox, db.forms, async () => {
    const existing = await db.records.get(input.id);
    if (existing?.syncState === 'conflict') throw new RecordInConflictError(input.id);
    const now = new Date().toISOString();
    const deleted = input.deleted ?? false;

    // Xoá phiếu thì không cần validate (xoá được cả nháp).
    let errors: Record<string, string> = {};
    if (!deleted) {
      const form = await db.forms.get(formKey(input.formId, input.formVersion));
      if (!form) throw new Error(`Không có biểu mẫu ${input.formId} phiên bản ${input.formVersion} trên máy`);
      errors = validateRecord(form, input.data);
    }
    const isDraft = Object.keys(errors).length > 0;

    const record: LocalRecord = {
      id: input.id,
      formId: input.formId,
      formVersion: input.formVersion,
      data: input.data,
      deleted,
      baseData: existing?.baseData ?? {},
      baseVersion: existing?.baseVersion ?? 0,
      syncState: isDraft ? 'draft' : 'pending',
      updatedAt: now,
      ...(isDraft && { validationErrors: errors }),
    };
    await db.records.put(record);

    // Nháp không tạo, sửa hay xoá op. Op cũ chưa gửi (dữ liệu hợp lệ trước đó) vẫn giữ để gửi được;
    // op failed cũng giữ, chỉ bỏ khi đã có dữ liệu hợp lệ thay thế ở dưới (CLAUDE.md bất biến 1).
    if (isDraft) return errors;

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
        status: 'queued',
        createdAt,
      });
    }
    return errors;
  });
}

/**
 * Xoá phiếu sau khi người dùng đã bấm xác nhận (design §5.7, bất biến 1). Một transaction gồm
 * `records`, `outbox`, `attachments`, nên không bao giờ còn phiếu đã xoá mà thiếu op xoá.
 * - `removed`: phiếu chưa thể tới server, đã xoá hẳn khỏi máy cùng mọi op và ảnh, không gửi gì.
 * - `queued`: phiếu có thể đã tới server; đánh dấu `deleted` và chờ op xoá được xác nhận.
 * - `missing`: không có phiếu này trên máy.
 * Phiếu đang `conflict` thì ném `RecordInConflictError`, không ghi gì (ADR 0001 quy tắc 7).
 */
export async function deleteRecordLocally(db: ProjectDb, recordId: string): Promise<'removed' | 'queued' | 'missing'> {
  return db.transaction('rw', db.records, db.outbox, db.attachments, async () => {
    const record = await db.records.get(recordId);
    if (!record) return 'missing';
    if (record.syncState === 'conflict') throw new RecordInConflictError(recordId);
    let ops = await db.outbox.where('recordId').equals(recordId).sortBy('seq');

    // Chỉ xoá hẳn khi chắc chắn server chưa từng nhận: chưa có version nào và chưa op nào được gửi.
    // Op đã gửi (attempts > 0, kể cả op failed) có thể đã được server ghi mà mất response; xoá hẳn
    // lúc đó sẽ để phiếu mồ côi trên server.
    const neverSent = record.baseVersion === 0 && ops.every((op) => op.attempts === 0);
    if (neverSent) {
      // seq!: op đọc từ CSDL nên luôn có khoá tự tăng
      await db.outbox.bulkDelete(ops.map((op) => op.seq!));
      await db.attachments.where('recordId').equals(recordId).delete();
      await db.records.delete(recordId);
      return 'removed';
    }

    const createdAt = earliestCreatedAt(ops) ?? Date.now();
    // Op failed bị server từ chối (4xx, server không lưu key) nên bỏ được, như saveRecordLocally.
    const failed = ops.filter((op) => op.status === 'failed');
    if (failed.length > 0) {
      // seq!: op đọc từ CSDL nên luôn có khoá tự tăng
      await db.outbox.bulkDelete(failed.map((op) => op.seq!));
      ops = ops.filter((op) => op.status !== 'failed');
    }

    // Server không được nhận dữ liệu chưa qua validate: nháp thì lấy bản hợp lệ cuối cùng, là op
    // chưa gửi nếu còn, không thì bản đã thống nhất với server. Ghi luôn vào phiếu, để nếu op xoá
    // nhận 409 thì merge cũng dùng bản hợp lệ này chứ không dùng dữ liệu nháp.
    const last = ops[ops.length - 1];
    const data = record.syncState === 'draft' ? (last?.data ?? record.baseData) : record.data;

    // Gộp op theo design §5.2: op cuối chưa gửi thì sửa nó, đã gửi thì thêm op mới phía sau.
    if (last && last.attempts === 0 && last.status === 'queued') {
      await db.outbox.update(last.seq!, { data, deleted: true });
    } else {
      await db.outbox.add({
        opId: crypto.randomUUID(),
        recordId,
        data,
        deleted: true,
        attempts: 0,
        nextAttemptAt: 0,
        status: 'queued',
        createdAt,
      });
    }
    await db.records.update(recordId, {
      data,
      deleted: true,
      syncState: 'pending',
      updatedAt: new Date().toISOString(),
      validationErrors: undefined,
      lastError: undefined,
    });
    return 'queued';
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
