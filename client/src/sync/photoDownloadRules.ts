import { NOT_MEMBER_MSG, SERVER_ERROR_MSG } from '../apiErrors';

// Quy tắc thuần của việc tải ảnh về để xem (design §5.6). Tách khỏi Dexie và mạng để unit test được.

/** Kết quả một lần tải. `saved`: máy đã có blob; `gone`: phiếu không còn hoặc CSDL đã đóng, không có gì để báo. */
export type PhotoFetchResult = 'saved' | 'gone' | 'network' | 'not_found' | 'server' | 'not_member' | 'auth' | 'storage_full';

/** Trạng thái của ô ảnh thiếu blob; chưa có kết quả thì là `loading`. */
export type PhotoFetchState = 'loading' | PhotoFetchResult;

/** Thân response có hạn riêng: timeout của api.ts chỉ canh tới lúc có header (design §5.6). */
export const PHOTO_BODY_TIMEOUT_MS = 60_000;

// Khớp IMAGE_TYPES ở server/src/uploads.ts: server chỉ nhận các loại này lúc complete.
const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Wifi có trang đăng nhập (captive portal) có thể trả HTML kèm `200`. Lưu thành ảnh `done` thì ô đó hỏng
 * luôn và không bao giờ tải lại, nên phải kiểm loại trước khi ghi.
 */
export function classifyDownload(status: number, blobType: string | undefined): 'ok' | 'not_found' | 'server' {
  if (status === 404) return 'not_found';
  if (status === 200 && blobType !== undefined && IMAGE_TYPES.includes(blobType)) return 'ok';
  return 'server';
}

/** Id thiếu blob mà chưa thử lần nào trong lần mở phiếu này (design §8: lỗi máy chủ không tự thử lại). */
export function idsToFetch(missing: string[], states: ReadonlyMap<string, PhotoFetchState>): string[] {
  return missing.filter((id) => !states.has(id));
}

/** Có mạng trở lại: bỏ kết quả lỗi mạng để `idsToFetch` thử thêm một lần; 404, 5xx giữ nguyên. */
export function clearNetworkFailures(states: ReadonlyMap<string, PhotoFetchState>): Map<string, PhotoFetchState> {
  return new Map([...states].filter(([, state]) => state !== 'network'));
}

const FAILURE_TEXT: readonly (readonly [PhotoFetchState, string])[] = [
  ['network', 'Cần kết nối để xem ảnh này'],
  ['not_found', 'Ảnh chưa được tải lên'],
  ['server', SERVER_ERROR_MSG],
  ['not_member', NOT_MEMBER_MSG],
  ['storage_full', 'Bộ nhớ đầy: đồng bộ rồi dọn ảnh đã tải lên'],
];

/**
 * Câu lỗi dưới lưới ảnh, mỗi loại một dòng. Thứ tự cố định để dòng đang hiện không bị đổi chỗ khi có loại
 * mới: DOM giữ nguyên thì trình đọc màn hình không báo lại (`role="alert"`).
 */
export function fetchFailureTexts(missing: string[], states: ReadonlyMap<string, PhotoFetchState>): string[] {
  const current = new Set(missing.map((id) => states.get(id)));
  return FAILURE_TEXT.filter(([state]) => current.has(state)).map(([, text]) => text);
}

/** Ô thiếu blob còn đang chờ: chưa bắt đầu, đang tải, hoặc đã lưu mà liveQuery chưa kịp trả dòng mới. */
export function isFetchPending(state: PhotoFetchState | undefined): boolean {
  return state === undefined || state === 'loading' || state === 'saved';
}

/** Đọc thân response trong `ms`. Hết giờ thì thân vẫn tải tiếp ngầm vì request() không cho huỷ từ ngoài; vô hại. */
export async function blobWithin(res: Response, ms: number): Promise<Blob> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('quá hạn tải thân response')), ms);
  });
  try {
    return await Promise.race([res.blob(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
