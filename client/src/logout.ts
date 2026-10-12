import { clearToken } from './auth';
import { accountDb } from './db/accountDb';
import { deleteProjectDb, getCurrentProjectId, openProjectDb, projectDbExists } from './db/current';
import { SYNC_LOCK } from './sync/engine';
import { hasUnsentData } from './sync/membership';

// Đăng xuất (design §4.7, ui.md màn hình 8): chỉ khi mọi dự án không còn dữ liệu chưa gửi, rồi xoá
// mọi CSDL dự án và token. Không bao giờ xoá dữ liệu chưa gửi (CLAUDE.md bất biến 1).

/** Dự án còn dữ liệu chưa gửi, kèm tên để hiện cho người dùng. */
export interface BlockedProject {
  id: string;
  name: string;
}

/**
 * Mọi dự án có CSDL trên máy: dự án đã biết từ /me (kể cả đã rời) và dự án đang chọn (có thể
 * chưa có trong danh sách nếu chưa gọi được /me lần nào). Chỉ lấy CSDL đã tồn tại, để việc kiểm
 * tra không tự tạo CSDL rỗng.
 */
async function projectsOnDevice(): Promise<BlockedProject[]> {
  const known = await accountDb.projects.toArray();
  const all = new Map(known.map((p) => [p.id, p.name]));
  const current = await getCurrentProjectId();
  if (!all.has(current)) all.set(current, current);

  const result: BlockedProject[] = [];
  for (const [id, name] of all) {
    if (await projectDbExists(id)) result.push({ id, name });
  }
  return result;
}

/** Các dự án đang chặn đăng xuất; mảng rỗng nghĩa là đăng xuất được. */
export async function projectsBlockingLogout(): Promise<BlockedProject[]> {
  const blocked: BlockedProject[] = [];
  for (const p of await projectsOnDevice()) {
    if (await hasUnsentData(openProjectDb(p.id))) blocked.push(p);
  }
  return blocked;
}

/**
 * Kiểm lại rồi xoá, trong cùng khoá với vòng đồng bộ: vòng đang chạy dở xong mới tới lượt, và
 * không vòng nào ghi vào CSDL đang bị xoá. Còn dữ liệu chưa gửi thì không xoá gì, trả các dự án đó.
 */
export async function logout(): Promise<BlockedProject[]> {
  const run = async () => {
    const blocked = await projectsBlockingLogout();
    if (blocked.length > 0) return blocked;
    for (const p of await projectsOnDevice()) await deleteProjectDb(p.id);
    await accountDb.transaction('rw', accountDb.projects, accountDb.account, async () => {
      await accountDb.projects.clear();
      await accountDb.account.delete('user');
      await accountDb.account.delete('currentProjectId');
    });
    // TODO(TV2-16): online thì gọi `logout` của api.ts để huỷ phiên trên server (design §4.7 🆕)
    // Xoá token sau cùng: App thấy token mất thì về màn hình nhập mã
    await clearToken();
    return [];
  };
  // Trình duyệt thiếu Web Locks thì engine cũng chạy không khoá (engine.ts); làm giống vậy
  if (!('locks' in navigator)) return run();
  return navigator.locks.request(SYNC_LOCK, run);
}
