import type { FieldDef, FieldValue, FormSchema, GpsValue, RecordData } from '@field-survey/shared';
import { db } from '../db/db';

interface Props {
  form: FormSchema;
  recordId: string;
  value: RecordData;
  onChange: (next: RecordData) => void;
}

// TODO(Thành viên 1): validate (required, kiểu số), hiển thị lỗi theo trường, điều kiện hiển thị.
export function FormRenderer({ form, recordId, value, onChange }: Props) {
  const set = (field: string, v: FieldValue) => onChange({ ...value, [field]: v });
  return (
    <div className="form">
      {form.fields.map((f) => (
        <label key={f.id} className="field">
          <span>
            {f.label}
            {f.required && ' *'}
          </span>
          <FieldInput field={f} recordId={recordId} value={value[f.id] ?? null} onChange={(v) => set(f.id, v)} />
        </label>
      ))}
    </div>
  );
}

function FieldInput({
  field,
  recordId,
  value,
  onChange,
}: {
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
    case 'photo': {
      const ids = (value as string[]) ?? [];
      return (
        <div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // TODO(Thành viên 3): nén ảnh (canvas, ~1600px, JPEG 0.8) trước khi lưu
              const id = crypto.randomUUID();
              await db.attachments.add({
                id,
                recordId,
                fieldId: field.id,
                blob: file,
                mimeType: file.type,
                uploadedChunks: [],
                uploadState: 'pending',
              });
              onChange([...ids, id]);
            }}
          />
          {ids.length > 0 && <small>{ids.length} ảnh</small>}
        </div>
      );
    }
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
