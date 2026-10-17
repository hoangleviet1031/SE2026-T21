import type { AddMemberRequest, Role, UpdateMemberRequest, UpdateSettingsRequest } from './types';

// Luật màn hình Thành viên (ADR 0003 §2, §6; design §4.7). Đặt ở shared để màn hình (TV1-08 phần 2)
// ẩn nút và báo lỗi đúng như server kiểm.

export const PROJECT_NAME_MAX_LENGTH = 100;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isRole(v: unknown): v is Role {
  return v === 'surveyor' || v === 'supervisor' || v === 'owner';
}

/**
 * Người có vai trò `actor` có được thêm, đổi hoặc rút người ở vai trò `role` không.
 * Supervisor chỉ đụng tới điều tra viên; Owner đụng được mọi vai trò (ADR 0003 §2).
 */
export function canAssignRole(actor: Role, role: Role): boolean {
  if (actor === 'owner') return true;
  if (actor === 'supervisor') return role === 'surveyor';
  return false;
}

/**
 * Thân `POST P/members`. Tên đăng nhập chỉ cắt khoảng trắng và chuyển về chữ thường, không kiểm
 * định dạng: tên sai định dạng thì cũng là "không có tên đó" (`404`), như đăng nhập.
 */
export function parseAddMemberRequest(body: unknown): AddMemberRequest | undefined {
  if (!isObject(body) || typeof body.username !== 'string' || !isRole(body.role)) return undefined;
  const username = body.username.trim().toLowerCase();
  if (!username) return undefined;
  return { username, role: body.role };
}

export function parseUpdateMemberRequest(body: unknown): UpdateMemberRequest | undefined {
  if (!isObject(body) || !isRole(body.role)) return undefined;
  return { role: body.role };
}

/** Thân `PATCH P/settings` đã chuẩn hoá: tên cắt khoảng trắng hai đầu, 1–100 ký tự. */
export function parseUpdateSettingsRequest(body: unknown): UpdateSettingsRequest | undefined {
  if (!isObject(body)) return undefined;
  const patch: UpdateSettingsRequest = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') return undefined;
    const name = body.name.trim();
    if (name.length < 1 || name.length > PROJECT_NAME_MAX_LENGTH) return undefined;
    patch.name = name;
  }
  if (body.public !== undefined) {
    if (typeof body.public !== 'boolean') return undefined;
    patch.public = body.public;
  }
  return patch.name === undefined && patch.public === undefined ? undefined : patch;
}
