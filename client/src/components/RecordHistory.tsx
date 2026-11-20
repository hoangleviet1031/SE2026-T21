import { useRef, useState } from 'react';
import type { FormSchema } from '@field-survey/shared';
import type { LocalRecord } from '../db/projectDb';
import { apiFailure, fetchRecordHistory } from '../sync/api';
import { apiFailureText } from '../apiErrors';
import { useOnline } from '../useOnline';
import { KIND_LABEL, buildHistoryView, formatHistoryTime, type HistoryItemView } from '../recordHistory';

const OFFLINE_MSG = 'Cần kết nối để xem lịch sử sửa';
const NOT_FOUND_MSG = 'Máy chủ không có lịch sử của phiếu này hoặc bạn không được xem.';

type View =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'loaded'; items: HistoryItemView[] }
  | { kind: 'error'; message: string };

/**
 * Nút [Lịch sử sửa] ở màn hình 4 (design §4.1, ui.md màn hình 4). Ngoại lệ cần mạng của bất biến 7: lịch sử chỉ
 * có trên server, nên gọi qua api.ts khi bấm. Chỉ đọc: không ghi IndexedDB, không tạo op. Không tự thử lại,
 * bấm lại nút là tải lại (design §8). Nơi dùng đặt `key` theo id phiếu để đổi phiếu thì khối đóng lại.
 */
export function RecordHistory({
  projectId,
  record,
  form,
  forms,
}: {
  projectId: string;
  record: LocalRecord;
  form: FormSchema;
  forms: readonly FormSchema[];
}) {
  const online = useOnline();
  const [view, setView] = useState<View>({ kind: 'closed' });
  // Lần bấm mới nhất; kết quả của lần cũ (đã đóng khối hay bấm lại) bị bỏ
  const run = useRef(0);
  const open = view.kind !== 'closed';

  const toggle = async () => {
    const mine = ++run.current;
    if (open) return setView({ kind: 'closed' });
    // Biết là offline thì báo ngay, khỏi chờ hết thời gian chờ của request
    if (!online) return setView({ kind: 'error', message: OFFLINE_MSG });
    setView({ kind: 'loading' });
    try {
      const res = await fetchRecordHistory(projectId, record.id);
      if (run.current !== mine) return;
      setView(
        res.ok
          ? { kind: 'loaded', items: buildHistoryView(res.entries, form, forms) }
          : { kind: 'error', message: NOT_FOUND_MSG },
      );
    } catch (err) {
      const failure = apiFailure(err);
      if (!failure) throw err;
      if (run.current === mine) setView({ kind: 'error', message: apiFailureText(failure, OFFLINE_MSG) });
    }
  };

  return (
    <div className="record-history">
      <button aria-expanded={open} aria-controls="record-history-panel" onClick={() => void toggle()}>
        Lịch sử sửa
      </button>
      {open && (
        <div id="record-history-panel" className="history-panel">
          {record.syncState !== 'synced' && (
            <p className="history-note" data-testid="history-unsynced">
              Thay đổi chưa đồng bộ trên máy này chưa có trong lịch sử.
            </p>
          )}
          {view.kind === 'loading' && (
            <p className="history-loading" role="status">
              <span className="spin" /> Đang tải lịch sử…
            </p>
          )}
          {view.kind === 'error' && (
            <p className="field-error" role="alert" data-testid="history-error">
              {view.message}
            </p>
          )}
          {view.kind === 'loaded' && view.items.length === 0 && <p>Chưa có lịch sử.</p>}
          {view.kind === 'loaded' && view.items.length > 0 && (
            <ol className="history-list" data-testid="record-history">
              {view.items.map((item) => (
                <li key={item.version}>
                  <p className="history-head">
                    <strong>{item.who}</strong> {KIND_LABEL[item.kind]} · {formatHistoryTime(item.at)}
                  </p>
                  {item.kind !== 'created' && item.kind !== 'deleted' && item.changes.length === 0 && (
                    <p className="history-change">Không đổi giá trị nào.</p>
                  )}
                  {item.changes.map((line) => (
                    <p className="history-change" key={line}>
                      {line}
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
