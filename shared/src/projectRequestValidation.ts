import type { CreateProjectRequestBody, DecideProjectRequest, ProjectRequestStatus } from './types';
import { PROJECT_NAME_MAX_LENGTH } from './memberValidation';

// Luật thân request mở tổ chức (ADR 0003 §3 mục 1). Đặt ở shared để màn hình Tổ chức (TV1-15) và
// trang quản trị A1 (TV1-16) báo lỗi giống server.

export const PROJECT_REQUEST_NOTE_MAX_LENGTH = 500;
export const REJECT_REASON_MAX_LENGTH = 500;

/** Số yêu cầu đang chờ và số tổ chức chưa lưu trữ một người được làm Owner (ADR 0003 §3 mục 1) */
export const MAX_PENDING_REQUESTS = 1;
export const MAX_OWNED_PROJECTS = 3;

const STATUSES: readonly ProjectRequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Chuỗi đã cắt khoảng trắng dài 1..max, hoặc undefined. */
function trimmed(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length >= 1 && s.length <= max ? s : undefined;
}

/**
 * Thân `POST /api/project-requests`. `name` 1–100 ký tự sau khi cắt khoảng trắng. `note` không bắt
 * buộc, tối đa 500 ký tự; ghi chú chỉ có khoảng trắng coi như không có.
 */
export function parseCreateProjectRequest(body: unknown): CreateProjectRequestBody | undefined {
  if (!isObject(body)) return undefined;
  const name = trimmed(body.name, PROJECT_NAME_MAX_LENGTH);
  if (!name) return undefined;
  if (body.note === undefined || body.note === null) return { name };
  if (typeof body.note !== 'string') return undefined;
  const note = body.note.trim();
  if (note.length > PROJECT_REQUEST_NOTE_MAX_LENGTH) return undefined;
  return note ? { name, note } : { name };
}

/** Thân `POST /api/admin/project-requests/:id`. Duyệt thì bỏ qua `reason`; từ chối cần lý do 1–500 ký tự. */
export function parseDecideProjectRequest(body: unknown): DecideProjectRequest | undefined {
  if (!isObject(body)) return undefined;
  if (body.decision === 'approve') return { decision: 'approve' };
  if (body.decision !== 'reject') return undefined;
  const reason = trimmed(body.reason, REJECT_REASON_MAX_LENGTH);
  return reason ? { decision: 'reject', reason } : undefined;
}

/** `?status=` của `GET /api/admin/project-requests`: không có thì `pending` (màn hình A1), lạ thì undefined. */
export function parseProjectRequestStatus(v: unknown): ProjectRequestStatus | undefined {
  if (v === undefined) return 'pending';
  return STATUSES.find((s) => s === v);
}
