import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCurrentProjectDb } from '../db/current';
import { formKey } from '../db/projectDb';
import { buildConflictView, resolveChoices, type Choice } from '../conflictView';
import { resolveConflict } from '../sync/engine';
import { navigate } from '../useHashRoute';

// Màn hình xung đột (design §4.5, ui.md màn hình 3): mỗi trường cả hai bên cùng sửa là một thẻ
// (Trước đó / Của bạn / Trên máy chủ, thêm "Gộp cả hai" cho multiselect và ảnh); không dùng bảng 4 cột
// vì không vừa điện thoại. Không chọn sẵn bên nào (ADR 0001 quy tắc 6, 7).

export function ConflictPage({ recordId }: { recordId: string }) {
  const db = useCurrentProjectDb();
  const conflict = useLiveQuery(() => db?.conflicts.get(recordId), [db, recordId]);
  const record = useLiveQuery(() => db?.records.get(recordId), [db, recordId]);
  // Nhãn trường lấy từ đúng phiên bản form của phiếu (ADR 0001 quy tắc 9)
  const form = useLiveQuery(
    () => (record ? db?.forms.get(formKey(record.formId, record.formVersion)) : undefined),
    [db, record?.formId, record?.formVersion],
  );
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  if (!db) return null;
  if (!conflict || !record) return <p>Không có xung đột cho phiếu này.</p>;

  const { fields, auto } = buildConflictView(conflict.merge, form);
  // Người sửa và giờ là của lần ghi cuối trên server, không dùng giờ thiết bị (bất biến 4)
  const lastEdit = conflict.history[conflict.history.length - 1];
  const editor = lastEdit?.updatedBy ?? conflict.server.updatedBy;
  const editedAt = new Date(lastEdit?.updatedAt ?? conflict.server.updatedAt).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
  // Xoá vs sửa cần câu trả lời tường minh (ADR 0001 quy tắc 6); hộp thoại riêng là TV3-08. Tới lúc đó
  // khoá Áp dụng thay vì đoán hộ: phiếu đứng ở conflict, không mất gì.
  const recordLevelPending = conflict.recordLevel !== 'none';
  const allChosen = fields.every((f) => choices[f.id]);

  const choose = (field: string, choice: Choice) => setChoices({ ...choices, [field]: choice });

  const apply = async () => {
    const resolved = resolveChoices(conflict.merge, form, choices);
    await resolveConflict(db, recordId, resolved, record.deleted && conflict.server.deleted);
    navigate();
  };

  return (
    <section>
      <a href="#/" className="back">
        ← Quay lại
      </a>
      <h2>Xử lý xung đột</h2>
      <p data-testid="conflict-explain">
        Trong lúc bạn ngoại tuyến, <b>{editor}</b> đã sửa phiếu này (lần cuối {editedAt}). {auto.length} trường đã
        được gộp tự động.
        {fields.length > 0 && ' Các trường dưới đây cả hai bên cùng sửa, hãy chọn giá trị giữ lại.'}
      </p>
      {recordLevelPending && (
        <p className="warning" data-testid="record-level-conflict">
          Phiếu này bị xoá ở một nơi và được sửa ở nơi khác. Cần chọn giữ hay xoá phiếu; màn hình này chưa hỗ trợ
          lựa chọn đó. Phiếu vẫn được giữ nguyên trên máy.
        </p>
      )}
      <div className="conflict-cards" data-testid="conflict-table">
        {fields.map((f) => (
          <fieldset key={f.id} className="conflict-card" data-testid="conflict-field">
            <legend>{f.label}</legend>
            <p className="conflict-base">Trước đó: {f.base}</p>
            <label>
              <input type="radio" name={f.id} checked={choices[f.id] === 'local'} onChange={() => choose(f.id, 'local')} />
              Của bạn: {f.local}
            </label>
            <label>
              <input
                type="radio"
                name={f.id}
                checked={choices[f.id] === 'remote'}
                onChange={() => choose(f.id, 'remote')}
              />
              Trên máy chủ: {f.remote}
            </label>
            {f.union !== undefined && (
              <label>
                <input type="radio" name={f.id} checked={choices[f.id] === 'both'} onChange={() => choose(f.id, 'both')} />
                Gộp cả hai: {f.union}
              </label>
            )}
          </fieldset>
        ))}
      </div>
      {auto.length > 0 && (
        <details className="auto-merged" data-testid="auto-merged">
          <summary>Đã gộp tự động ({auto.length} trường)</summary>
          <ul>
            {auto.map((a) => (
              <li key={a.id}>
                {a.label}: {a.value} ({a.source})
              </li>
            ))}
          </ul>
        </details>
      )}
      <button className="primary" disabled={!allChosen || recordLevelPending} onClick={apply}>
        Áp dụng và đồng bộ
      </button>
    </section>
  );
}
