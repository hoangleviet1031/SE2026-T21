import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { FieldType, FormSchema } from '@field-survey/shared';
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  addField,
  builderErrors,
  emptyBuilder,
  fromForm,
  fromImport,
  moveField,
  moveFieldTo,
  removeField,
  selectionAfterMove,
  setFormId,
  setTitle,
  toSaveRequest,
  updateField,
  type BuilderState,
} from '../builder';
import { BusyNote } from '../components/BusyNote';
import { FieldEditor } from '../components/FieldEditor';
import { FormRenderer } from '../components/FormRenderer';
import { Icon } from '../components/Icon';
import { formFileName, formFileText, parseFormFile } from '../formFile';
import { useCurrentProject, useCurrentProjectDb } from '../db/current';
import { formKey, type ProjectDb } from '../db/projectDb';
import { canManageProject } from '../projects';
import { apiFailureText } from '../apiErrors';
import { apiFailure, saveForm } from '../sync/api';
import { useFieldDrag } from '../useFieldDrag';
import { navigate } from '../useHashRoute';

const OFFLINE_MSG = 'Cần kết nối để lưu form';
const PREVIEW_MSG = 'Đang xem trước, chưa sửa được. Bấm lại Xem trước để sửa tiếp.';

// Người dùng chọn giảm chuyển động thì nhảy thẳng tới chỗ cần xem, không cuộn mượt
function scrollToView(el: HTMLElement | null, block: ScrollLogicalPosition) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block });
}

// Form builder (design §4.1, ui.md màn hình 5). Đọc form từ IndexedDB; chỉ khi lưu mới gọi API
// (màn hình được phép gọi API trực tiếp, CLAUDE.md bất biến 7).
export function BuilderPage({ formId }: { formId?: string }) {
  const db = useCurrentProjectDb();
  const project = useCurrentProject();
  // Bản mới nhất trên máy làm gốc để sửa và để kiểm luật "đổi form an toàn"
  const prev = useLiveQuery(async () => {
    if (!db || !formId) return null;
    const versions = await db.forms.where('id').equals(formId).toArray();
    return versions.reduce<FormSchema | null>((a, b) => (a && a.version >= b.version ? a : b), null);
  }, [db, formId]);
  // Mã các form đã có trên máy: form mới không được trùng (design §4.1, Xuất/Nhập form)
  const formIds = useLiveQuery(
    async () => (db ? new Set((await db.forms.orderBy('id').uniqueKeys()).map(String)) : undefined),
    [db],
  );

  if (db === undefined || project === undefined || prev === undefined || (db && !formIds)) return null;
  if (!db || !project || !canManageProject(project.role)) {
    return <p>Chỉ giám sát viên và Owner được sửa biểu mẫu.</p>;
  }
  if (formId && !prev) return <p>Không tìm thấy biểu mẫu.</p>;
  // key chỉ theo form: vòng đồng bộ tải bản mới hơn trong lúc sửa không được xoá phần đang sửa;
  // `prev` mới vẫn được dùng để kiểm luật khi lưu (nhóm chốt: bản lưu sau thành version mới)
  return <Builder key={formId ?? 'new'} db={db} prev={prev ?? undefined} formIds={formIds ?? new Set()} />;
}

function Builder({ db, prev, formIds }: { db: ProjectDb; prev?: FormSchema; formIds: ReadonlySet<string> }) {
  const [state, setState] = useState<BuilderState>(() => (prev ? fromForm(prev) : emptyBuilder()));
  const [selected, setSelected] = useState<number | null>(null);
  const [newType, setNewType] = useState<FieldType>('text');
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLFieldSetElement>(null);
  const errorsRef = useRef<HTMLUListElement>(null);
  const fieldsRef = useRef<HTMLUListElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const previewId = useId();
  // Thả xong thì dòng vừa kéo thành dòng đang chọn (ui.md màn hình 5, khung 5f)
  const onDrop = useCallback((from: number, to: number) => {
    setState((s) => moveFieldTo(s, from, to));
    setSelected(to);
  }, []);
  const bottomEdge = useCallback(() => actionsRef.current?.getBoundingClientRect().top ?? window.innerHeight, []);
  const { drag, gripProps, rowStyle, slot } = useFieldDrag({ listRef: fieldsRef, bottomEdge, onDrop });
  const slotStyle = slot();

  // Bật xem trước thì đưa khung vào tầm nhìn: khung nằm cuối trang, trên điện thoại dễ tưởng bấm không ăn
  useEffect(() => {
    if (preview) scrollToView(previewRef.current, 'start');
  }, [preview]);
  // Lưu lỗi thì khung lỗi (ngay trên hàng nút) phải nằm trong tầm nhìn
  useEffect(() => {
    if (errors.length > 0) scrollToView(errorsRef.current, 'nearest');
  }, [errors]);

  // Trường đang chọn bị xoá thì bỏ chọn
  useEffect(() => {
    if (selected !== null && selected >= state.fields.length) setSelected(null);
  }, [selected, state.fields.length]);

  const field = selected === null ? undefined : state.fields[selected];

  const add = () => {
    setState(addField(state, newType));
    setSelected(state.fields.length);
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = moveField(state, index, delta);
    setState(next);
    // ▲ dòng đầu, ▼ dòng cuối: không có gì đổi thì dòng chọn cũng giữ nguyên
    if (next !== state) setSelected(selectionAfterMove(selected, index, index + delta));
  };

  const save = async () => {
    const found = builderErrors(state, prev, formIds);
    setErrors(found);
    if (found.length > 0) return;
    // Biết chắc offline thì báo ngay, không chờ hết thời gian request
    if (!navigator.onLine) return setErrors([OFFLINE_MSG]);
    setSaving(true);
    try {
      const result = await saveForm(db.projectId, toSaveRequest(state));
      if (!result.ok) return setErrors(result.errors);
      // Ghi luôn bản server trả về để trang chủ thấy form ngay, không chờ vòng đồng bộ
      await db.forms.put({ ...result.form, key: formKey(result.form.id, result.form.version) });
      navigate();
    } catch (err) {
      // Mất mạng, 5xx, 401, không còn thành viên: báo rồi giữ nguyên phần đang sửa để bấm Lưu lại
      const failure = apiFailure(err);
      if (!failure) throw err;
      setErrors([apiFailureText(failure, OFFLINE_MSG)]);
    } finally {
      setSaving(false);
    }
  };

  // Xuất bản đã lưu mới nhất trên máy, không gồm phần đang sửa: file dùng để tạo lại đúng form đó
  const exportForm = (form: FormSchema) => {
    const url = URL.createObjectURL(new Blob([formFileText(form)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = formFileName(form);
    a.click();
    // Thu hồi ngay thì Safari/Firefox có thể chưa kịp đọc blob để tải
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Nhập chỉ nạp vào builder để xem, sửa (vd. đổi mã trùng) rồi mới bấm Lưu bản mới
  const importForm = async (file: File) => {
    const parsed = parseFormFile(await file.text());
    if (!parsed.ok) return setErrors(parsed.errors);
    const next = fromImport(parsed.form);
    setState(next);
    setSelected(null);
    setErrors(builderErrors(next, undefined, formIds));
  };

  const previewForm: FormSchema = { ...toSaveRequest(state), version: (prev?.version ?? 0) + 1 };

  return (
    <section className="form builder">
      {/* Thoát không lưu, giống trang điền phiếu: phần chưa bấm Lưu bản mới không được giữ */}
      <a href="#/" className="back">
        ← Quay lại
      </a>
      <h2>{prev ? `Sửa form: ${prev.title}` : 'Biểu mẫu mới'}</h2>
      {/* Ba khối tách rõ: thông tin biểu mẫu, danh sách trường, thuộc tính trường đang chọn (ui.md màn hình 5) */}
      <div className="card">
        <label className="field">
          <span>Tiêu đề</span>
          <input value={state.title} onChange={(e) => setState(setTitle(state, e.target.value))} />
        </label>
        <label className="field">
          <span>Mã biểu mẫu</span>
          {state.idLocked ? (
            <span className="locked">
              <code>{state.id}</code> <span>(khoá)</span>
            </span>
          ) : (
            <input
              value={state.id}
              onChange={(e) => setState(setFormId(state, e.target.value))}
              autoCapitalize="off"
              spellCheck={false}
            />
          )}
        </label>
      </div>

      <div className="card">
        <h3>Trường</h3>
        <ul className={drag ? 'frows dragging' : 'frows'} data-testid="builder-fields" ref={fieldsRef}>
          {state.fields.map((f, i) => (
            <li
              key={f.uid}
              data-row
              className={['frow', i === selected && 'sel', f.hidden && 'hid', drag?.from === i && 'drag']
                .filter(Boolean)
                .join(' ')}
              style={rowStyle(i)}
            >
              {/* Tay nắm chỉ cho chạm và chuột; bàn phím, trình đọc màn hình dùng ▲ ▼ nên ẩn đi */}
              <span className="grip" aria-hidden="true" data-testid="field-grip" {...gripProps(i)}>
                <Icon name="grip" />
              </span>
              <button className="field-name" aria-pressed={i === selected} onClick={() => setSelected(i)}>
                {f.label || 'Trường mới'} ({FIELD_TYPE_LABEL[f.type]}
                {f.hidden ? ', ẩn' : ''}){f.required ? ' *' : ''}
              </button>
              {/* ▲▼ thay ↑↓: Windows vẽ ↑↓ bằng phông emoji có màu */}
              <button className="mv" aria-label="Lên" disabled={i === 0} onClick={() => move(i, -1)}>
                ▲
              </button>
              <button className="mv" aria-label="Xuống" disabled={i === state.fields.length - 1} onClick={() => move(i, 1)}>
                ▼
              </button>
            </li>
          ))}
          {slotStyle && <li className="slot" aria-hidden="true" data-testid="builder-drop-slot" style={slotStyle} />}
        </ul>
        <div className="addrow">
          <label className="field">
            <span>Loại trường</span>
            <select value={newType} onChange={(e) => setNewType(FIELD_TYPES.find((t) => t === e.target.value) ?? 'text')}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <button onClick={add}>+ Thêm trường</button>
        </div>
      </div>

      {!field && state.fields.length > 0 && (
        <p className="hint-box">Bấm vào một trường để sửa nhãn, bắt buộc, ẩn, lựa chọn.</p>
      )}
      {field && selected !== null && (
        <FieldEditor
          key={field.uid}
          field={field}
          onChange={(patch) => setState(updateField(state, selected, patch))}
          onRemove={field.saved ? undefined : () => setState(removeField(state, selected))}
        />
      )}

      <div className="actions">
        {prev ? (
          <button className="soft" onClick={() => exportForm(prev)}>
            Xuất form
          </button>
        ) : (
          <>
            <button className="soft" onClick={() => fileInput.current?.click()}>
              Nhập form
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              data-testid="import-form-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Xoá chọn để chọn lại cùng file (sau khi sửa file) vẫn có sự kiện change
                e.target.value = '';
                if (file) void importForm(file);
              }}
            />
          </>
        )}
      </div>

      {/* Trình đọc màn hình chỉ chắc chắn đọc khi chữ đổi trong một vùng status đã có sẵn trên trang; vùng
          mới chèn vào cùng lúc với chữ thì có máy bỏ qua (góp ý #73). Nên vùng này luôn có, chỉ đổi chữ */}
      <p className="visually-hidden" role="status" data-testid="builder-preview-status">
        {preview ? PREVIEW_MSG : ''}
      </p>
      {preview && (
        // Chỉ xem: khoá mọi ô để trường ảnh không ghi ảnh rác vào máy (nhóm chốt khi làm TV1-04)
        <fieldset disabled className="preview" id={previewId} ref={previewRef} data-testid="builder-preview">
          <legend>Xem trước</legend>
          {/* Chỉ để nhìn, không role: vùng status ẩn phía trên đã báo cho trình đọc màn hình */}
          <p className="pv-banner" data-testid="builder-preview-banner">
            <Icon name="eye" />
            {PREVIEW_MSG}
          </p>
          <FormRenderer db={db} form={previewForm} recordId="preview" value={{}} onChange={() => undefined} />
        </fieldset>
      )}

      {/* Lỗi ngay trên hàng nút để luôn ở gần [Lưu bản mới] */}
      {errors.length > 0 && (
        <ul className="err-banner" role="alert" data-testid="builder-errors" ref={errorsRef}>
          {errors.map((e) => (
            <li key={e}>⚠ {e}</li>
          ))}
        </ul>
      )}
      {/* Hàng nút dính đáy màn hình như trang điền phiếu (ui.md màn hình 5, TV1-12 b2) */}
      <div className="actionbar" data-testid="builder-actions" ref={actionsRef}>
        <button className="toggle" onClick={() => setPreview(!preview)} aria-expanded={preview} aria-controls={previewId}>
          <Icon name="eye" />
          Xem trước
        </button>
        <button className="primary" disabled={saving} aria-busy={saving} onClick={() => void save()}>
          Lưu bản mới
        </button>
        <BusyNote busy={saving} text="Đang lưu…" />
      </div>
    </section>
  );
}
