import type { AuthResponse, LoginRequest } from '@field-survey/shared';
import type { AccountErrorCode } from '../sync/api';
import type { AdminSession } from './session';

// Gọi API cho trang quản trị. Không dùng lại src/sync/api.ts vì file đó lấy token qua auth.ts, mà
// auth.ts mở IndexedDB (Dexie); trang quản trị không được có IndexedDB (design §4.9). Chỉ import kiểu
// từ api.ts (bị xoá khi build), không kéo mã của nó vào bản build admin.

const TIMEOUT_MS = 10_000;

export class NetworkError extends Error {}

/** Sai tên/mật khẩu, quá nhiều lần thử… (design §7.1) */
export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(`tài khoản: ${code}`);
  }
}

/** Tài khoản đăng nhập được nhưng không phải admin. Phiên vừa cấp đã bị huỷ, không lưu gì. */
export class NotAdminError extends Error {
  constructor() {
    super('tài khoản không phải quản trị');
  }
}

const ACCOUNT_ERROR_CODES: readonly AccountErrorCode[] = [
  'invalid_credentials',
  'username_taken',
  'too_many_requests',
  'invalid_body',
];

async function errorCode(res: Response): Promise<string | undefined> {
  const body: unknown = await res
    .clone()
    .json()
    // Thân không phải JSON (vd. proxy trả HTML): coi như không có mã lỗi
    .catch(() => undefined);
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  return typeof body.error === 'string' ? body.error : undefined;
}

/** fetch có timeout; mất mạng, timeout, kết nối bị cắt đều thành NetworkError. */
async function timedFetch(path: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(path, { ...init, signal: ctrl.signal });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** Huỷ phiên của `token`. 401 nghĩa là phiên đã mất từ trước, cũng coi như xong. */
export async function logoutSession(token: string): Promise<void> {
  const res = await timedFetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204 || res.status === 401) return;
  throw new Error(`POST /api/auth/logout ${res.status}`);
}

/**
 * Đăng nhập trang quản trị. Lấy thông tin người dùng từ response đăng nhập, không gọi `/api/me`: SW của
 * app khảo sát cùng origin cache `/api/me` (NetworkFirst), mạng chập chờn thì có thể trả `/me` của tài
 * khoản thường đã dùng app trên máy này.
 */
export async function adminLogin(body: LoginRequest): Promise<AdminSession> {
  const res = await timedFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const code = await errorCode(res);
    const known = ACCOUNT_ERROR_CODES.find((c) => c === code);
    if (known) throw new AccountError(known);
    throw new Error(`POST /api/auth/login ${res.status}`);
  }
  const session: AuthResponse = await res.json();
  if (!session.user.isAdmin) {
    // Không để lại phiên mồ côi (ADR 0003 §8). Mất mạng đúng lúc này thì phiên còn trên server nhưng
    // không ai giữ token, nên vẫn báo lỗi chính cho người dùng.
    try {
      await logoutSession(session.token);
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
    }
    throw new NotAdminError();
  }
  return session;
}
