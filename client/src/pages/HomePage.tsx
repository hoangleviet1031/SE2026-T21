import { useLiveQuery } from 'dexie-react-hooks';
import type { MeResponse } from '@field-survey/shared';
import { RemovedProjectBanners } from '../components/RemovedProjectBanners';
import { getAccountValue } from '../db/accountDb';
import { useCurrentProjectDb } from '../db/current';
import { downloadJson } from '../download';
import type { ProjectDb, SyncState } from '../db/projectDb';
import { syncNow } from '../sync/engine';
import { exportRecordJson } from '../sync/exportJson';
import { retryFailed } from '../sync/outbox';
import { staleWarnings } from '../sync/staleWarnings';
import { navigate } from '../useHashRoute';

const STATE_LABEL: Record<SyncState, string> = {
  draft: 'Nháp',
  synced: 'Đã đồng bộ',
  pending: 'Chờ đồng bộ',
  conflict: 'Cần xử lý xung đột',
  error: 'Lỗi',
};

export function HomePage() {
  const db = useCurrentProjectDb();
  return (
    <>
      <RemovedProjectBanners />
      {db === null ? <NoProject /> : db && <ProjectHome db={db} />}
    </>
  );
}

/**
 * Chưa có dự án active nào. Chưa từng nhận /me thì đang tải (vừa nhập mã, hoặc mất mạng ngay sau
 * đó); đã nhận mà không có dự án thì người dùng phải nhờ giám sát viên thêm vào (design §4.7 🕘).
 */
// TODO(TV1-15): bản mới vào màn hình Tổ chức (ui.md màn hình 9) thay cho câu này (ADR 0003)
function NoProject() {
  const user = useLiveQuery(() => getAccountValue<MeResponse['user'] | null>('user', null), []);
  if (user === undefined) return null;
  if (user === null) return <p data-testid="no-project">Đang tải danh sách dự án…</p>;
  return (
    <p data-testid="no-project">
      Bạn chưa được thêm vào dự án nào. Gửi mã người dùng <code>{user.id}</code> cho giám sát viên.
    </p>
  );
}

function ProjectHome({ db }: { db: ProjectDb }) {
  const forms = useLiveQuery(async () => db.forms.toArray(), [db]) ?? [];
  const records = useLiveQuery(async () => db.records.orderBy('updatedAt').reverse().toArray(), [db]) ?? [];
  // Tính lại mỗi khi outbox đổi; giờ thiết bị chỉ để hiển thị cảnh báo (design §5.2)
  const warnings = useLiveQuery(async () => staleWarnings(await db.outbox.toArray(), Date.now()), [db]);
  const latestForms = Object.values(
    Object.fromEntries(forms.sort((a, b) => a.version - b.version).map((f) => [f.id, f])),
  );

  return (
    <>
      {warnings?.staleRecords ? (
        <p className="warning" role="status">
          ⚠ Có {warnings.staleRecords} phiếu chưa đồng bộ hơn 1 ngày
        </p>
      ) : null}
      {warnings?.serverFailing && (
        <p className="warning" role="status">
          ⚠ Máy chủ đang lỗi, sẽ thử lại
        </p>
      )}
      <section>
        <h2>Biểu mẫu</h2>
        {latestForms.length === 0 && <p>Chưa có biểu mẫu. Kết nối mạng một lần để tải về.</p>}
        <ul className="list">
          {latestForms.map((f) => (
            <li key={f.key}>
              <span>{f.title}</span>
              <button onClick={() => navigate('fill', f.id, crypto.randomUUID())}>Tạo phiếu mới</button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Phiếu đã nhập</h2>
        <ul className="list" data-testid="records">
          {records
            .filter((r) => !r.deleted)
            .map((r) => (
              <li key={r.id}>
                <a href={`#/fill/${r.formId}/${r.id}`}>{String(Object.values(r.data)[0] ?? r.id)}</a>
                {r.syncState === 'conflict' ? (
                  <a className="badge conflict" href={`#/conflict/${r.id}`}>
                    {STATE_LABEL[r.syncState]}
                  </a>
                ) : (
                  <span className={`badge ${r.syncState}`} data-testid="sync-state">
                    {STATE_LABEL[r.syncState]}
                  </span>
                )}
                {r.syncState === 'error' && (
                  <div className="record-error">
                    <span data-testid="sync-error">{r.lastError ?? 'Máy chủ từ chối phiếu này'}</span>
                    <button onClick={() => void retry(db, r.id)}>Thử lại</button>
                    <button onClick={() => void downloadRecord(db, r.id)}>Xuất JSON phiếu này</button>
                  </div>
                )}
              </li>
            ))}
        </ul>
      </section>
    </>
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
