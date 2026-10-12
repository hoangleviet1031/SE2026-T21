import { Router, type RequestHandler } from 'express';

// Tiêm lỗi để kiểm thử retry (chỉ bật khi ENABLE_TEST_ROUTES=1). Xem docs/design.md §10.1.
// POST /api/__test/faults { "mode": "500" | "400" | "timeout" | "drop" | "drop-before", "count": 3 }
// -> `count` request /api/projects/:projectId/records tiếp theo sẽ lỗi theo mode.
type Mode = '500' | '400' | 'timeout' | 'drop' | 'drop-before';
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
  // Lỗi dữ liệu không retry được (R5): client đánh dấu op failed, phiếu "Lỗi"
  if (mode === '400') return void res.status(400).json({ error: 'injected_fault' });
  // Mất mạng trước khi server nhận request: không ghi gì
  if (mode === 'drop-before') return void req.socket.destroy();
  if (mode === 'drop') {
    // Server ghi xong (transaction đã commit) rồi mất kết nối trước khi client nhận response (R3):
    // handler vẫn chạy, chỉ thay việc gửi response bằng việc cắt socket.
    res.json = () => {
      req.socket.destroy();
      return res;
    };
    return next();
  }
  // timeout: giữ request lâu hơn timeout của client rồi mới xử lý
  setTimeout(next, 15_000);
};
