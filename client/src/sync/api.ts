import type { FormSchema, PullResponse, PushRecordRequest } from '@field-survey/shared';

import { clearToken, getToken } from '../auth';

const TIMEOUT_MS = 10_000;

// Tạm dùng dự án mặc định cho tới TV2-05 (mỗi dự án một CSDL, bộ chọn dự án ở TV1-06).
export const DEFAULT_PROJECT_ID = 'demo-yte';
const projectPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

export class NetworkError extends Error {}

/** Mã đăng nhập thiếu hoặc bị server từ chối (401). Dữ liệu cục bộ giữ nguyên; người dùng nhập lại mã. */
export class AuthError extends Error {}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
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
    return res;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // Mất mạng, DNS, timeout, kết nối bị cắt: đều là lỗi tạm thời, retry được
    throw new NetworkError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchForms(projectId = DEFAULT_PROJECT_ID): Promise<FormSchema[]> {
  const res = await request(`${projectPath(projectId)}/forms`);
  if (!res.ok) throw new Error(`GET /api/forms ${res.status}`);
  return res.json();
}

export async function pushRecord(
  id: string,
  body: PushRecordRequest,
  idempotencyKey: string,
  projectId = DEFAULT_PROJECT_ID,
) {
  const res = await request(`${projectPath(projectId)}/records/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

export async function pullRecords(since: number, projectId = DEFAULT_PROJECT_ID): Promise<PullResponse> {
  const res = await request(`${projectPath(projectId)}/records?since=${since}`);
  if (!res.ok) throw new Error(`GET /api/records ${res.status}`);
  return res.json();
}
