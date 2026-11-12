import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MeResponse, RecordData } from '@field-survey/shared';
import { getAccountValue } from '../db/accountDb';
import { useCurrentProject, useCurrentProjectDb } from '../db/current';
import { canDeleteRecord } from '../projects';
import { formTone, latestForms } from '../formDisplay';
import { FormRenderer } from '../components/FormRenderer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RecordErrorBox } from '../components/RecordErrorBox';
import { Icon } from '../components/Icon';
import { RecordDeletedError, RecordInConflictError, deleteRecordLocally, saveRecordLocally } from '../sync/outbox';
import { syncNow } from '../sync/engine';
import { displayState } from '../sync/displayState';
import { statusIcon } from '../statusIcon';
import { requestPersistentStorage } from '../persistStorage';
import { navigate, navigateReplace } from '../useHashRoute';
import { useOnline } from '../useOnline';
import { formatEditedAt } from '../recordList';
import { recordLock } from '../recordLock';
import { keptFieldLine, needsBuffer, restorePlan, withoutEmpty, type RestorePlan } from '../typingBuffer';
import { deleteTypingBuffer, getTypingBuffer, putTypingBuffer, setTypingFlush } from '../db/typingBuffer';
import { canCopyRecord, copyBuffer } from '../recordCopy';
import { fieldSuggestions, type SuggestionSource } from '../fieldSuggestions';

/** Dải bộ đệm đang nhập (ui.md màn hình 4): đang hỏi khôi phục, phiếu đã bị xoá, hay báo trường giữ bản mới */
type TypingPrompt = { kind: 'ask'; savedAt: string } | { kind: 'gone' } | { kind: 'kept'; lines: string[] };

export function FillPage({ formId, recordId }: { formId: string; recordId?: string }) {
  const db = useCurrentProjectDb();
  const id = recordId ?? crypto.randomUUID();
  const record = useLiveQuery(() => db?.records.get(id), [db, id]);
  const forms = useLiveQuery(async () => db?.forms.where('id').equals(formId).toArray(), [db, formId]);
  // Đầu trang cùng màu với thẻ form này ở trang chủ (ui.md màn hình 4, TV1-12 b2)
  const allForms = useLiveQuery(async () => db?.forms.toArray(), [db]);
  // Ảnh của phiếu cho nhãn trạng thái đầu trang ("Đang tải ảnh", "Lỗi ảnh"), cùng cách tính với trang chủ
  const photos = useLiveQuery(async () => db?.attachments.where('recordId').equals(id).toArray(), [db, id]);
  // Vai trò và id của mình để biết có được xoá phiếu này không (design §5.7)
  const project = useCurrentProject();
  const user = useLiveQuery(() => getAccountValue<MeResponse['user'] | null>('user', null), []);
  const [data, setData] = useState<RecordData>({});
  // Bản phiếu đã nạp vào form (phiếu mới là {}); null khi chưa đọc xong phiếu và bộ đệm
  const [base, setBase] = useState<RecordData | null>(null);
  const [typingPrompt, setTypingPrompt] = useState<TypingPrompt | null>(null);
  // Ghi bộ đệm đang chờ (debounce); gọi để ghi ngay khi ẩn trang, rời trang hay trước khi Tải lại
  const pendingWrite = useRef<(() => Promise<void>) | null>(null);
  // Trên máy đang có bộ đệm của phiếu này, để chữ quay về như cũ thì xoá đi
  const hasBuffer = useRef(false);
  const online = useOnline();
  // Đã thử đồng bộ để tải bản form còn thiếu mà vẫn chưa có (vd. server không trả lời)
  const [fetchTried, setFetchTried] = useState(false);
  // Lưu bị từ chối vì phiếu đang xung đột (có thể vừa thành conflict khi form đang mở)
  const [inConflict, setInConflict] = useState(false);
  // Đang hỏi xác nhận xoá phiếu
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Đang xoá theo lệnh của chính trang này: sắp về danh sách, không báo "đã bị xoá" cho một khung hình
  const [removing, setRemoving] = useState(false);
  // Id phiếu biết là từng có trên máy: sau đó mà không còn thì là đã xoá, không phải phiếu mới (design §5.7)
  const [seenRecordId, setSeenRecordId] = useState<string>();
  if (record?.id === id && seenRecordId !== id) setSeenRecordId(id);
  // Trang này đang là bản sao vừa tạo, chưa Lưu (design §4.1 "Nhân bản phiếu")
  const [isCopy, setIsCopy] = useState(false);
  // Đang ghi để nhân bản: state khoá nút, ref chặn cả hai lần chạm tới trước khi React kịp vẽ lại
  const [copying, setCopying] = useState(false);
  const copyStarted = useRef(false);
  const [copyFailed, setCopyFailed] = useState(false);
  // Phiếu cùng form trên máy để gợi ý ô chữ (design §4.1). Đọc một lần khi mở, không theo dõi: khỏi đọc lại
  // cả nghìn phiếu sau mỗi vòng đồng bộ. Chưa đọc xong thì ô nhập vẫn gõ được, chỉ chưa có gợi ý.
  const [sameFormRecords, setSameFormRecords] = useState<SuggestionSource[]>([]);
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    void db.records
      .where('formId')
      .equals(formId)
      .toArray()
      .then((rows) => {
        if (!cancelled) setSameFormRecords(rows);
      })
      // Không có gợi ý thì vẫn nhập tay được, không cần báo người dùng
      .catch((e) => console.warn('không đọc được phiếu để gợi ý', e));
    return () => {
      cancelled = true;
    };
  }, [db, formId]);

  // Đọc phiếu và bộ đệm cùng lúc khi mở trang: có bộ đệm thì hỏi khôi phục, không tự điền (design §4.1)
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    // Đổi sang phiếu khác mà trang vẫn giữ: chưa tự lưu gì cho tới khi đọc xong phiếu mới
    setBase(null);
    setTypingPrompt(null);
    hasBuffer.current = false;
    void Promise.all([db.records.get(id), getTypingBuffer(db, id)]).then(async ([rec, buffer]) => {
      if (cancelled) return;
      // Vừa bấm "Nhân bản phiếu": điền luôn, không hỏi. Tab khác đã Lưu phiếu này thì đi đường thường bên dưới.
      if (buffer?.fromCopy && !rec) {
        setData(buffer.data);
        setBase(buffer.base);
        setIsCopy(true);
        hasBuffer.current = true;
        return;
      }
      const loaded = rec?.data ?? {};
      setData(loaded);
      setBase(loaded);
      if (!buffer) return;
      const plan = restorePlan(buffer, rec);
      if (plan.kind === 'same') {
        await deleteTypingBuffer(db, id);
        return;
      }
      hasBuffer.current = true;
      if (plan.kind === 'gone') setSeenRecordId(id);
      setTypingPrompt(plan.kind === 'gone' ? { kind: 'gone' } : { kind: 'ask', savedAt: buffer.savedAt });
    }).catch((e) => console.warn('không đọc được phiếu hoặc bộ đệm đang nhập', e));
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  // Bản ghi cũ hiển thị theo đúng phiên bản form lúc tạo
  const version = record?.formVersion ?? (forms?.length ? Math.max(...forms.map((f) => f.version)) : undefined);
  const form = forms?.find((f) => f.version === version);
  const missingVersion = record !== undefined && forms !== undefined && !form;
  const suggestions = useMemo(
    () => (form ? fieldSuggestions(form, sameFormRecords, id) : undefined),
    [form, sameFormRecords, id],
  );

  // Thiếu bản form của phiếu: vòng đồng bộ tải về (design §5.3 bước 5), trang không gọi API trực tiếp.
  // Có mạng lại thì thử lại.
  useEffect(() => {
    if (!missingVersion || !online) return;
    setFetchTried(false);
    syncNow()
      .catch((e) => console.warn('sync failed', e))
      .finally(() => setFetchTried(true));
  }, [missingVersion, online]);

  const asking = typingPrompt?.kind === 'ask' || typingPrompt?.kind === 'gone';
  const lock = recordLock({ record, recordId: id, seenRecordId, inConflict });
  const conflictNow = lock === 'conflict';
  const deletedNow = lock === 'deleted';
  // Phiếu xung đột hay đã xoá đều chỉ đọc. Có thể đổi ngay lúc form đang mở (đồng bộ chạy nền, tab khác):
  // liveQuery đổi record là trang tự chuyển sang chỉ đọc, phần đang nhập vẫn hiện trên màn hình.
  const readOnly = lock !== 'editable';

  // Tự lưu chữ đang gõ sau 1 s ngừng gõ (design §4.1). Không ghi khi đang hỏi khôi phục (sẽ đè bộ đệm cũ)
  // hay phiếu chỉ đọc (xung đột, đã xoá). Chỉ ghi meta, không đụng phiếu và outbox (bất biến 2, 3).
  useEffect(() => {
    if (!db || !form || base === null || asking || readOnly) return;
    const write = async () => {
      pendingWrite.current = null;
      if (needsBuffer(data, base)) {
        await putTypingBuffer(db, id, {
          formId: form.id,
          formVersion: form.version,
          data,
          base,
          savedAt: new Date().toISOString(),
        });
        hasBuffer.current = true;
      } else if (hasBuffer.current) {
        await deleteTypingBuffer(db, id);
        hasBuffer.current = false;
      }
    };
    pendingWrite.current = write;
    // Lưu hay Xoá vừa bỏ lần ghi này (pendingWrite đã đổi) thì không ghi lại bộ đệm
    const timer = setTimeout(() => {
      if (pendingWrite.current !== write) return;
      void write().catch((e) => console.warn('không ghi được bộ đệm đang nhập', e));
    }, 1000);
    return () => clearTimeout(timer);
  }, [db, form, id, data, base, asking, readOnly]);

  // Ẩn trang (chuyển app, khoá máy: Android hay tắt app lúc này) hoặc rời trang thì ghi ngay phần đang chờ
  useEffect(() => {
    const flush = () => pendingWrite.current?.() ?? Promise.resolve();
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush().catch((e) => console.warn('không ghi được bộ đệm đang nhập', e));
    };
    setTypingFlush(flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      setTypingFlush(null);
      void flush().catch((e) => console.warn('không ghi được bộ đệm đang nhập', e));
    };
  }, []);

  if (!db || !forms) return null;
  if (!form) {
    if (!missingVersion) return <p>Không tìm thấy biểu mẫu.</p>;
    // design §8: phiếu dùng form version chưa có trên máy
    const loading = online && !fetchTried;
    return (
      <section>
        <a href="#/" className="back">
          ← Quay lại
        </a>
        <p className="center-msg" data-testid="form-version-missing">
          {loading ? <span className="spin" /> : <Icon name="offline" />}
          {loading ? 'Đang tải biểu mẫu…' : 'Cần kết nối để mở phiếu này'}
        </p>
      </section>
    );
  }
  // Lỗi lấy từ lần lưu gần nhất (design §4.1: mở lại nháp thì thấy danh sách lỗi)
  const isDraft = record?.syncState === 'draft';

  // Phiếu chỉ đọc (ADR 0001 quy tắc 7, design §4.5, §5.7): khoá ô nhập, ẩn Lưu và Xoá; xung đột có banner dẫn
  // tới màn hình xung đột, đã xoá có banner báo. Phiếu đã xoá mà không còn gì để xem thì ẩn luôn form.
  const noContent = deletedNow && Object.keys(withoutEmpty(data)).length === 0;
  // Phiếu thành chỉ đọc lúc hộp xoá đang mở: đóng hẳn hộp, để khi hết xung đột hộp không tự hiện lại.
  // Chỉnh state ngay lúc render (không dùng effect vì phía trên có return sớm)
  if (readOnly && confirmingDelete) setConfirmingDelete(false);
  const tone = formTone(latestForms(allForms ?? []).findIndex((f) => f.id === form.id));
  // Phiếu mới chưa lưu thì chưa có trạng thái gì
  const state = record ? displayState(record, photos ?? []) : undefined;
  const canDelete = !!record && !!project && !!user && canDeleteRecord(project.role, user.id, record.createdBy);
  const canCopy = !!record && !!project && !!user && canCopyRecord(record, project.role, user.id);
  // Bấm Lưu đúng lúc phiếu vừa thành conflict hay vừa bị xoá (trước khi liveQuery kịp cập nhật): tầng dữ liệu
  // từ chối, không ghi gì; chữ đang gõ vẫn còn. Phiếu vừa bị xoá thì liveQuery tự chuyển trang sang chỉ đọc.
  const unlessLocked = async <T,>(write: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await write();
    } catch (err) {
      if (err instanceof RecordDeletedError) return undefined;
      if (!(err instanceof RecordInConflictError)) throw err;
      setInConflict(true);
      return undefined;
    }
  };

  // Lưu hay Xoá xong thì chữ đang gõ đã nằm trong phiếu: bỏ bộ đệm và lần ghi đang chờ (design §4.1)
  const dropBuffer = async () => {
    pendingWrite.current = null;
    hasBuffer.current = false;
    await deleteTypingBuffer(db, id);
  };

  const save = async () => {
    const errors = await unlessLocked(() =>
      saveRecordLocally(db, { id, formId: form.id, formVersion: form.version, data }),
    );
    if (!errors) return;
    await dropBuffer();
    setBase(data);
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
    setRemoving(true);
    if (!(await unlessLocked(() => deleteRecordLocally(db, id)))) {
      setRemoving(false);
      return;
    }
    await dropBuffer();
    void syncNow();
    // Thay mục lịch sử: Back không về lại phiếu vừa xoá (design §5.7)
    navigateReplace();
  };

  // Khôi phục theo phiếu lúc bấm (có thể vừa đồng bộ về bản mới), không theo lúc mở trang
  const restore = async () => {
    const [rec, buffer] = await Promise.all([db.records.get(id), getTypingBuffer(db, id)]);
    const plan: RestorePlan = buffer ? restorePlan(buffer, rec) : { kind: 'same' };
    const current = rec?.data ?? {};
    setBase(current);
    if (plan.kind === 'gone') {
      setSeenRecordId(id);
      setTypingPrompt({ kind: 'gone' });
      return;
    }
    setData(plan.kind === 'restore' ? plan.data : current);
    // Bộ đệm được ghi lại theo bản phiếu mới làm gốc ở lần tự lưu kế tiếp
    hasBuffer.current = buffer !== undefined;
    const lines = plan.kind === 'restore' ? plan.kept.map((k) => keptFieldLine(form, k)) : [];
    setTypingPrompt(lines.length > 0 ? { kind: 'kept', lines } : null);
  };

  const discard = async () => {
    await dropBuffer();
    setTypingPrompt(null);
  };

  // Bản sao là phiếu mới chưa Lưu, nằm trong bộ đệm của id mới (design §4.1): không có phiếu, không có op tới khi
  // bấm Lưu. Chép đúng thứ đang thấy trên form. Chữ chưa Lưu của phiếu gốc ghi vào bộ đệm của nó trước khi rời trang.
  const copyRecord = async () => {
    if (copyStarted.current) return;
    copyStarted.current = true;
    setCopying(true);
    setCopyFailed(false);
    try {
      await pendingWrite.current?.();
      const newId = crypto.randomUUID();
      const latest = latestForms(forms)[0] ?? form;
      await putTypingBuffer(db, newId, copyBuffer(latest, data, new Date().toISOString()));
      navigate('fill', form.id, newId);
    } catch (e) {
      // Không ghi được thì ở lại phiếu gốc, chưa có gì đổi; báo để bấm lại (design §8)
      console.warn('không nhân bản được phiếu', e);
      copyStarted.current = false;
      setCopying(false);
      setCopyFailed(true);
    }
  };

  return (
    <section>
      {/* Rời trang chưa bấm Lưu: chữ đang gõ vẫn nằm trong bộ đệm, mở lại phiếu sẽ hỏi khôi phục (design §4.1) */}
      <a href="#/" className="back">
        ← Quay lại
      </a>
      <div className={`fhero tone-${tone}`}>
        <span className="ft">
          <Icon name="form" />
        </span>
        <h2>{form.title}</h2>
      </div>
      {record && state && (
        <div className={`record-state st-${state.kind}`}>
          <span className="st" data-testid="record-state">
            <Icon name={statusIcon(state.kind)} />
            {state.label}
          </span>
          {record.syncState === 'error' && <RecordErrorBox db={db} recordId={id} lastError={record.lastError} />}
        </div>
      )}
      {conflictNow && (
        <div className="ro-banner" data-testid="record-in-conflict">
          <span>Phiếu này cần xử lý xung đột trước.</span> <a href={`#/conflict/${id}`}>Xử lý</a>
        </div>
      )}
      {/* Dải "đã bị xoá…" của bộ đệm đang hiện thì không thêm dải thứ hai cùng ý */}
      {deletedNow && !removing && typingPrompt?.kind !== 'gone' && (
        <div className="ro-banner" data-testid="record-deleted">
          <span>Phiếu này đã bị xoá nên không sửa được nữa.</span>
        </div>
      )}
      {typingPrompt?.kind === 'ask' && (
        <div className="typing-note" role="status" data-testid="typing-restore">
          <span>Có nội dung đang nhập chưa lưu ({formatEditedAt(typingPrompt.savedAt, new Date())}).</span>
          <div className="acts">
            <button className="primary" onClick={() => void restore()}>
              Khôi phục
            </button>
            <button onClick={() => void discard()}>Bỏ</button>
          </div>
        </div>
      )}
      {typingPrompt?.kind === 'gone' && (
        <div className="typing-note" role="status" data-testid="typing-restore">
          <span>Phiếu này đã bị xoá nên không khôi phục được nội dung đang nhập.</span>
          <div className="acts">
            <button onClick={() => void discard()}>Bỏ</button>
          </div>
        </div>
      )}
      {typingPrompt?.kind === 'kept' && (
        <div className="typing-note" role="status" data-testid="typing-kept">
          <span>Đã khôi phục. Trường sau đã được sửa ở nơi khác nên giữ bản mới, nhập lại nếu cần:</span>
          <ul>
            {typingPrompt.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="acts">
            <button onClick={() => setTypingPrompt(null)}>Đóng</button>
          </div>
        </div>
      )}
      {isCopy && !record && (
        <p className="draft-notice" role="status" data-testid="copy-note">
          Đây là bản sao, chưa lưu. Ảnh và vị trí không được chép.
        </p>
      )}
      {isDraft && (
        <p className="draft-notice" data-testid="draft-notice">
          Đã lưu nháp, chưa đồng bộ. Sửa các trường báo lỗi rồi bấm Lưu.
        </p>
      )}
      {/* fieldset disabled khoá mọi ô nhập và nút bên trong, kể cả chọn/bỏ ảnh */}
      {/* Đang hỏi khôi phục thì khoá: gõ tiếp rồi bấm Khôi phục sẽ thay mất phần vừa gõ */}
      {!noContent && (
        <fieldset className="form-fieldset" disabled={readOnly || asking} data-testid="record-form">
          <FormRenderer
            db={db}
            form={form}
            recordId={id}
            value={data}
            onChange={setData}
            errors={isDraft ? record.validationErrors : undefined}
            suggestions={suggestions}
          />
        </fieldset>
      )}
      {/* Ngoài hàng nút dính đáy: hàng đó đã chật ở 360px và bấm nhầm cạnh Lưu thì khó nhận ra.
          Chờ base: phiếu đã đọc được mà form chưa nạp thì bấm lúc đó sẽ chép ra bản sao rỗng */}
      {canCopy && base !== null && !readOnly && !asking && (
        <button className="record-copy" disabled={copying} onClick={() => void copyRecord()}>
          Nhân bản phiếu
        </button>
      )}
      {copyFailed && (
        <p className="field-error" role="alert" data-testid="copy-error">
          Không nhân bản được phiếu. Thử lại sau.
        </p>
      )}
      {/* Hàng nút dính đáy màn hình để phiếu dài vẫn bấm Lưu bằng ngón cái (ui.md màn hình 4, TV1-12 b2) */}
      {!readOnly && !asking && (
        <div className="actionbar" data-testid="record-actions">
          {canDelete && (
            <button className="danger-outline" onClick={() => setConfirmingDelete(true)}>
              Xoá phiếu
            </button>
          )}
          <button className="primary" onClick={save}>
            Lưu
          </button>
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
