// Giới hạn tần suất trong bộ nhớ tiến trình cho đăng nhập sai và đăng ký (ADR 0003 §1).
// Khởi động lại server thì mất bộ đếm; đủ cho quy mô đồ án. Cửa sổ trượt: chặn khi trong
// `windowMs` gần nhất đã có `limit` lần, mở lại khi lần cũ nhất ra khỏi cửa sổ.
// Nhận `now` qua tham số để test không phải chờ thật.
//
// Nơi gọi có `await` (scrypt) giữa lúc kiểm và lúc biết kết quả phải giữ chỗ trước: kiểm `isBlocked`
// rồi `hit` ngay, không có `await` ở giữa (JS chạy một luồng nên hai bước này không bị request khác
// chen vào), rồi `release` nếu hoá ra lần đó không tính. Nếu chờ xong mới `hit`, nhiều request gửi
// cùng lúc đều qua được bước kiểm.

export interface RateLimiter {
  isBlocked(key: string, now: number): boolean;
  hit(key: string, now: number): void;
  /** Bỏ một lần đã `hit` đúng lúc `at` (lượt giữ chỗ hoá ra không tính). Không có thì thôi. */
  release(key: string, at: number): void;
  /** Bỏ các khoá không còn lần nào trong cửa sổ. */
  sweep(now: number): void;
  size(): number;
}

// Kẻ tấn công thử nhiều tên khác nhau sẽ làm map phình ra; quá ngưỡng này thì dọn một lượt.
const SWEEP_THRESHOLD = 10_000;

export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    const list = (hits.get(key) ?? []).filter((t) => t > now - opts.windowMs);
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return list;
  }

  function sweep(now: number): void {
    for (const key of [...hits.keys()]) recent(key, now);
  }

  return {
    isBlocked: (key, now) => recent(key, now).length >= opts.limit,
    hit: (key, now) => {
      if (hits.size > SWEEP_THRESHOLD) sweep(now);
      hits.set(key, [...recent(key, now), now]);
    },
    release: (key, at) => {
      const list = hits.get(key);
      const i = list?.indexOf(at) ?? -1;
      if (!list || i < 0) return;
      list.splice(i, 1);
      if (list.length === 0) hits.delete(key);
    },
    sweep,
    size: () => hits.size,
  };
}
