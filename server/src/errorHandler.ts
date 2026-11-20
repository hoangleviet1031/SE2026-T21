import type { ErrorRequestHandler } from 'express';

// Bộ xử lý lỗi cuối của app: mọi lỗi lọt khỏi route đều trả JSON theo design §7.1 thay cho trang
// HTML mặc định của Express (nợ N28).

export interface ErrorResponse {
  status: number;
  body: { error: string };
}

/**
 * Lỗi đọc thân request do body-parser báo (`express.json`, `express.raw`) mang `type` và `status`
 * 4xx: lỗi của bên gửi, nên trả 4xx để client không thử lại mãi như với 5xx (design §5.4).
 * Lỗi khác là lỗi server: `500 internal_error`.
 */
export function errorResponse(error: unknown): ErrorResponse {
  if (typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string') {
    if (error.type === 'entity.too.large') return { status: 413, body: { error: 'payload_too_large' } };
    const status = 'status' in error ? error.status : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return { status: 400, body: { error: 'invalid_body' } };
    }
  }
  return { status: 500, body: { error: 'internal_error' } };
}

export const finalErrorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  const { status, body } = errorResponse(error);
  if (status >= 500) {
    // Một dòng JSON như log request để `journalctl` lọc được; không ghi header hay thân request
    // (có thể chứa token, mật khẩu).
    console.error(
      JSON.stringify({
        level: 'error',
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? req.originalUrl,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
  }
  // Đã gửi một phần response thì không đổi được mã nữa: để Express cắt kết nối.
  if (res.headersSent) return next(error);
  res.status(status).json(body);
};
