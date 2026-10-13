import type { FieldDef } from '@field-survey/shared';
import { FIELD_TYPE_LABEL, parseOptions, type DraftField } from '../builder';

interface Props {
  field: DraftField;
  onChange: (patch: Partial<Pick<FieldDef, 'id' | 'label' | 'required' | 'hidden' | 'options'>>) => void;
  /** Chỉ có với trường chưa lưu; trường đã lưu phải dùng "Ẩn" (design §4.1) */
  onRemove?: () => void;
}

// Panel thuộc tính của trường đang chọn (ui.md màn hình 5).
export function FieldEditor({ field, onChange, onRemove }: Props) {
  const hasOptions = field.type === 'select' || field.type === 'multiselect';
  return (
    <div className="form" data-testid="field-editor">
      <h3>
        Thuộc tính: {field.label || 'Trường mới'} ({FIELD_TYPE_LABEL[field.type]})
      </h3>
      <label className="field">
        <span>Nhãn</span>
        <input value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label className="field">
        <span>Mã</span>
        {field.saved ? (
          // Mã là khoá dữ liệu của phiếu cũ, đổi là mất liên kết (design §4.1)
          <code>{field.id} (khoá)</code>
        ) : (
          <input
            value={field.id}
            onChange={(e) => onChange({ id: e.target.value })}
            autoCapitalize="off"
            spellCheck={false}
          />
        )}
      </label>
      <div className="checks">
        <label>
          <input type="checkbox" checked={field.required ?? false} onChange={(e) => onChange({ required: e.target.checked })} />{' '}
          Bắt buộc
        </label>
        <label>
          <input type="checkbox" checked={field.hidden ?? false} onChange={(e) => onChange({ hidden: e.target.checked })} />{' '}
          Ẩn
        </label>
      </div>
      {hasOptions && (
        <label className="field">
          <span>Lựa chọn (mỗi dòng một lựa chọn)</span>
          {/* Không điều khiển: giữ nguyên dòng trống đang gõ dở, chỉ đưa danh sách đã lọc lên state.
              Trang cha đặt key theo uid của trường nên đổi trường thì ô này dựng lại. */}
          <textarea
            rows={4}
            defaultValue={(field.options ?? []).join('\n')}
            onChange={(e) => onChange({ options: parseOptions(e.target.value) })}
          />
        </label>
      )}
      {onRemove && (
        <div className="actions">
          <button onClick={onRemove}>Xoá trường</button>
        </div>
      )}
    </div>
  );
}
