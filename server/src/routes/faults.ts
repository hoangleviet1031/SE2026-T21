import { Router, type RequestHandler } from 'express';

// Tiêm lỗi để kiểm thử retry (chỉ bật khi ENABLE_TEST_ROUTES=1).
// POST /api/__test/faults { "mode": "500" | "timeout" | "drop", "count": 3 }
// -> `count` request /api/records tiếp theo sẽ lỗi theo mode.
type Mode = '500' | 'timeout' | 'drop';
let pending: { mode: Mode; count: number } | null = null;

export function faultsRouter(): Router {
  const r = Router();
  r.post('/faults', (req, res) => {
    const { mode, count } = req.body as { mode: Mode; count: number };
    pending = count > 0 ? { mode, count } : null;
    res.json({ ok: true, pending });
  });
  r.delete('/faults', (_req, res) => {
    pending = null;
    res.json({ ok: true });
  });
  return r;
}

export const faultInjector: RequestHandler = (req, res, next) => {
  if (!pending || pending.count <= 0) return next();
  pending.count -= 1;
  const mode = pending.mode;
  if (pending.count === 0) pending = null;
  if (mode === '500') return void res.status(500).json({ error: 'injected_fault' });
  if (mode === 'drop') return void req.socket.destroy();
  // timeout: giữ request lâu hơn timeout của client rồi mới xử lý
  setTimeout(next, 15_000);
};
