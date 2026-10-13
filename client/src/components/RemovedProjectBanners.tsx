import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { accountDb, type AccountProject } from '../db/accountDb';
import { openProjectDb } from '../db/current';
import { downloadJson } from '../download';
import { SYNC_LOCK } from '../sync/engine';
import { UNSENT_STATES, exportUnsentJson } from '../sync/exportJson';
import { forgetProject } from '../sync/membership';

// Banner cho dự án mình đã bị rút mà máy còn phiếu chưa gửi (design §4.7, ADR 0002 §6, ca T7).
// Hiện ở trang chủ dù đang chọn dự án nào, mỗi dự án một banner. Dự án không còn gì chưa gửi thì
// vòng đồng bộ tự xoá (membership.ts), không cần banner.
export function RemovedProjectBanners() {
  const removed = useLiveQuery(
    async () => (await accountDb.projects.toArray()).filter((p) => p.status === 'removed'),
    [],
  );
  return (
    <>
      {removed?.map((p) => (
        <RemovedProjectBanner key={p.id} project={p} />
      ))}
    </>
  );
}

function RemovedProjectBanner({ project }: { project: AccountProject }) {
  const unsent = useLiveQuery(() => countUnsent(project.id), [project.id]);
  if (!unsent) return null;

  const remove = async () => {
    if (!window.confirm(`Xoá ${unsent} phiếu chưa gửi của dự án ${project.name} khỏi máy? Không khôi phục được.`)) {
      return;
    }
    await forgetInSyncLock(project.id);
  };

  return (
    <div className="warning banner-removed" role="alert" data-testid="removed-project-banner">
      <span>
        Bạn không còn thuộc dự án {project.name}. {unsent} phiếu chưa gửi được
      </span>
      <div>
        <button onClick={() => void exportProject(project.id)}>Xuất JSON</button>
        <button onClick={() => void remove()}>Xoá khỏi máy</button>
      </div>
    </div>
  );
}

/** Số phiếu sẽ mất nếu xoá: cùng tập trạng thái với file Xuất JSON. */
async function countUnsent(projectId: string): Promise<number> {
  try {
    return await openProjectDb(projectId).records.where('syncState').anyOf(UNSENT_STATES).count();
  } catch (err) {
    // Bấm "Xoá khỏi máy": CSDL bị xoá trước dòng trong `projects` (forgetProject), nên banner còn
    // kịp đọc một lần trên CSDL đã đóng. Lúc đó không còn phiếu nào; banner biến mất ngay sau.
    if (err instanceof Dexie.DatabaseClosedError) return 0;
    throw err;
  }
}

async function exportProject(projectId: string) {
  downloadJson(`chua-gui-${projectId}.json`, await exportUnsentJson(projectId));
}

/**
 * Xoá trong cùng khoá với vòng đồng bộ (giống logout.ts) và kiểm lại ngay trước khi xoá: nếu dự án
 * vừa được thêm lại (active) thì phiếu sẽ gửi được, không xoá.
 */
async function forgetInSyncLock(projectId: string): Promise<void> {
  const run = async () => {
    const p = await accountDb.projects.get(projectId);
    if (p?.status === 'removed') await forgetProject(projectId);
  };
  // Trình duyệt thiếu Web Locks thì engine cũng chạy không khoá (engine.ts); làm giống vậy
  if (!('locks' in navigator)) return run();
  return navigator.locks.request(SYNC_LOCK, run);
}
