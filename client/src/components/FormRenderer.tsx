import type { FieldDef, FieldValue, FormSchema, GpsValue, RecordData } from '@field-survey/shared';
import type { ProjectDb } from '../db/projectDb';
import { fieldMode } from '../formDisplay';
import { PhotoField } from './PhotoField';

interface Props {
  /** CSDL của dự án đang chọn, trang cha lấy qua useCurrentProjectDb */
  db: ProjectDb;
  form: FormSchema;
  recordId: string;
  value: RecordData;
  onChange: (next: RecordData) => void;
  /** Lỗi validate theo id trường (design §4.1), hiện ngay dưới trường đó */
  errors?: Record<string, string>;
}

export function FormRenderer({ db, form, recordId, value, onChange, errors = {} }: Props) {
  const set = (field: string, v: FieldValue) => onChange({ ...value, [field]: v });
  return (
    <div className="form">
      {form.fields.map((f) => {
        const mode = fieldMode(f, value[f.id]);
        if (mode === 'hidden') return null;
        const input = (
          <FieldInput db={db} field={f} recordId={recordId} value={value[f.id] ?? null} onChange={(v) => set(f.id, v)} />
        );
        // Trường ảnh có nhiều nút bên trong: bọc bằng <label> thì bấm vào tên trường sẽ bấm nhầm nút đầu tiên.
        const Wrapper = f.type === 'photo' ? 'div' : 'label';
        const groupProps = f.type === 'photo' ? { role: 'group', 'aria-label': f.label } : {};
        return (
          <Wrapper key={f.id} className="field" {...groupProps}>
            <span>
              {f.label}
              {f.required && !f.hidden && ' *'}
              {mode === 'readonly' && ' (đã ẩn)'}
            </span>
            {/* fieldset khoá được cả các nút bên trong (trường ảnh, GPS), không chỉ ô nhập */}
            {mode === 'readonly' ? (
              <fieldset disabled className="readonly">
                {input}
              </fieldset>
            ) : (
              input
            )}
            {errors[f.id] && (
              <span className="field-error" data-testid={`error-${f.id}`}>
                ⚠ {errors[f.id]}
              </span>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}

function FieldInput({
  db,
  field,
  recordId,
  value,
  onChange,
}: {
  db: ProjectDb;
  field: FieldDef;
  recordId: string;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  switch (field.type) {
    case 'text':
      return <input name={field.id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return (
        <input
          name={field.id}
          type="number"
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return <input name={field.id} type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <select name={field.id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">-- Chọn --</option>
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case 'multiselect': {
      const selected = (value as string[]) ?? [];
      return (
        <div className="checks">
          {field.options?.map((o) => (
            <label key={o}>
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'photo':
      return (
        <PhotoField
          db={db}
          fieldId={field.id}
          recordId={recordId}
          ids={(value as string[] | null) ?? []}
          onChange={onChange}
        />
      );
    case 'gps': {
      const gps = value as GpsValue | null;
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              navigator.geolocation.getCurrentPosition((p) =>
                onChange({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
              )
            }
          >
            Lấy vị trí
          </button>
          {gps && (
            <small>
              {' '}
              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (±{Math.round(gps.accuracy ?? 0)} m)
            </small>
          )}
        </div>
      );
    }
  }
}
