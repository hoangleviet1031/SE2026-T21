import type {
  AdminProject,
  AdminProjectRequest,
  AdminUser,
  AuthResponse,
  DecideProjectRequest,
  LoginRequest,
} from '@field-survey/shared';
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

/** Máy chủ trả 5xx hoặc mã không lường trước. Trang quản trị chạy online: báo một lần, người dùng tự bấm lại. */
export class ServerError extends Error {}

/**
 * Phiên admin không còn dùng được: 401 (bị thu hồi, tài khoản bị khoá) hoặc 403 (không còn là admin).
 * Trang xoá phiên đã lưu và về form đăng nhập.
 */
export class SessionLostError extends Error {}

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
  throw new ServerError(`POST /api/auth/logout ${res.status}`);
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
    throw new ServerError(`POST /api/auth/login ${res.status}`);
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

// API quản trị (design §7, `/api/admin/*`). Lỗi người dùng sửa được trả về dạng kết quả; phiên mất và
// máy chủ lỗi thì ném, để AdminApp xử lý chung.

/** Mã lỗi API admin mà màn hình hiện câu riêng (design §7.1) */
export type AdminErrorCode =
  | 'request_decided'
  | 'project_limit_reached'
  | 'not_found'
  | 'admin_account'
  | 'invalid_body'
  | 'self_action';

const ADMIN_ERROR_CODES: readonly AdminErrorCode[] = [
  'request_decided',
  'project_limit_reached',
  'not_found',
  'admin_account',
  'invalid_body',
  'self_action',
];

export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: AdminErrorCode };

async function adminCall<T>(token: string, method: string, path: string, body?: unknown): Promise<AdminResult<T>> {
  const res = await timedFetch(`/api/admin${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new SessionLostError(`${method} ${path} ${res.status}`);
  if (res.ok) return { ok: true, value: await res.json() };
  const code = await errorCode(res);
  const known = res.status < 500 ? ADMIN_ERROR_CODES.find((c) => c === code) : undefined;
  if (known) return { ok: false, error: known };
  throw new ServerError(`${method} ${path} ${res.status}`);
}

/** A1: yêu cầu đang chờ, cũ nhất trước */
export function fetchPendingRequests(token: string): Promise<AdminResult<AdminProjectRequest[]>> {
  return adminCall(token, 'GET', '/project-requests?status=pending');
}

/** A1: duyệt (trả mã tổ chức mới) hoặc từ chối kèm lý do */
export function decideRequest(
  token: string,
  id: string,
  body: DecideProjectRequest,
): Promise<AdminResult<{ projectId?: string }>> {
  return adminCall(token, 'POST', `/project-requests/${encodeURIComponent(id)}`, body);
}

/** A2: mọi tổ chức, kể cả đã khoá */
export function fetchProjects(token: string): Promise<AdminResult<AdminProject[]>> {
  return adminCall(token, 'GET', '/projects');
}

/** A2: khoá (lưu trữ) hoặc mở tổ chức */
export function setProjectArchived(token: string, projectId: string, archived: boolean): Promise<AdminResult<AdminProject>> {
  return adminCall(token, 'PATCH', `/projects/${encodeURIComponent(projectId)}`, { archived });
}

/** A2: thêm hoặc nâng người có tên đăng nhập này thành Owner; Owner cũ giữ nguyên (ADR 0003 §8) */
export function assignOwner(token: string, projectId: string, username: string): Promise<AdminResult<unknown>> {
  return adminCall(
    token,
    'PUT',
    `/projects/${encodeURIComponent(projectId)}/owners/${encodeURIComponent(username.trim())}`,
  );
}

/** A3: tài khoản có tên đăng nhập chứa `q` (rỗng = mọi tài khoản), server trả tối đa USER_SEARCH_LIMIT */
export function searchUsers(token: string, q: string): Promise<AdminResult<AdminUser[]>> {
  const query = q.trim() === '' ? '' : `?q=${encodeURIComponent(q.trim())}`;
  return adminCall(token, 'GET', `/users${query}`);
}

/** A3: khoá tài khoản, server thu hồi mọi phiên cùng lúc. Không có mở khoá (design §7) */
export function disableUser(token: string, userId: string): Promise<AdminResult<{ revokedSessions: number }>> {
  return adminCall(token, 'POST', `/users/${encodeURIComponent(userId)}/disable`);
}

/** A3: thu hồi mọi phiên, tài khoản vẫn đăng nhập lại được */
export function revokeUserSessions(token: string, userId: string): Promise<AdminResult<{ revokedSessions: number }>> {
  return adminCall(token, 'POST', `/users/${encodeURIComponent(userId)}/revoke-sessions`);
}

/** A3: mật khẩu tạm chỉ có trong response này (no-store), server không trả lại lần hai */
export function resetUserPassword(token: string, userId: string): Promise<AdminResult<{ password: string }>> {
  return adminCall(token, 'POST', `/users/${encodeURIComponent(userId)}/reset-password`);
}
