import { validateRecord, type RecordData } from '@field-survey/shared';
import { formKey, type LocalRecord, type ProjectDb } from '../db/projectDb';

/**
 * Lưu bản ghi cục bộ và đưa vào outbox trong cùng một transaction,
 * nên không bao giờ có bản ghi đã sửa mà không có op tương ứng.
 *
 * Phiếu chưa qua validate thì lưu thành nháp, không tạo op (design §4.1, §5.1).
 * Trả lỗi theo id trường; object rỗng nghĩa là phiếu hợp lệ và đã vào outbox.
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
    const now = new Date().toISOString();
    const deleted = input.deleted ?? false;
    const inConflict = existing?.syncState === 'conflict';

    // Xoá phiếu thì không cần validate (xoá được cả nháp). Phiếu đang conflict giữ đường cũ,
    // việc khoá sửa khi conflict thuộc TV2-10/TV3-07.
    let errors: Record<string, string> = {};
    if (!deleted && !inConflict) {
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
      syncState: inConflict ? 'conflict' : isDraft ? 'draft' : 'pending',
      updatedAt: now,
      ...(isDraft && { validationErrors: errors }),
    };
    await db.records.put(record);

    // Nháp không tạo hay sửa op. Op cũ chưa gửi (dữ liệu hợp lệ trước đó) vẫn giữ để gửi được;
    // không xoá vì đó là thay đổi chưa đồng bộ của người dùng (CLAUDE.md bất biến 1).
    if (isDraft) return errors;

    // Gộp vào op cuối nếu op đó chưa từng được gửi. Op đã gửi (attempts > 0) có thể
    // đã được server áp dụng, nên phải giữ nguyên opId và thêm op mới phía sau.
    const ops = await db.outbox.where('recordId').equals(input.id).sortBy('seq');
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
        status: inConflict ? 'blocked' : 'queued',
      });
    }
    return errors;
  });
}
