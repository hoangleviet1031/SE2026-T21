import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MeResponse, RecordData } from '@field-survey/shared';
import { getAccountValue } from '../db/accountDb';
import { useCurrentProject, useCurrentProjectDb } from '../db/current';
import { canDeleteRecord } from '../projects';
import { FormRenderer } from '../components/FormRenderer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RecordInConflictError, deleteRecordLocally, saveRecordLocally } from '../sync/outbox';
import { syncNow } from '../sync/engine';
import { requestPersistentStorage } from '../persistStorage';
import { navigate } from '../useHashRoute';
import { useOnline } from '../useOnline';

export function FillPage({ formId, recordId }: { formId: string; recordId?: string }) {
  const db = useCurrentProjectDb();
  const id = recordId ?? crypto.randomUUID();
  const record = useLiveQuery(() => db?.records.get(id), [db, id]);
  const forms = useLiveQuery(async () => db?.forms.where('id').equals(formId).toArray(), [db, formId]);
  // Vai trò và id của mình để biết có được xoá phiếu này không (design §5.7)
  const project = useCurrentProject();
  const user = useLiveQuery(() => getAccountValue<MeResponse['user'] | null>('user', null), []);
  const [data, setData] = useState<RecordData>({});
  const online = useOnline();
  // Đã thử đồng bộ để tải bản form còn thiếu mà vẫn chưa có (vd. server không trả lời)
  const [fetchTried, setFetchTried] = useState(false);
  // Lưu bị từ chối vì phiếu đang xung đột (có thể vừa thành conflict khi form đang mở)
  const [inConflict, setInConflict] = useState(false);
  // Đang hỏi xác nhận xoá phiếu
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (record) setData(record.data);
  }, [record?.id]);

  // Bản ghi cũ hiển thị theo đúng phiên bản form lúc tạo
  const version = record?.formVersion ?? (forms?.length ? Math.max(...forms.map((f) => f.version)) : undefined);
  const form = forms?.find((f) => f.version === version);
  const missingVersion = record !== undefined && forms !== undefined && !form;

  // Thiếu bản form của phiếu: vòng đồng bộ tải về (design §5.3 bước 5), trang không gọi API trực tiếp.
  // Có mạng lại thì thử lại.
  useEffect(() => {
    if (!missingVersion || !online) return;
    setFetchTried(false);
    syncNow()
      .catch((e) => console.warn('sync failed', e))
      .finally(() => setFetchTried(true));
  }, [missingVersion, online]);

  if (!db || !forms) return null;
  if (!form) {
    if (!missingVersion) return <p>Không tìm thấy biểu mẫu.</p>;
    // design §8: phiếu dùng form version chưa có trên máy
    return (
      <section>
        <a href="#/" className="back">
          ← Quay lại
        </a>
        <p data-testid="form-version-missing">
          {online && !fetchTried ? 'Đang tải biểu mẫu…' : 'Cần kết nối để mở phiếu này'}
        </p>
      </section>
    );
  }
  // Lỗi lấy từ lần lưu gần nhất (design §4.1: mở lại nháp thì thấy danh sách lỗi)
  const isDraft = record?.syncState === 'draft';

  // Phiếu đang xung đột thì chỉ đọc (ADR 0001 quy tắc 7, design §4.5): khoá ô nhập, ẩn Lưu và Xoá, banner
  // dẫn tới màn hình xung đột. Phiếu có thể thành conflict ngay lúc form đang mở (đồng bộ chạy nền):
  // liveQuery đổi record là trang tự chuyển sang chỉ đọc, phần đang nhập vẫn hiện trên màn hình.
  const readOnly = record?.syncState === 'conflict' || inConflict;
  // Phiếu thành chỉ đọc lúc hộp xoá đang mở: đóng hẳn hộp, để khi hết xung đột hộp không tự hiện lại.
  // Chỉnh state ngay lúc render (không dùng effect vì phía trên có return sớm)
  if (readOnly && confirmingDelete) setConfirmingDelete(false);
  const canDelete = !!record && !!project && !!user && canDeleteRecord(project.role, user.id, record.createdBy);
  // Bấm Lưu đúng lúc phiếu vừa thành conflict (trước khi liveQuery kịp cập nhật): tầng dữ liệu từ chối.
  const unlessInConflict = async <T,>(write: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await write();
    } catch (err) {
      if (!(err instanceof RecordInConflictError)) throw err;
      setInConflict(true);
      return undefined;
    }
  };

  const save = async () => {
    const errors = await unlessInConflict(() =>
      saveRecordLocally(db, { id, formId: form.id, formVersion: form.version, data }),
    );
    if (!errors) return;
    // Phiếu đã nằm trên máy (kể cả nháp); xin giữ bộ nhớ không chặn việc lưu hay chuyển trang
    requestPersistentStorage().catch((e) => console.warn('không xin được bộ nhớ lâu dài', e));
    // Còn lỗi thì ở lại để người dùng thấy trường nào cần sửa; phiếu đã lưu thành nháp
    if (Object.keys(errors).length > 0) return;
    void syncNow();
    navigate();
  };

  // Chỉ chạy sau khi người dùng bấm Xoá trong hộp xác nhận: phiếu chưa từng gửi bị xoá hẳn khỏi máy
  // (bất biến 1, design §5.7)
  const remove = async () => {
    // Đóng hộp trước khi ghi để bấm Xoá hai lần không chạy xoá hai lần
    setConfirmingDelete(false);
    if (!(await unlessInConflict(() => deleteRecordLocally(db, id)))) return;
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
      {readOnly && (
        <p className="warning" data-testid="record-in-conflict">
          Phiếu này cần xử lý xung đột trước. <a href={`#/conflict/${id}`}>Xử lý</a>
        </p>
      )}
      {isDraft && (
        <p className="draft-notice" data-testid="draft-notice">
          Đã lưu nháp, chưa đồng bộ. Sửa các trường báo lỗi rồi bấm Lưu.
        </p>
      )}
      {/* fieldset disabled khoá mọi ô nhập và nút bên trong, kể cả chọn/bỏ ảnh */}
      <fieldset className="form-fieldset" disabled={readOnly} data-testid="record-form">
        <FormRenderer
          db={db}
          form={form}
          recordId={id}
          value={data}
          onChange={setData}
          errors={isDraft ? record.validationErrors : undefined}
        />
      </fieldset>
      {!readOnly && (
        <div className="actions">
          <button className="primary" onClick={save}>
            Lưu
          </button>
          {canDelete && (
            <button className="danger-outline" onClick={() => setConfirmingDelete(true)}>
              Xoá phiếu
            </button>
          )}
        </div>
      )}
      {confirmingDelete && (
        <ConfirmDialog
          message="Xoá phiếu này? Không hoàn tác được trên máy."
          confirmLabel="Xoá"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </section>
  );
}
