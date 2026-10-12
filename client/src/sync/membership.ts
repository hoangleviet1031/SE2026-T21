import { accountDb, type AccountProject } from '../db/accountDb';
import { deleteProjectDb, openProjectDb, projectDbExists, resetProjectDb } from '../db/current';
import { getMeta, type ProjectDb } from '../db/projectDb';
import { needsRescope, type PullState } from './accountSync';

// Thay đổi thành viên phía client (ADR 0002 §6). Quy tắc chung: không bao giờ tự xoá dữ liệu chưa
// gửi (CLAUDE.md bất biến 1). Còn dữ liệu chưa gửi thì giữ nguyên CSDL và chờ người dùng quyết
// định qua banner của TV1-06 (exportUnsentJson trong exportJson.ts, forgetProject).

/**
 * Còn thứ gì trên máy chưa lên server: op trong outbox, ảnh chưa upload xong, phiếu nháp hoặc
 * đang xung đột (ADR 0002 §6). Phiếu `pending`/`error` luôn có op nên đã nằm trong outbox.
 */
export async function hasUnsentData(db: ProjectDb): Promise<boolean> {
  return db.transaction('r', [db.outbox, db.attachments, db.records, db.conflicts], async () => {
    if ((await db.outbox.count()) > 0) return true;
    if ((await db.attachments.where('uploadState').notEqual('done').count()) > 0) return true;
    if ((await db.records.where('syncState').anyOf('draft', 'conflict').count()) > 0) return true;
    return (await db.conflicts.count()) > 0;
  });
}

export async function markRemoved(projectId: string): Promise<void> {
  await accountDb.projects.update(projectId, { status: 'removed' });
}

/**
 * Chạy đầu mỗi vòng đồng bộ, sau khi đã gộp /me vào `projects`:
 * - dự án `removed` không còn gì chưa gửi: xoá CSDL và xoá khỏi danh sách; còn thì giữ;
 * - dự án bị hạ vai trò (máy còn phiếu phạm vi "all"): không còn gì chưa gửi thì xoá dữ liệu để
 *   pull lại từ 0 trong phạm vi mới; còn thì để vòng sau xét lại (phiếu người khác tạm còn trên máy).
 */
export async function applyMembershipChanges(projects: AccountProject[]): Promise<void> {
  for (const p of projects) {
    if (p.status === 'removed') {
      // Không mở CSDL chưa từng có: Dexie sẽ tạo mới một CSDL rỗng
      if (!(await projectDbExists(p.id))) {
        await accountDb.projects.delete(p.id);
      } else if (!(await hasUnsentData(openProjectDb(p.id)))) {
        await forgetProject(p.id);
      }
      continue;
    }
    if (!(await projectDbExists(p.id))) continue;
    const db = openProjectDb(p.id);
    const pull = await getMeta<PullState>(db, 'pull', { cursor: 0, scope: null });
    if (needsRescope(pull.scope, p.role) && !(await hasUnsentData(db))) {
      await resetProjectDb(p.id);
    }
  }
}

/**
 * Xoá dự án khỏi máy: CSDL dự án và dòng trong danh sách. Xoá cả dữ liệu chưa gửi, nên chỉ gọi khi
 * `hasUnsentData` = false hoặc người dùng đã bấm "Xoá khỏi máy" và xác nhận (TV1-06).
 */
export async function forgetProject(projectId: string): Promise<void> {
  await deleteProjectDb(projectId);
  await accountDb.projects.delete(projectId);
}
