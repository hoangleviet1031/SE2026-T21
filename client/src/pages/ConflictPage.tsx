import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCurrentProjectDb } from '../db/current';
import { formKey } from '../db/projectDb';
import { buildConflictView, resolveChoices, resolveRecordLevel, type Choice, type RecordLevelChoice } from '../conflictView';
import { DeleteConflictDialog } from '../components/DeleteConflictDialog';
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
  const [recordLevelChoice, setRecordLevelChoice] = useState<RecordLevelChoice>();

  if (!db) return null;
  if (!conflict || !record) return <p>Không có xung đột cho phiếu này.</p>;

  const { fields, auto } = buildConflictView(conflict.merge, form);
  // Người sửa và giờ là của lần ghi cuối trên server, không dùng giờ thiết bị (bất biến 4)
  const lastEdit = conflict.history[conflict.history.length - 1];
  // Tên lấy từ response lúc phát hiện xung đột nên hiện được khi offline (design §6.2). Xung đột lưu
  // trước TV1-17, hoặc server không tìm thấy tài khoản (tên rỗng), thì hiện userId như trước.
  const lastEditor = lastEdit ?? conflict.server;
  const editor = lastEditor.updatedByName || lastEditor.updatedBy;
  const editedAt = new Date(lastEdit?.updatedAt ?? conflict.server.updatedAt).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
  // Xoá vs sửa (ADR 0001 quy tắc 6): chỉ hỏi giữ hay xoá, câu hỏi đã nói rõ giữ bản nào nên không
  // hiện thẻ từng trường. Áp dụng khoá tới khi có câu trả lời, không có giá trị mặc định.
  const recordLevel = conflict.recordLevel;
  const ready = recordLevel === 'none' ? fields.every((f) => choices[f.id]) : recordLevelChoice !== undefined;

  const choose = (field: string, choice: Choice) => setChoices({ ...choices, [field]: choice });

  const apply = async () => {
    if (recordLevel === 'none') {
      // Không có xoá vs sửa: chỉ xoá khi cả hai bên đều đã xoá, như trước TV3-08.
      const resolved = resolveChoices(conflict.merge, form, choices);
      await resolveConflict(db, recordId, resolved, record.deleted && conflict.server.deleted);
    } else {
      if (!recordLevelChoice) return; // nút đã khoá; chặn thêm cho chắc
      const { data, deleted } = resolveRecordLevel(recordLevel, recordLevelChoice, record.data, conflict.server.data);
      await resolveConflict(db, recordId, data, deleted);
    }
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
        {recordLevel === 'none' &&
          fields.length > 0 &&
          ' Các trường dưới đây cả hai bên cùng sửa, hãy chọn giá trị giữ lại.'}
      </p>
      {recordLevel !== 'none' && (
        <DeleteConflictDialog
          level={recordLevel}
          editor={editor}
          choice={recordLevelChoice}
          onChoose={setRecordLevelChoice}
        />
      )}
      {recordLevel === 'none' && (
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
      )}
      {recordLevel === 'none' && auto.length > 0 && (
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
      <button className="primary" disabled={!ready} onClick={apply}>
        Áp dụng và đồng bộ
      </button>
    </section>
  );
}
