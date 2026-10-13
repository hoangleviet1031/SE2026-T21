import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { accountDb, getAccountValue, setAccountValue } from './accountDb';
import { ProjectDb, projectDbName } from './projectDb';
import { resolveCurrentProjectId } from '../projects';

// Dự án đang chọn và CSDL của nó. UI chỉ lấy CSDL qua `useCurrentProjectDb`, nên mọi liveQuery
// chạy trên đúng một dự án và không thể hiện lẫn dữ liệu hai dự án (design §4.2).

const LEGACY_DB_NAME = 'field-survey';

// Mỗi dự án đúng một đối tượng Dexie: hai đối tượng cùng tên sẽ chặn nhau khi nâng version.
const openDbs = new Map<string, ProjectDb>();

export function openProjectDb(projectId: string): ProjectDb {
  let db = openDbs.get(projectId);
  if (!db) {
    db = new ProjectDb(projectId);
    openDbs.set(projectId, db);
  }
  return db;
}

export function projectDbExists(projectId: string): Promise<boolean> {
  return Dexie.exists(projectDbName(projectId));
}

/**
 * Xoá hẳn CSDL của một dự án và bỏ khỏi cache. Nơi gọi phải tự kiểm không còn dữ liệu chưa gửi,
 * hoặc người dùng đã bấm xác nhận (CLAUDE.md bất biến 1). Đang chọn dự án này thì bỏ chọn trước,
 * để UI chuyển sang CSDL khác thay vì đọc CSDL đã đóng.
 */
export async function deleteProjectDb(projectId: string): Promise<void> {
  if ((await getAccountValue<string | null>('currentProjectId', null)) === projectId) {
    await accountDb.account.delete('currentProjectId');
  }
  const db = openDbs.get(projectId);
  openDbs.delete(projectId);
  if (db) await db.delete({ disableAutoOpen: true });
  else await Dexie.delete(projectDbName(projectId));
}

/**
 * Xoá dữ liệu của dự án nhưng giữ đối tượng Dexie: lần dùng sau tự tạo CSDL rỗng cùng schema,
 * nên trang đang mở dự án này vẫn chạy và pull lại từ đầu.
 */
export async function resetProjectDb(projectId: string): Promise<void> {
  await openProjectDb(projectId).delete({ disableAutoOpen: false });
}

/**
 * Dự án đang chọn, `null` khi chưa có dự án active nào (chưa gọi được /me lần nào, hoặc chưa được
 * thêm vào dự án nào). Đã lưu mà dự án đó đã rời thì trả dự án active đầu tiên (projects.ts).
 */
export async function getCurrentProjectId(): Promise<string | null> {
  const stored = await getAccountValue<string | null>('currentProjectId', null);
  return resolveCurrentProjectId(await accountDb.projects.toArray(), stored);
}

export async function setCurrentProject(projectId: string): Promise<void> {
  await setAccountValue('currentProjectId', projectId);
}

/**
 * CSDL của dự án đang chọn; `undefined` trong lúc đang đọc IndexedDB, `null` khi chưa có dự án
 * nào để chọn. liveQuery đọc cả `account` và `projects` nên tự đổi CSDL khi chọn dự án khác hoặc
 * dự án đang chọn bị rút.
 */
export function useCurrentProjectDb(): ProjectDb | null | undefined {
  const projectId = useLiveQuery(getCurrentProjectId, []);
  if (projectId === undefined) return undefined;
  return projectId === null ? null : openProjectDb(projectId);
}

/**
 * Xoá CSDL `field-survey` của khung một-tổ-chức. Không chuyển dữ liệu sang vì chưa có người
 * dùng thật, chỉ có dữ liệu thử nghiệm (design §4.2; nhóm đã chốt khi làm TV2-05).
 */
export function deleteLegacyDb(): Promise<void> {
  return Dexie.delete(LEGACY_DB_NAME);
}
