import { useEffect, useRef, useState } from 'react';
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
  removeField,
  setFormId,
  setTitle,
  toSaveRequest,
  updateField,
  type BuilderState,
} from '../builder';
import { FieldEditor } from '../components/FieldEditor';
import { FormRenderer } from '../components/FormRenderer';
import { formFileName, formFileText, parseFormFile } from '../formFile';
import { useCurrentProject, useCurrentProjectDb } from '../db/current';
import { formKey, type ProjectDb } from '../db/projectDb';
import { canManageProject } from '../projects';
import { apiFailureText } from '../apiErrors';
import { apiFailure, saveForm } from '../sync/api';
import { navigate } from '../useHashRoute';

const OFFLINE_MSG = 'Cần kết nối để lưu form';

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
    if (next !== state && selected === index) setSelected(index + delta);
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
      <h2>{prev ? `Sửa form: ${prev.title}` : 'Biểu mẫu mới'}</h2>
      <label className="field">
        <span>Tiêu đề</span>
        <input value={state.title} onChange={(e) => setState(setTitle(state, e.target.value))} />
      </label>
      <label className="field">
        <span>Mã biểu mẫu</span>
        {state.idLocked ? (
          <code>{state.id} (khoá)</code>
        ) : (
          <input
            value={state.id}
            onChange={(e) => setState(setFormId(state, e.target.value))}
            autoCapitalize="off"
            spellCheck={false}
          />
        )}
      </label>

      <h3>Trường</h3>
      <ul className="list" data-testid="builder-fields">
        {state.fields.map((f, i) => (
          <li key={f.uid} className={i === selected ? 'field-row selected' : 'field-row'}>
            <button className="field-name" aria-pressed={i === selected} onClick={() => setSelected(i)}>
              {f.label || 'Trường mới'} ({FIELD_TYPE_LABEL[f.type]}
              {f.hidden ? ', ẩn' : ''}){f.required ? ' *' : ''}
            </button>
            {/* ▲▼ thay ↑↓: Windows vẽ ↑↓ bằng phông emoji có màu */}
            <span className="move">
              <button aria-label="Lên" disabled={i === 0} onClick={() => move(i, -1)}>
                ▲
              </button>
              <button aria-label="Xuống" disabled={i === state.fields.length - 1} onClick={() => move(i, 1)}>
                ▼
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="actions">
        <select aria-label="Loại trường" value={newType} onChange={(e) => setNewType(FIELD_TYPES.find((t) => t === e.target.value) ?? 'text')}>
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button onClick={add}>+ Thêm trường</button>
      </div>

      {!field && state.fields.length > 0 && (
        <p className="hint">Bấm vào một trường để sửa nhãn, bắt buộc, ẩn, lựa chọn.</p>
      )}
      {field && selected !== null && (
        <FieldEditor
          key={field.uid}
          field={field}
          onChange={(patch) => setState(updateField(state, selected, patch))}
          onRemove={field.saved ? undefined : () => setState(removeField(state, selected))}
        />
      )}

      {errors.length > 0 && (
        <ul className="warning" role="alert" data-testid="builder-errors">
          {errors.map((e) => (
            <li key={e}>⚠ {e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button onClick={() => setPreview(!preview)} aria-expanded={preview}>
          Xem trước
        </button>
        <button className="primary" disabled={saving} onClick={() => void save()}>
          Lưu bản mới
        </button>
      </div>

      <div className="actions">
        {prev ? (
          <button onClick={() => exportForm(prev)}>Xuất form</button>
        ) : (
          <>
            <button onClick={() => fileInput.current?.click()}>Nhập form</button>
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

      {preview && (
        // Chỉ xem: khoá mọi ô để trường ảnh không ghi ảnh rác vào máy (nhóm chốt khi làm TV1-04)
        <fieldset disabled className="preview" data-testid="builder-preview">
          <legend>Xem trước</legend>
          <FormRenderer db={db} form={previewForm} recordId="preview" value={{}} onChange={() => undefined} />
        </fieldset>
      )}
    </section>
  );
}
