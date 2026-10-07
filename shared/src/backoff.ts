// Exponential backoff có jitter cho sync queue.
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

export function nextRetryDelay(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempts);
  // "Full jitter": tránh nhiều máy cùng retry một lúc khi server vừa sống lại
  return Math.round(exp / 2 + random() * (exp / 2));
}
