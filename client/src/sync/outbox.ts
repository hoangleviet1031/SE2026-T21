import type { RecordData } from '@field-survey/shared';
import { db, type LocalRecord } from '../db/db';

export function getSurveyorName(): string {
  return localStorage.getItem('surveyorName') || 'surveyor';
}

/**
 * Lưu bản ghi cục bộ và đưa vào outbox trong cùng một transaction,
 * nên không bao giờ có bản ghi đã sửa mà không có op tương ứng.
 */
export async function saveRecordLocally(input: {
  id: string;
  formId: string;
  formVersion: number;
  data: RecordData;
  deleted?: boolean;
}): Promise<void> {
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
        status: existing?.syncState === 'conflict' ? 'blocked' : 'queued',
      });
    }
  });
}
