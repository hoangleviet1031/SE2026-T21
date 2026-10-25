import type { ProjectDb } from '../db/projectDb';
import { downloadJson } from '../download';
import { syncNow } from '../sync/engine';
import { exportRecordJson } from '../sync/exportJson';
import { retryFailed } from '../sync/outbox';

// Phiếu "Lỗi" (server từ chối, design §8): câu lỗi + [Thử lại] + [Xuất JSON phiếu này]. Dùng chung cho
// dòng phiếu ở trang chủ và đầu trang điền phiếu (ui.md màn hình 4).
export function RecordErrorBox({ db, recordId, lastError }: { db: ProjectDb; recordId: string; lastError?: string }) {
  return (
    <div className="record-error">
      <span data-testid="sync-error">{lastError ?? 'Máy chủ từ chối phiếu này'}</span>
      <div className="acts">
        <button className="primary" onClick={() => void retry(db, recordId)}>
          Thử lại
        </button>
        <button onClick={() => void downloadRecord(db, recordId)}>Xuất JSON phiếu này</button>
      </div>
    </div>
  );
}

async function retry(db: ProjectDb, recordId: string) {
  await retryFailed(db, recordId);
  void syncNow();
}

/** Tải phiếu về máy dưới dạng file .json (design §8, phiếu "Lỗi"). */
async function downloadRecord(db: ProjectDb, recordId: string) {
  downloadJson(`phieu-${recordId}.json`, await exportRecordJson(db, recordId));
}
