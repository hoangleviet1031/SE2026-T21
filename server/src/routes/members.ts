import { Router, type Response } from 'express';
import { parseAddMemberRequest, parseUpdateMemberRequest, parseUpdateSettingsRequest } from '@field-survey/shared';
import { getCtx } from '../auth';
import type { Db } from '../db';
import { addMember, changeMemberRole, listMembers, removeMember, type ChangeMemberError } from '../repo/memberships';
import { getProjectSettings, updateProjectSettings } from '../repo/projects';

// P/members và P/settings (TV1-08). Xem design §4.7, §7; ADR 0003 §2, §6.
// Ai được gọi chặn ở app.ts: members cần supervisor trở lên, settings cần owner. Quyền theo vai trò
// của người bị thêm/đổi/rút kiểm trong repo (canAssignRole).

const STATUS: Record<ChangeMemberError | 'admin_account' | 'already_member', number> = {
  not_found: 404,
  forbidden: 403,
  last_owner: 409,
  admin_account: 409,
  already_member: 409,
};

function fail(res: Response, error: keyof typeof STATUS): void {
  res.status(STATUS[error]).json({ error });
}

export function membersRouter(db: Db): Router {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(listMembers(getCtx(req), db));
  });

  r.post('/', (req, res) => {
    const input = parseAddMemberRequest(req.body);
    if (!input) return void res.status(400).json({ error: 'invalid_body' });
    const result = addMember(getCtx(req), db, input, new Date().toISOString());
    if (!result.ok) return fail(res, result.error);
    res.status(201).json(result.member);
  });

  r.put('/:userId', (req, res) => {
    const input = parseUpdateMemberRequest(req.body);
    if (!input) return void res.status(400).json({ error: 'invalid_body' });
    const result = changeMemberRole(getCtx(req), db, req.params.userId, input.role);
    if (!result.ok) return fail(res, result.error);
    res.json(result.member);
  });

  r.delete('/:userId', (req, res) => {
    const result = removeMember(getCtx(req), db, req.params.userId);
    if (!result.ok) return fail(res, result.error);
    res.status(204).end();
  });

  return r;
}

/**
 * `P/settings`: đọc (để màn hình Thành viên hiện ô Công khai đúng trạng thái), đổi tên, bật/tắt
 * công khai. Chỉ owner (chặn ở app.ts).
 */
export function settingsRouter(db: Db): Router {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(getProjectSettings(getCtx(req), db));
  });

  r.patch('/', (req, res) => {
    const patch = parseUpdateSettingsRequest(req.body);
    if (!patch) return void res.status(400).json({ error: 'invalid_body' });
    res.json(updateProjectSettings(getCtx(req), db, patch));
  });

  return r;
}
