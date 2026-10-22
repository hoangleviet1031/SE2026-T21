import type {
  AddMemberRequest,
  AuthResponse,
  CreateProjectRequestBody,
  DirectoryEntry,
  FormSchema,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  Member,
  ProjectRequest,
  ProjectSettings,
  PullResponse,
  PushRecordRequest,
  Role,
  SaveFormRequest,
  UpdateSettingsRequest,
} from '@field-survey/shared';
import { MEMBER_ERROR_CODES, type MemberErrorCode } from '../members';
import { ORG_ERROR_CODES, type OrgErrorCode } from '../orgs';
import type { ApiFailure } from '../apiErrors';

import { expireSession, getToken } from '../auth';

const TIMEOUT_MS = 10_000;

// Mọi route dữ liệu nằm dưới /api/projects/:projectId (design §7); projectId luôn do nơi gọi truyền vào.
const projectPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

export class NetworkError extends Error {}

/**
 * Server trả `5xx` hoặc mã lỗi màn hình không xử lý được, ở các màn hình cần online (Thành viên, Tổ chức,
 * builder lưu form, Xuất). Trang báo "Máy chủ đang lỗi, thử lại sau", người dùng bấm lại.
 */
export class ServerError extends Error {}

/** Mã đăng nhập thiếu hoặc bị server từ chối (401). Dữ liệu cục bộ giữ nguyên; người dùng đăng nhập lại. */
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

/** Lỗi của màn hình cần online thành loại để chọn câu báo (apiErrors.ts); lỗi khác trả null để ném tiếp. */
export function apiFailure(err: unknown): ApiFailure | null {
  if (err instanceof NetworkError) return 'network';
  if (err instanceof ServerError) return 'server';
  if (err instanceof AuthError) return 'auth';
  if (err instanceof NotMemberError) return 'not_member';
  return null;
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

/** fetch có timeout; mất mạng, DNS, timeout, kết nối bị cắt đều thành NetworkError (lỗi tạm thời). */
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
      // Màn hình tự quay về đăng nhập khi token biến mất, kèm câu báo hết phiên (design §7.1, §8)
      await expireSession();
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

// Tài khoản và phiên (ADR 0003 §1, design §7). Các hàm dưới đây không đọc token đã lưu và không xoá
// token khi gặp 401: lúc gọi, token trên máy có thể là của người khác (đang đổi tài khoản), và token
// mới chỉ được lưu sau khi signIn.ts kiểm xong.

/** Mã lỗi người dùng sửa được khi đăng nhập/đăng ký (design §7.1). */
export type AccountErrorCode = 'invalid_credentials' | 'username_taken' | 'too_many_requests' | 'invalid_body';

const ACCOUNT_ERROR_CODES: readonly AccountErrorCode[] = [
  'invalid_credentials',
  'username_taken',
  'too_many_requests',
  'invalid_body',
];

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(`tài khoản: ${code}`);
  }
}

/** Tài khoản quản trị dùng trang /admin, không dùng app khảo sát (ADR 0003 §8). Token không được lưu. */
export class AdminAccountError extends Error {
  constructor() {
    super('tài khoản quản trị không dùng app khảo sát');
  }
}

async function authCall(path: string, body: unknown): Promise<AuthResponse> {
  const res = await timedFetch(path, json('POST', body));
  if (res.ok) return res.json();
  const code = await errorCode(res);
  const known = ACCOUNT_ERROR_CODES.find((c) => c === code);
  if (known) throw new AccountError(known);
  throw new Error(`POST ${path} ${res.status}`);
}

/** Tạo tài khoản, server đăng nhập luôn và trả token phiên của máy này. */
export function register(body: RegisterRequest): Promise<AuthResponse> {
  return authCall('/api/auth/register', body);
}

/** Đăng nhập bằng tên + mật khẩu; mỗi lần là một phiên mới cho máy này. */
export function login(body: LoginRequest): Promise<AuthResponse> {
  return authCall('/api/auth/login', body);
}

/**
 * Huỷ phiên của `token` trên server (`POST /auth/logout`). 401 nghĩa là phiên đã mất từ trước, cũng
 * coi như xong. Mất mạng ném NetworkError để nơi gọi quyết định.
 */
export async function logoutSession(token: string): Promise<void> {
  const res = await timedFetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204 || res.status === 401) return;
  throw new Error(`POST /api/auth/logout ${res.status}`);
}

export async function fetchForms(projectId: string): Promise<FormSchema[]> {
  const res = await request(`${projectPath(projectId)}/forms`, {}, projectId);
  if (!res.ok) throw new Error(`GET /api/forms ${res.status}`);
  return res.json();
}

/** Một phiên bản form cụ thể (design §7); `null` khi server không có bản đó. */
export async function fetchFormVersion(projectId: string, formId: string, version: number): Promise<FormSchema | null> {
  const res = await request(
    `${projectPath(projectId)}/forms/${encodeURIComponent(formId)}/versions/${version}`,
    {},
    projectId,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET form ${formId}@${version} ${res.status}`);
  return res.json();
}

/** Kết quả lưu form: form server đã lưu (version do server đặt), hoặc lỗi để hiện trong builder. */
export type SaveFormResult = { ok: true; form: FormSchema } | { ok: false; errors: string[] };

/**
 * Lưu form thành phiên bản mới (design §7, `POST P/forms`). Mất mạng thì ném NetworkError để
 * builder báo "Cần kết nối để lưu form"; lỗi người dùng sửa được (§7.1) trả về thành danh sách.
 */
export async function saveForm(projectId: string, body: SaveFormRequest): Promise<SaveFormResult> {
  const res = await request(
    `${projectPath(projectId)}/forms`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    projectId,
  );
  if (res.status === 201) return { ok: true, form: await res.json() };
  const code = await errorCode(res);
  if (code === 'invalid_form') {
    const payload: unknown = await res.json();
    const details =
      typeof payload === 'object' && payload !== null && 'details' in payload && Array.isArray(payload.details)
        ? payload.details.filter((d): d is string => typeof d === 'string')
        : [];
    return { ok: false, errors: details.length > 0 ? details : ['Biểu mẫu không hợp lệ'] };
  }
  if (code === 'forbidden') return { ok: false, errors: ['Chỉ giám sát viên và Owner được lưu biểu mẫu'] };
  if (code === 'invalid_body') return { ok: false, errors: ['Biểu mẫu không đúng định dạng'] };
  throw new ServerError(`POST forms ${res.status}`);
}

/**
 * Kết quả gọi `P/members`, `P/settings` (màn hình Thành viên, cần mạng): giá trị, hoặc mã lỗi để hiện
 * cho người dùng (design §7.1). Mất mạng ném NetworkError, không còn là thành viên ném NotMemberError.
 */
export type MemberResult<T> = { ok: true; value: T } | { ok: false; error: MemberErrorCode };

function isMemberErrorCode(code: string | undefined): code is MemberErrorCode {
  return MEMBER_ERROR_CODES.some((c) => c === code);
}

async function memberCall<T>(
  projectId: string,
  path: string,
  init: RequestInit,
  read: (res: Response) => Promise<T>,
): Promise<MemberResult<T>> {
  const res = await request(`${projectPath(projectId)}${path}`, init, projectId);
  if (res.ok) return { ok: true, value: await read(res) };
  const code = await errorCode(res);
  if (isMemberErrorCode(code)) return { ok: false, error: code };
  throw new ServerError(`${init.method ?? 'GET'} ${path} ${res.status}`);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const readJson = <T>(res: Response): Promise<T> => res.json();

export function fetchMembers(projectId: string): Promise<MemberResult<Member[]>> {
  return memberCall(projectId, '/members', {}, readJson<Member[]>);
}

export function addMember(projectId: string, body: AddMemberRequest): Promise<MemberResult<Member>> {
  return memberCall(projectId, '/members', json('POST', body), readJson<Member>);
}

export function changeMemberRole(projectId: string, userId: string, role: Role): Promise<MemberResult<Member>> {
  return memberCall(projectId, `/members/${encodeURIComponent(userId)}`, json('PUT', { role }), readJson<Member>);
}

export function removeMember(projectId: string, userId: string): Promise<MemberResult<void>> {
  return memberCall(projectId, `/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }, async () => undefined);
}

export function fetchSettings(projectId: string): Promise<MemberResult<ProjectSettings>> {
  return memberCall(projectId, '/settings', {}, readJson<ProjectSettings>);
}

export function updateSettings(projectId: string, body: UpdateSettingsRequest): Promise<MemberResult<ProjectSettings>> {
  return memberCall(projectId, '/settings', json('PATCH', body), readJson<ProjectSettings>);
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

// Upload ảnh theo chunk (design §4.4, §7). Trả mã HTTP và mã lỗi để sync/attachments.ts quyết định
// thử lại hay đánh dấu `failed` (§5.6); lỗi mạng, 401, 403 not_member vẫn ném như mọi request.

/** Kết quả một request ảnh: `code` là mã lỗi §7.1 khi không thành công. */
export interface AttachmentResult {
  status: number;
  code?: string;
}

const attachmentPath = (projectId: string, id: string) =>
  `${projectPath(projectId)}/attachments/${encodeURIComponent(id)}`;

/** `GET P/attachments/:id/status`: chunk server đã có. */
export async function fetchAttachmentStatus(
  projectId: string,
  id: string,
): Promise<AttachmentResult & { received?: number[] }> {
  const res = await request(`${attachmentPath(projectId, id)}/status`, {}, projectId);
  if (!res.ok) return { status: res.status, code: await errorCode(res) };
  const body = (await res.json()) as { received: number[] };
  return { status: res.status, received: body.received };
}

/** `PUT P/attachments/:id/chunks/:index`: gửi lại chunk đã có thì server trả 200, không ghi lại. */
export async function putAttachmentChunk(projectId: string, id: string, index: number, chunk: Blob) {
  const res = await request(
    `${attachmentPath(projectId, id)}/chunks/${index}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk },
    projectId,
  );
  const out: AttachmentResult = { status: res.status };
  if (!res.ok) out.code = await errorCode(res);
  return out;
}

/** `POST P/attachments/:id/complete`: server ghép, kiểm SHA-256 và loại ảnh. */
export async function completeAttachment(
  projectId: string,
  id: string,
  body: { recordId: string; totalChunks: number; mimeType: string; sha256: string },
): Promise<AttachmentResult> {
  const res = await request(
    `${attachmentPath(projectId, id)}/complete`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    projectId,
  );
  const out: AttachmentResult = { status: res.status };
  if (!res.ok) out.code = await errorCode(res);
  return out;
}

/** Định dạng xuất của `GET P/export/:formId` (design §4.6). */
export type ExportFormat = 'csv' | 'json';

/** Server từ chối xuất (vd. 403 forbidden khi vai trò không đủ), `code` là mã lỗi §7.1. */
export class ExportError extends Error {
  constructor(readonly status: number, readonly code: string | undefined) {
    super(`xuất dữ liệu bị từ chối (${status} ${code ?? ''})`);
  }
}

/** Tải file xuất của một form; cần mạng (màn hình xuất là màn hình bắt buộc online, CLAUDE.md bất biến 7). */
export async function downloadExport(projectId: string, formId: string, format: ExportFormat): Promise<Blob> {
  const res = await request(
    `${projectPath(projectId)}/export/${encodeURIComponent(formId)}?format=${format}`,
    {},
    projectId,
  );
  if (res.status >= 500) throw new ServerError(`GET export ${res.status}`);
  if (!res.ok) throw new ExportError(res.status, await errorCode(res));
  return res.blob();
}

/**
 * Kết quả gọi `/directory`, `/project-requests` (màn hình Tổ chức, cần mạng): giá trị, hoặc mã lỗi để hiện
 * cho người dùng (design §7.1). Mất mạng ném NetworkError.
 */
export type OrgResult<T> = { ok: true; value: T } | { ok: false; error: OrgErrorCode };

async function orgCall<T>(path: string, init: RequestInit, read: (res: Response) => Promise<T>): Promise<OrgResult<T>> {
  const res = await request(path, init);
  if (res.ok) return { ok: true, value: await read(res) };
  const code = await errorCode(res);
  const known = ORG_ERROR_CODES.find((c) => c === code);
  if (known) return { ok: false, error: known };
  throw new ServerError(`${init.method ?? 'GET'} ${path} ${res.status}`);
}

/** Tên các tổ chức công khai mình chưa thuộc. */
export function fetchDirectory(): Promise<DirectoryEntry[]> {
  return orgCall('/api/directory', {}, readJson<DirectoryEntry[]>).then(unwrap);
}

/** Mọi yêu cầu mở tổ chức của chính mình, kể cả đã xử lý (để đọc lý do từ chối). */
export function listMyProjectRequests(): Promise<ProjectRequest[]> {
  return orgCall('/api/project-requests', {}, readJson<ProjectRequest[]>).then(unwrap);
}

export function requestProject(body: CreateProjectRequestBody): Promise<OrgResult<ProjectRequest>> {
  return orgCall('/api/project-requests', json('POST', body), readJson<ProjectRequest>);
}

/** Huỷ yêu cầu đang chờ; đã được xử lý trước đó thì `not_found`. */
export function cancelProjectRequest(id: string): Promise<OrgResult<void>> {
  return orgCall(`/api/project-requests/${encodeURIComponent(id)}`, { method: 'DELETE' }, async () => undefined);
}

/** Hai lệnh GET không có lỗi nào người dùng sửa được: mã lỗi ở đây là lỗi lập trình. */
function unwrap<T>(r: OrgResult<T>): T {
  if (r.ok) return r.value;
  throw new Error(`lỗi không mong đợi: ${r.error}`);
}
