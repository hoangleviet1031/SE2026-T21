import { Router, type RequestHandler } from 'express';

// API kiểm thử (chỉ bật khi ENABLE_TEST_ROUTES=1). Xem docs/design.md §10.1 "API kiểm thử".
// POST /api/__test/faults { mode, count, match?, chunkIndex? }: `count` request khớp tiếp theo dưới
// /api/projects/:projectId bị lỗi theo `mode`. GET/DELETE /api/__test/stats: nhật ký request.
// Trạng thái là biến toàn cục của module: một server E2E dùng chung, test chạy tuần tự (workers: 1).

const MODES = ['500', '400', 'timeout', 'drop', 'drop-before'] as const;
type Mode = (typeof MODES)[number];

interface Fault {
  mode: Mode;
  count: number;
  /** Tiền tố đường dẫn sau /api/projects/:projectId; không có thì "/records" như trước khi có match. */
  match?: string;
  /** Chỉ áp cho PUT .../chunks/<chunkIndex> (E2E R4). */
  chunkIndex?: number;
}

let pending: Fault | null = null;

interface LoggedRequest {
  method: string;
  path: string;
  idempotencyKey?: string;
  /** 0: kết nối bị cắt, client không nhận được response. */
  status: number;
}

let log: LoggedRequest[] = [];

function parseFault(body: unknown): Fault | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (!MODES.includes(b.mode as Mode)) return undefined;
  if (!Number.isInteger(b.count) || (b.count as number) < 0) return undefined;
  if (b.match !== undefined && (typeof b.match !== 'string' || !b.match.startsWith('/'))) return undefined;
  if (b.chunkIndex !== undefined && (!Number.isInteger(b.chunkIndex) || (b.chunkIndex as number) < 0)) {
    return undefined;
  }
  const fault: Fault = { mode: b.mode as Mode, count: b.count as number };
  if (b.match !== undefined) fault.match = b.match as string;
  if (b.chunkIndex !== undefined) fault.chunkIndex = b.chunkIndex as number;
  return fault;
}

export function faultsRouter(): Router {
  const r = Router();
  r.post('/faults', (req, res) => {
    const fault = parseFault(req.body);
    if (!fault) return void res.status(400).json({ error: 'invalid_body' });
    pending = fault.count > 0 ? fault : null;
    res.json({ ok: true, pending });
  });
  r.delete('/faults', (_req, res) => {
    pending = null;
    res.json({ ok: true });
  });
  r.get('/stats', (_req, res) => {
    res.json({ requests: log });
  });
  r.delete('/stats', (_req, res) => {
    log = [];
    res.json({ ok: true });
  });
  return r;
}

/** Ghi mọi request dưới /api/projects/ khi kết thúc, kể cả request bị cắt kết nối giữa chừng. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const entry: LoggedRequest = { method: req.method, path: req.originalUrl.split('?')[0] ?? req.originalUrl, status: 0 };
  const key = req.header('Idempotency-Key');
  if (key) entry.idempotencyKey = key;
  // 'close' chạy cả khi socket bị huỷ; writableFinished cho biết response đã gửi xong hay chưa.
  res.on('close', () => {
    log.push({ ...entry, status: res.writableFinished ? res.statusCode : 0 });
  });
  next();
};

function matches(fault: Fault, path: string): boolean {
  if (!path.startsWith(fault.match ?? '/records')) return false;
  if (fault.chunkIndex === undefined) return true;
  return path.endsWith(`/chunks/${fault.chunkIndex}`);
}

/** Gắn ở /api/projects/:projectId nên `req.path` là phần sau tiền tố dự án, vd. "/records/abc". */
export const faultInjector: RequestHandler = (req, res, next) => {
  if (!pending || pending.count <= 0 || !matches(pending, req.path)) return next();
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
