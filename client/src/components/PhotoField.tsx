import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ProjectDb } from '../db/projectDb';
import { addPhoto, StorageFullError } from '../db/attachments';
import { compressImage, ImageDecodeError } from '../media/compress';

// Trường ảnh (ui.md màn hình 4: [▢][▢] [+ Chụp ảnh]). Nén trước khi lưu (design §4.4).
// Bỏ ảnh chỉ bỏ id khỏi trường; blob giữ trên máy tới khi người dùng dọn bộ nhớ (§5.6).

const MESSAGES = {
  storageFull: 'Bộ nhớ đầy: đồng bộ rồi dọn ảnh đã tải lên',
  decode: 'Không đọc được ảnh này. Hãy chụp lại hoặc chọn ảnh JPEG/PNG',
} as const;

interface Props {
  db: ProjectDb;
  fieldId: string;
  recordId: string;
  ids: string[];
  onChange: (ids: string[]) => void;
}

/** URL xem trước cho các ảnh đang có trong trường; thu hồi khi danh sách đổi hoặc rời trang. */
function usePreviewUrls(db: ProjectDb, ids: string[]): Map<string, string> {
  const rows = useLiveQuery(() => db.attachments.bulkGet(ids), [db, ids.join(',')]);
  const [urls, setUrls] = useState(new Map<string, string>());
  useEffect(() => {
    const next = new Map<string, string>();
    for (const row of rows ?? []) if (row) next.set(row.id, URL.createObjectURL(row.blob));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [rows]);
  return urls;
}

export function PhotoField({ db, fieldId, recordId, ids, onChange }: Props) {
  const urls = usePreviewUrls(db, ids);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(file);
      const id = await addPhoto(db, { recordId, fieldId, blob });
      onChange([...ids, id]);
    } catch (e) {
      if (e instanceof StorageFullError) setError(MESSAGES.storageFull);
      else if (e instanceof ImageDecodeError) setError(MESSAGES.decode);
      else throw e;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photos">
      {ids.map((id, i) => (
        <span key={id} className="photo-thumb" data-testid="photo-thumb">
          {urls.has(id) ? <img src={urls.get(id)} alt={`Ảnh ${i + 1}`} /> : <span className="photo-missing">Ảnh</span>}
          {/* Khoá khi đang nén: ảnh mới được thêm vào danh sách lúc bắt đầu chọn, bỏ ảnh giữa chừng sẽ bị ghi đè */}
          <button
            type="button"
            aria-label={`Bỏ ảnh ${i + 1}`}
            disabled={busy}
            onClick={() => onChange(ids.filter((x) => x !== id))}
          >
            ×
          </button>
        </span>
      ))}
      <label className="photo-add">
        {busy ? 'Đang xử lý ảnh…' : '+ Chụp ảnh'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          data-testid={`photo-input-${fieldId}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Xoá giá trị để chọn lại đúng file đó vẫn kích hoạt onChange.
            e.target.value = '';
            if (file) void add(file);
          }}
        />
      </label>
      {error && (
        <span className="field-error" role="alert" data-testid={`photo-error-${fieldId}`}>
          ⚠ {error}
        </span>
      )}
    </div>
  );
}
