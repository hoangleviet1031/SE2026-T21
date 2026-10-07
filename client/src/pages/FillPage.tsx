import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RecordData } from '@field-survey/shared';
import { db } from '../db/db';
import { FormRenderer } from '../components/FormRenderer';
import { saveRecordLocally } from '../sync/outbox';
import { syncNow } from '../sync/engine';
import { navigate } from '../useHashRoute';

export function FillPage({ formId, recordId }: { formId: string; recordId?: string }) {
  const id = recordId ?? crypto.randomUUID();
  const record = useLiveQuery(() => db.records.get(id), [id]);
  const forms = useLiveQuery(() => db.forms.where('id').equals(formId).toArray(), [formId]);
  const [data, setData] = useState<RecordData>({});

  useEffect(() => {
    if (record) setData(record.data);
  }, [record?.id]);

  if (!forms) return null;
  // Bản ghi cũ hiển thị theo đúng phiên bản form lúc tạo
  const version = record?.formVersion ?? Math.max(...forms.map((f) => f.version));
  const form = forms.find((f) => f.version === version);
  if (!form) return <p>Không tìm thấy biểu mẫu.</p>;

  const save = async () => {
    await saveRecordLocally({ id, formId: form.id, formVersion: form.version, data });
    void syncNow();
    navigate();
  };

  const remove = async () => {
    await saveRecordLocally({ id, formId: form.id, formVersion: form.version, data, deleted: true });
    void syncNow();
    navigate();
  };

  return (
    <section>
      <h2>{form.title}</h2>
      <FormRenderer form={form} recordId={id} value={data} onChange={setData} />
      <div className="actions">
        <button className="primary" onClick={save}>
          Lưu
        </button>
        {record && <button onClick={remove}>Xoá phiếu</button>}
      </div>
    </section>
  );
}
