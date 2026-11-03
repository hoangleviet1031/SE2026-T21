import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalAttachment, ProjectDb } from '../db/projectDb';
import { addPhoto, StorageFullError } from '../db/attachments';
import { compressImage, ImageDecodeError } from '../media/compress';
import { downloadPhoto } from '../sync/photoDownload';
import {
  clearNetworkFailures,
  fetchFailureTexts,
  idsToFetch,
  isFetchPending,
  type PhotoFetchState,
} from '../sync/photoDownloadRules';
import { useOnline } from '../useOnline';
import { Icon } from './Icon';

// Trường ảnh (ui.md màn hình 4: [▢][▢] [+ Chụp ảnh]). Nén trước khi lưu (design §4.4).
// Bỏ ảnh chỉ bỏ id khỏi trường; blob giữ trên máy tới khi người dùng dọn bộ nhớ (§5.6).
// Ảnh chưa có blob (phiếu máy khác tạo) tải về khi mở phiếu, qua sync/photoDownload.ts (§5.6).

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

// Nhãn nhỏ trên ảnh thu nhỏ (design §5.6: trang xem phiếu báo ảnh đang tải lên). Ảnh đã lên thì không hiện gì.
const UPLOAD_BADGE: Record<LocalAttachment['uploadState'], string | null> = {
  pending: 'Chờ tải lên',
  uploading: 'Đang tải lên',
  done: null,
  failed: 'Lỗi',
};

/**
 * Ảnh đang có trong trường: URL xem trước và trạng thái upload. Hàng đợi ảnh cập nhật bản ghi
 * liên tục khi đang gửi, nên chỉ tạo lại URL khi danh sách ảnh có trên máy đổi, không phải mỗi lần cập nhật.
 */
function usePhotos(db: ProjectDb, ids: string[]) {
  const key = ids.join(',');
  // Kèm key: đổi danh sách ảnh thì liveQuery còn trả kết quả cũ một nhịp, ảnh vừa thêm sẽ bị coi là thiếu.
  const result = useLiveQuery(() => db.attachments.bulkGet(ids).then((rows) => ({ key, rows })), [db, key]);
  const present = (result?.rows ?? []).filter((r): r is LocalAttachment => r !== undefined);
  const presentKey = present.map((r) => r.id).join(',');
  const [urls, setUrls] = useState(new Map<string, string>());
  useEffect(() => {
    const next = new Map<string, string>();
    for (const row of present) next.set(row.id, URL.createObjectURL(row.blob));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
    // Chỉ theo presentKey: `present` đổi danh tính mỗi lần hàng đợi cập nhật bản ghi.
  }, [presentKey]);
  const states = new Map(present.map((r) => [r.id, r.uploadState]));
  const absent = ids.filter((id) => !present.some((r) => r.id === id));
  // loaded = false: kết quả chưa khớp danh sách hiện tại, ảnh trong `absent` chưa chắc đã thiếu.
  return { urls, states, absent, loaded: result?.key === key };
}

/**
 * Tải ảnh còn thiếu blob của phiếu đang mở (design §5.6). Mỗi ảnh thử một lần cho mỗi lần mở phiếu, trạng
 * thái nằm trong ref nên liveQuery chạy lại không gọi thêm; có mạng trở lại thì thử thêm một lần cho ảnh lỗi
 * mạng (như thiếu bản form, §8). 404, 5xx chỉ thử lại khi mở lại phiếu.
 */
function usePhotoDownloads(db: ProjectDb, recordId: string, fieldId: string, missing: string[] | undefined) {
  const online = useOnline();
  const [states, setStates] = useState<ReadonlyMap<string, PhotoFetchState>>(new Map());
  const latest = useRef(states);
  const wasOnline = useRef(online);
  const missingKey = missing?.join(',');

  useEffect(() => {
    const set = (next: ReadonlyMap<string, PhotoFetchState>) => {
      latest.current = next;
      setStates(next);
    };
    const mark = (id: string, state: PhotoFetchState) => set(new Map(latest.current).set(id, state));
    if (online && !wasOnline.current) set(clearNetworkFailures(latest.current));
    wasOnline.current = online;
    if (!missing) return;
    for (const id of idsToFetch(missing, latest.current)) {
      mark(id, 'loading');
      downloadPhoto(db, { id, recordId, fieldId })
        .then((result) => mark(id, result))
        .catch((e: unknown) => {
          console.warn('không tải được ảnh', e);
          mark(id, 'server');
        });
    }
    // Chỉ theo missingKey: `missing` đổi danh tính mỗi lần render.
  }, [db, recordId, fieldId, missingKey, online]);

  return states;
}

function UploadBadge({ state }: { state: LocalAttachment['uploadState'] | undefined }) {
  const text = state ? UPLOAD_BADGE[state] : null;
  if (!state || !text) return null;
  return (
    <span className={`photo-state ${state}`} data-testid="photo-state">
      {text}
    </span>
  );
}

export function PhotoField({ db, fieldId, recordId, ids, onChange }: Props) {
  const { urls, states, absent, loaded } = usePhotos(db, ids);
  const fetchStates = usePhotoDownloads(db, recordId, fieldId, loaded ? absent : undefined);
  // Không phụ thuộc `loaded` với ảnh đã bắt đầu tải: nếu không, thêm ảnh khác làm câu lỗi và vùng status biến
  // mất một nhịp rồi hiện lại, trình đọc màn hình sẽ báo lặp.
  const pending = (id: string) =>
    absent.includes(id) && (loaded || fetchStates.has(id)) && isFetchPending(fetchStates.get(id));
  const fetchFailures = fetchFailureTexts(absent, fetchStates);
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
          {urls.has(id) ? (
            <img src={urls.get(id)} alt={`Ảnh ${i + 1}`} />
          ) : (
            // Chữ trong ô để nhìn; trình đọc màn hình đọc tên ô, trạng thái đọc ở vùng status chung bên dưới
            <span className="photo-missing" role="img" aria-label={`Ảnh ${i + 1}`} data-testid="photo-missing">
              <span aria-hidden="true">
                {pending(id) ? (
                  <>
                    <span className="spin" />
                    Đang tải…
                  </>
                ) : (
                  'Ảnh'
                )}
              </span>
            </span>
          )}
          <UploadBadge state={states.get(id)} />
          {/* Chưa có blob thì không cho bỏ: người dùng chưa thấy ảnh, và ảnh có thể đang trên đường lên server (bất biến 1) */}
          {urls.has(id) && (
            // Khoá khi đang nén: ảnh mới được thêm vào danh sách lúc bắt đầu chọn, bỏ ảnh giữa chừng sẽ bị ghi đè
            <button
              type="button"
              aria-label={`Bỏ ảnh ${i + 1}`}
              disabled={busy}
              onClick={() => onChange(ids.filter((x) => x !== id))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {/* Phiếu chỉ đọc thì CSS ẩn ô này và nút × (fieldset bị khoá), để khỏi lọt vào phím Tab và trình đọc màn hình */}
      <label className="photo-add">
        <Icon name="camera" />
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
      {/*
        Một vùng cho cả trường: mỗi ô một status thì phiếu nhiều ảnh bị đọc lặp. Có ảnh mới cần vùng này (xem trước ở
        builder không được có thêm status); lúc ids vừa có thì `loaded` còn false nên vùng vào DOM rỗng, rồi mới có chữ.
      */}
      {ids.length > 0 && (
        <span className="visually-hidden" role="status" data-testid={`photo-fetch-status-${fieldId}`}>
          {ids.some(pending) ? 'Đang tải ảnh…' : ''}
        </span>
      )}
      {/* key theo câu và thứ tự cố định: render lại không đổi DOM nên role="alert" không báo lặp */}
      {fetchFailures.map((text) => (
        <span key={text} className="field-error" role="alert" data-testid={`photo-fetch-error-${fieldId}`}>
          ⚠ {text}
        </span>
      ))}
    </div>
  );
}
