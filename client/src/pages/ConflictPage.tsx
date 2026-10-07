import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { FieldValue, RecordData } from '@field-survey/shared';
import { db } from '../db/db';
import { resolveConflict } from '../sync/engine';
import { navigate } from '../useHashRoute';

// Màn hình giải thích conflict: với mỗi trường, ai sửa, lúc nào, giá trị gốc / của bạn / trên máy chủ.
// TODO(Thành viên 3): xử lý recordLevel (xoá vs sửa), so sánh ảnh, "giữ cả hai" cho multiselect.
export function ConflictPage({ recordId }: { recordId: string }) {
  const conflict = useLiveQuery(() => db.conflicts.get(recordId), [recordId]);
  const record = useLiveQuery(() => db.records.get(recordId), [recordId]);
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({});

  if (!conflict || !record) return <p>Không có xung đột cho phiếu này.</p>;

  const lastEdit = conflict.history[conflict.history.length - 1];
  const editors = [...new Set(conflict.history.map((h) => h.updatedBy))].join(', ');
  const allChosen = conflict.merge.conflicts.every((c) => choices[c.field]);

  const apply = async () => {
    const resolved: RecordData = { ...conflict.merge.merged };
    for (const c of conflict.merge.conflicts) {
      const v = choices[c.field] === 'local' ? c.local : c.remote;
      if (v === undefined) delete resolved[c.field];
      else resolved[c.field] = v;
    }
    await resolveConflict(recordId, resolved, record.deleted && conflict.server.deleted);
    navigate();
  };

  return (
    <section>
      <h2>Phiếu bị sửa ở nơi khác</h2>
      <p>
        Trong lúc bạn ngoại tuyến, <b>{editors || conflict.server.updatedBy}</b> đã sửa phiếu này (lần cuối{' '}
        {new Date(lastEdit?.updatedAt ?? conflict.server.updatedAt).toLocaleString('vi-VN')}).{' '}
        {conflict.merge.autoResolved.length} trường đã được gộp tự động. Các trường dưới đây cả hai bên cùng sửa,
        hãy chọn giá trị giữ lại.
      </p>
      <table className="conflict" data-testid="conflict-table">
        <thead>
          <tr>
            <th>Trường</th>
            <th>Trước đó</th>
            <th>Của bạn</th>
            <th>Trên máy chủ</th>
          </tr>
        </thead>
        <tbody>
          {conflict.merge.conflicts.map((c) => (
            <tr key={c.field}>
              <td>{c.field}</td>
              <td>{show(c.base)}</td>
              <td>
                <label>
                  <input
                    type="radio"
                    name={c.field}
                    checked={choices[c.field] === 'local'}
                    onChange={() => setChoices({ ...choices, [c.field]: 'local' })}
                  />
                  {show(c.local)}
                </label>
              </td>
              <td>
                <label>
                  <input
                    type="radio"
                    name={c.field}
                    checked={choices[c.field] === 'remote'}
                    onChange={() => setChoices({ ...choices, [c.field]: 'remote' })}
                  />
                  {show(c.remote)}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="primary" disabled={!allChosen} onClick={apply}>
        Áp dụng và đồng bộ
      </button>
    </section>
  );
}

function show(v: FieldValue | undefined): string {
  if (v == null || v === '') return '(trống)';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`;
  return String(v);
}
