import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { accountDb, getAccountValue, setAccountValue } from './accountDb';
import { ProjectDb, projectDbName } from './projectDb';

// Dự án đang chọn và CSDL của nó. UI chỉ lấy CSDL qua `useCurrentProjectDb`, nên mọi liveQuery
// chạy trên đúng một dự án và không thể hiện lẫn dữ liệu hai dự án (design §4.2).

// TODO(TV2-06, TV1-06): khi /me và bộ chọn dự án có, dự án mặc định lấy từ danh sách dự án
// của người dùng thay vì cố định. Tạm dùng dự án demo mà mọi tài khoản demo đều thuộc.
export const DEFAULT_PROJECT_ID = 'demo-yte';

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

export async function getCurrentProjectId(): Promise<string> {
  return (await getAccountValue<string | null>('currentProjectId', null)) ?? DEFAULT_PROJECT_ID;
}

export async function getCurrentProjectDb(): Promise<ProjectDb> {
  return openProjectDb(await getCurrentProjectId());
}

export async function setCurrentProject(projectId: string): Promise<void> {
  await setAccountValue('currentProjectId', projectId);
}

/** CSDL của dự án đang chọn; `undefined` trong lúc đang đọc dự án đang chọn từ IndexedDB. */
export function useCurrentProjectDb(): ProjectDb | undefined {
  const projectId = useLiveQuery(getCurrentProjectId, []);
  return projectId === undefined ? undefined : openProjectDb(projectId);
}

/**
 * Xoá CSDL `field-survey` của khung một-tổ-chức. Không chuyển dữ liệu sang vì chưa có người
 * dùng thật, chỉ có dữ liệu thử nghiệm (design §4.2; nhóm đã chốt khi làm TV2-05).
 */
export function deleteLegacyDb(): Promise<void> {
  return Dexie.delete(LEGACY_DB_NAME);
}
