// API bắt buộc của app (design §11.1). Thiếu một cái thì app chạy sai nửa chừng (không lưu được
// offline, gửi trùng op...), nên chặn từ đầu bằng màn hình "Trình duyệt không được hỗ trợ".

/** Phần của `window` cần kiểm; tách ra để unit test được mà không cần trình duyệt. */
export interface BrowserEnv {
  navigator: { serviceWorker?: unknown; locks?: unknown };
  indexedDB?: unknown;
  crypto?: { randomUUID?: unknown; subtle?: unknown };
}

const present = (v: unknown) => v !== undefined && v !== null;

/** Tên API thiếu, theo thứ tự trong design §11.1. Mảng rỗng nghĩa là chạy được. */
export function missingFeatures(env: BrowserEnv): string[] {
  const checks: [string, boolean][] = [
    // Service Worker và crypto.subtle chỉ có trên HTTPS hoặc localhost
    ['Service Worker', present(env.navigator.serviceWorker)],
    ['IndexedDB', present(env.indexedDB)],
    ['crypto.randomUUID', typeof env.crypto?.randomUUID === 'function'],
    ['Web Locks', present(env.navigator.locks)],
    ['crypto.subtle', present(env.crypto?.subtle)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}
