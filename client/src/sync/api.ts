import type { FormSchema, MeResponse, PullResponse, PushRecordRequest } from '@field-survey/shared';

import { clearToken, getToken } from '../auth';

const TIMEOUT_MS = 10_000;

// Mọi route dữ liệu nằm dưới /api/projects/:projectId (design §7); projectId luôn do nơi gọi truyền vào.
const projectPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

export class NetworkError extends Error {}

/** Mã đăng nhập thiếu hoặc bị server từ chối (401). Dữ liệu cục bộ giữ nguyên; người dùng nhập lại mã. */
export class AuthError extends Error {}

/**
 * 403 not_member: không còn là thành viên dự án hoặc dự án đã lưu trữ. Ngừng gửi cho dự án
 * đó, giữ nguyên dữ liệu trên máy (ADR 0002 §6, design §7.1).
 */
export class NotMemberError extends Error {
  constructor(readonly projectId: string) {
    super(`không còn là thành viên dự án ${projectId}`);
  }
}

/** Đọc mã lỗi trong thân response mà không làm hỏng thân cho nơi gọi đọc tiếp. */
async function errorCode(res: Response): Promise<string | undefined> {
  const body: unknown = await res
    .clone()
    .json()
    // Thân không phải JSON (vd. proxy trả HTML): coi như không có mã lỗi
    .catch(() => undefined);
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  return typeof body.error === 'string' ? body.error : undefined;
}

async function request(path: string, init: RequestInit = {}, projectId?: string): Promise<Response> {
  const token = await getToken();
  if (!token) throw new AuthError('chưa đăng nhập');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    if (res.status === 401) {
      // Màn hình tự quay về nhập mã khi token biến mất (design §7.1)
      await clearToken();
      throw new AuthError('mã đăng nhập không còn hiệu lực');
    }
    if (projectId && res.status === 403 && (await errorCode(res)) === 'not_member') {
      throw new NotMemberError(projectId);
    }
    return res;
  } catch (err) {
    if (err instanceof AuthError || err instanceof NotMemberError) throw err;
    // Mất mạng, DNS, timeout, kết nối bị cắt: đều là lỗi tạm thời, retry được
    throw new NetworkError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** Người dùng hiện tại và các dự án đang là thành viên (design §7). */
export async function fetchMe(): Promise<MeResponse> {
  const res = await request('/api/me');
  if (!res.ok) throw new Error(`GET /api/me ${res.status}`);
  return res.json();
}

export async function fetchForms(projectId: string): Promise<FormSchema[]> {
  const res = await request(`${projectPath(projectId)}/forms`, {}, projectId);
  if (!res.ok) throw new Error(`GET /api/forms ${res.status}`);
  return res.json();
}

export async function pushRecord(projectId: string, id: string, body: PushRecordRequest, idempotencyKey: string) {
  const res = await request(
    `${projectPath(projectId)}/records/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    },
    projectId,
  );
  return { status: res.status, body: await res.json().catch(() => null) };
}

export async function pullRecords(projectId: string, since: number): Promise<PullResponse> {
  const res = await request(`${projectPath(projectId)}/records?since=${since}`, {}, projectId);
  if (!res.ok) throw new Error(`GET /api/records ${res.status}`);
  return res.json();
}
