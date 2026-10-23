import { useRef, useState } from 'react';
import type { FieldDef, FieldValue, FormSchema, GpsValue, RecordData } from '@field-survey/shared';
import type { ProjectDb } from '../db/projectDb';
import { fieldMode } from '../formDisplay';
import { GPS_TIMEOUT_MS, gpsErrorText } from '../gps';
import { BusyNote } from './BusyNote';
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
  // Đọc bản mới nhất lúc ghi: vị trí GPS về sau tới 30 s, trong lúc đó người dùng có thể đã sửa ô khác;
  // ghép vào `value` lúc bấm nút thì mất phần vừa sửa.
  const latest = useRef(value);
  latest.current = value;
  const set = (field: string, v: FieldValue) => onChange({ ...latest.current, [field]: v });
  return (
    <div className="form">
      {form.fields.map((f) => {
        const mode = fieldMode(f, value[f.id], errors[f.id] !== undefined);
        if (mode === 'hidden') return null;
        const input = (
          <FieldInput db={db} field={f} recordId={recordId} value={value[f.id] ?? null} onChange={(v) => set(f.id, v)} />
        );
        // Trường ảnh, GPS có nút bên trong: bọc bằng <label> thì bấm vào tên trường sẽ bấm nhầm nút đầu tiên.
        const hasButtons = f.type === 'photo' || f.type === 'gps';
        const Wrapper = hasButtons ? 'div' : 'label';
        const groupProps = hasButtons ? { role: 'group', 'aria-label': f.label } : {};
        return (
          <Wrapper key={f.id} className="field" {...groupProps}>
            <span>
              {f.label}
              {f.required && !f.hidden && ' *'}
              {f.hidden && ' (đã ẩn)'}
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
    case 'gps':
      return <GpsField value={value as GpsValue | null} onChange={onChange} />;
  }
}

// GPS chỉ lấy khi người dùng bấm, không chạy nền (design §9). Lỗi và giờ chờ theo design §8.
function GpsField({ value, onChange }: { value: GpsValue | null; onChange: (v: GpsValue) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = () => {
    if (!('geolocation' in navigator)) return setError(gpsErrorText('unsupported'));
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        onChange({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (e) => {
        setBusy(false);
        setError(gpsErrorText(e.code));
      },
      { timeout: GPS_TIMEOUT_MS },
    );
  };

  return (
    <div>
      <button type="button" disabled={busy} aria-busy={busy} onClick={locate}>
        Lấy vị trí
      </button>
      <BusyNote busy={busy} text="Đang lấy vị trí…" visible />
      {value && (
        <small>
          {' '}
          {value.lat.toFixed(5)}, {value.lng.toFixed(5)} (±{Math.round(value.accuracy ?? 0)} m)
        </small>
      )}
      {error && (
        <span className="field-error" role="alert" data-testid="gps-error">
          ⚠ {error}
        </span>
      )}
    </div>
  );
}
