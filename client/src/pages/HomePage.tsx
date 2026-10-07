import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncState } from '../db/db';
import { navigate } from '../useHashRoute';

const STATE_LABEL: Record<SyncState, string> = {
  synced: 'Đã đồng bộ',
  pending: 'Chờ đồng bộ',
  conflict: 'Cần xử lý xung đột',
  error: 'Lỗi',
};

export function HomePage() {
  const forms = useLiveQuery(() => db.forms.toArray(), []) ?? [];
  const records = useLiveQuery(() => db.records.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const latestForms = Object.values(
    Object.fromEntries(forms.sort((a, b) => a.version - b.version).map((f) => [f.id, f])),
  );

  return (
    <>
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
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
