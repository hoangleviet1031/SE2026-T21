import type { FormSchema, PullResponse, PushRecordRequest } from '@field-survey/shared';

const TIMEOUT_MS = 10_000;

export class NetworkError extends Error {}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(path, { ...init, signal: ctrl.signal });
  } catch (err) {
    // Mất mạng, DNS, timeout, kết nối bị cắt: đều là lỗi tạm thời, retry được
    throw new NetworkError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchForms(): Promise<FormSchema[]> {
  const res = await request('/api/forms');
  if (!res.ok) throw new Error(`GET /api/forms ${res.status}`);
  return res.json();
}

export async function pushRecord(id: string, body: PushRecordRequest, idempotencyKey: string) {
  const res = await request(`/api/records/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

export async function pullRecords(since: number): Promise<PullResponse> {
  const res = await request(`/api/records?since=${since}`);
  if (!res.ok) throw new Error(`GET /api/records ${res.status}`);
  return res.json();
}
