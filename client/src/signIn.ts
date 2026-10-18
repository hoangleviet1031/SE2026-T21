import type { LoginRequest, MeResponse, RegisterRequest } from '@field-survey/shared';
import { setToken } from './auth';
import { getAccountValue, setAccountValue } from './db/accountDb';
import { openProjectDb } from './db/current';
import { clearLocalAccountData, projectsOnDevice } from './logout';
import { AdminAccountError, NetworkError, fetchMeWithToken, login, logoutSession, register } from './sync/api';
import { decideSignIn } from './sync/accountSync';
import { SYNC_LOCK } from './sync/engine';
import { UNSENT_STATES } from './sync/exportJson';
import { hasUnsentData } from './sync/membership';

// Đăng nhập trên máy có thể đang giữ dữ liệu của người khác (design §4.7, ADR 0003 §1, §8).
// Mọi đường vào (tên + mật khẩu, tạo tài khoản, nhập mã) đều qua completeSignIn: biết người dùng là
// ai rồi mới quyết định giữ, xoá hay từ chối, và token chỉ được lưu sau cùng. Lưu token trước thì
// vòng đồng bộ có thể gửi phiếu của người cũ bằng token người mới (bất biến 6).

type User = MeResponse['user'];

/** Khác người mà máy còn dữ liệu chưa gửi: không lưu token, không xoá gì (bất biến 1). */
export class SignInBlockedError extends Error {
  constructor(
    /** Tên người đang có dữ liệu trên máy; rỗng nếu máy chưa từng biết người dùng nào */
    readonly previousName: string,
    /** Số phiếu chưa gửi (nháp, chờ đồng bộ, lỗi, xung đột), cùng tập với Xuất JSON */
    readonly unsentRecords: number,
  ) {
    super('máy còn dữ liệu chưa gửi của người khác');
  }
}

/** Đăng nhập bằng tên + mật khẩu (màn hình của TV1-14). */
export async function signIn(body: LoginRequest): Promise<void> {
  const { token, user } = await login(body);
  await completeSignIn(token, user);
}

/** Tạo tài khoản rồi đăng nhập luôn (màn hình của TV1-14). */
export async function registerAndSignIn(body: RegisterRequest): Promise<void> {
  const { token, user } = await register(body);
  await completeSignIn(token, user);
}

/** Màn hình nhập mã đang dùng: kiểm mã bằng /me trước khi lưu. Mã sai: AccountError('invalid_token'). */
export async function signInWithToken(token: string): Promise<void> {
  const me = await fetchMeWithToken(token);
  await completeSignIn(token, me.user);
}

async function unsentOnDevice(): Promise<{ any: boolean; records: number }> {
  let any = false;
  let records = 0;
  for (const p of await projectsOnDevice()) {
    const db = openProjectDb(p.id);
    if (await hasUnsentData(db)) any = true;
    records += await db.records.where('syncState').anyOf(UNSENT_STATES).count();
  }
  return { any, records };
}

/**
 * Chạy trong SYNC_LOCK như đăng xuất: vòng đồng bộ đang chạy dở xong mới tới lượt, và không vòng
 * nào ghi vào CSDL đang bị xoá. Bị từ chối thì huỷ luôn phiên vừa cấp để không để lại phiên mồ côi.
 */
async function completeSignIn(token: string, user: User): Promise<void> {
  const run = async () => {
    const stored = await getAccountValue<User | null>('user', null);
    const unsent = await unsentOnDevice();
    const decision = decideSignIn(stored, user, unsent.any);
    if (decision === 'admin') {
      await dropSession(token);
      throw new AdminAccountError();
    }
    if (decision === 'blocked') {
      await dropSession(token);
      throw new SignInBlockedError(stored?.name ?? '', unsent.records);
    }
    if (decision === 'switch') await clearLocalAccountData();
    await setAccountValue('user', user);
    // Lưu token sau cùng: App thấy có token thì vào trang chủ và bắt đầu đồng bộ
    await setToken(token);
  };
  if (!('locks' in navigator)) return run();
  return navigator.locks.request(SYNC_LOCK, run);
}

/**
 * Huỷ phiên không dùng tới. Vừa đăng nhập xong nên gần như luôn có mạng; nếu mất mạng đúng lúc này
 * thì phiên còn trên server nhưng không máy nào giữ token, nên vẫn báo lỗi chính cho người dùng.
 */
async function dropSession(token: string): Promise<void> {
  try {
    await logoutSession(token);
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
  }
}
