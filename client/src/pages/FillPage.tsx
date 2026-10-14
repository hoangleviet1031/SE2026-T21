import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RecordData } from '@field-survey/shared';
import { useCurrentProjectDb } from '../db/current';
import { FormRenderer } from '../components/FormRenderer';
import { saveRecordLocally } from '../sync/outbox';
import { syncNow } from '../sync/engine';
import { requestPersistentStorage } from '../persistStorage';
import { navigate } from '../useHashRoute';

export function FillPage({ formId, recordId }: { formId: string; recordId?: string }) {
  const db = useCurrentProjectDb();
  const id = recordId ?? crypto.randomUUID();
  const record = useLiveQuery(() => db?.records.get(id), [db, id]);
  const forms = useLiveQuery(async () => db?.forms.where('id').equals(formId).toArray(), [db, formId]);
  const [data, setData] = useState<RecordData>({});

  useEffect(() => {
    if (record) setData(record.data);
  }, [record?.id]);

  if (!db || !forms) return null;
  // Bản ghi cũ hiển thị theo đúng phiên bản form lúc tạo
  const version = record?.formVersion ?? Math.max(...forms.map((f) => f.version));
  const form = forms.find((f) => f.version === version);
  if (!form) return <p>Không tìm thấy biểu mẫu.</p>;
  // Lỗi lấy từ lần lưu gần nhất (design §4.1: mở lại nháp thì thấy danh sách lỗi)
  const isDraft = record?.syncState === 'draft';

  const save = async () => {
    const errors = await saveRecordLocally(db, { id, formId: form.id, formVersion: form.version, data });
    // Phiếu đã nằm trên máy (kể cả nháp); xin giữ bộ nhớ không chặn việc lưu hay chuyển trang
    requestPersistentStorage().catch((e) => console.warn('không xin được bộ nhớ lâu dài', e));
    // Còn lỗi thì ở lại để người dùng thấy trường nào cần sửa; phiếu đã lưu thành nháp
    if (Object.keys(errors).length > 0) return;
    void syncNow();
    navigate();
  };

  const remove = async () => {
    await saveRecordLocally(db, { id, formId: form.id, formVersion: form.version, data, deleted: true });
    void syncNow();
    navigate();
  };

  return (
    <section>
      {/* Thoát không lưu: giống nút back của máy, phần chưa bấm Lưu không được giữ */}
      <a href="#/" className="back">
        ← Quay lại
      </a>
      <h2>{form.title}</h2>
      {isDraft && (
        <p className="draft-notice" data-testid="draft-notice">
          Đã lưu nháp, chưa đồng bộ. Sửa các trường báo lỗi rồi bấm Lưu.
        </p>
      )}
      <FormRenderer
        db={db}
        form={form}
        recordId={id}
        value={data}
        onChange={setData}
        errors={isDraft ? record.validationErrors : undefined}
      />
      <div className="actions">
        <button className="primary" onClick={save}>
          Lưu
        </button>
        {record && <button onClick={remove}>Xoá phiếu</button>}
      </div>
    </section>
  );
}
