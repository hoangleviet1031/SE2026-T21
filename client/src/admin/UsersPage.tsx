import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { AdminUser } from '@field-survey/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { disableUser, resetUserPassword, revokeUserSessions, searchUsers, type AdminResult } from './adminApi';
import { adminErrorMessage, formatShortTime, userLimitHint } from './adminMessages';
import { Notice, useNoticeFocus, type NoticeValue } from './Notice';

const COLUMNS = 5;

type Confirming = { action: 'disable' | 'reset'; user: AdminUser };

// A3. Tài khoản (design §4.9, ui.md A3): hỗ trợ người dùng mất mật khẩu hay mất máy, thay cho CLI user:*.
// Không có mở khoá: tài khoản đã khoá chỉ hiện trạng thái, không còn nút nào.
export function UsersPage({ token, onError }: { token: string; onError: (err: unknown) => string | null }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  // Lần tải đầu lỗi: danh sách vẫn chưa có nhưng không còn đang chờ, chỉ hiện dòng lỗi; [Tìm] tải lại (không kẹt "Đang tải…")
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  // Chuỗi đã tìm: tải lại sau thao tác theo chuỗi này, không theo chữ đang gõ dở trong ô
  const [searched, setSearched] = useState('');
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  // Mật khẩu tạm chỉ giữ trong state: server không trả lại lần hai, không ghi vào sessionStorage
  const [tempPassword, setTempPassword] = useState<{ userId: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(0);
  const noticeRef = useNoticeFocus(finished);

  // Số thứ tự lần tải mới nhất: bấm [Tìm] lúc lần tải đầu chưa về thì kết quả cũ về sau không được đè
  // kết quả tìm (tech-debt N14). Lỗi của lần cũ cũng bỏ qua: lần mới gặp cùng lỗi (vd. 401) sẽ tự báo.
  const latestLoad = useRef(0);

  const load = useCallback(
    async (q: string) => {
      const seq = ++latestLoad.current;
      let res: AdminResult<AdminUser[]>;
      try {
        res = await searchUsers(token, q);
      } catch (err) {
        if (seq !== latestLoad.current) return;
        throw err;
      }
      if (seq !== latestLoad.current) return;
      if (!res.ok) {
        setLoadFailed(true);
        return setNotice({ kind: 'error', text: adminErrorMessage(res.error) });
      }
      setLoadFailed(false);
      setUsers(res.value);
    },
    [token],
  );

  const fail = useCallback(
    (err: unknown) => {
      const text = onError(err);
      if (text) setNotice({ kind: 'error', text });
    },
    [onError],
  );

  useEffect(() => {
    load('').catch((err: unknown) => {
      setLoadFailed(true);
      fail(err);
    });
  }, [load, fail]);

  async function search() {
    setBusy(true);
    setNotice(null);
    setTempPassword(null);
    try {
      await load(query);
      setSearched(query);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function run<T>(action: () => Promise<AdminResult<T>>, onOk: (value: T) => string) {
    setBusy(true);
    setNotice(null);
    setTempPassword(null);
    try {
      const res = await action();
      setNotice(res.ok ? { kind: 'ok', text: onOk(res.value) } : { kind: 'error', text: adminErrorMessage(res.error) });
      await load(searched);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      setFinished((n) => n + 1);
    }
  }

  function confirmed({ action, user }: Confirming) {
    setConfirming(null);
    if (action === 'disable') {
      void run(() => disableUser(token, user.id), () => `Đã khoá: ${user.username}`);
    } else {
      void run(() => resetUserPassword(token, user.id), ({ password }) => {
        setTempPassword({ userId: user.id, password });
        return `Đã cấp mật khẩu tạm cho ${user.username}`;
      });
    }
  }

  const limitHint = users && userLimitHint(users.length);

  return (
    <section>
      <h1>Tài khoản</h1>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="field">
          <span>Tìm theo tên đăng nhập</span>
          <input
            data-testid="user-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" disabled={busy}>
          Tìm
        </button>
      </form>
      <Notice value={notice} ref={noticeRef} />
      {users === null ? (
        !loadFailed && <p className="hint">Đang tải…</p>
      ) : users.length === 0 ? (
        <div className="tcard">
          <p className="aempty">
            <Icon name="users" />
            Không tìm thấy tài khoản nào
          </p>
        </div>
      ) : (
        <div className="tcard table-wrap">
          <table className="admin-table" data-testid="admin-users">
            <thead>
              <tr>
                <th>Tên đăng nhập</th>
                <th>Tạo lúc</th>
                <th>Tổ chức</th>
                <th>Trạng thái</th>
                <th>
                  <span className="visually-hidden">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const shown = tempPassword?.userId === u.id ? tempPassword.password : null;
                return (
                  <Fragment key={u.id}>
                    <tr className={shown ? 'open' : undefined} data-testid={`user-row-${u.username}`}>
                      <td>
                        <b>{u.username}</b>
                        <br />
                        <small className="hint">{u.name}</small>
                      </td>
                      <td className="when">{formatShortTime(u.createdAt)}</td>
                      <td>{u.projectCount}</td>
                      <td>
                        <span className={u.disabled ? 'st st-locked' : 'st st-synced'} data-testid="user-status">
                          <Icon name={u.disabled ? 'lock' : 'synced'} />
                          {u.disabled ? 'Đã khoá' : 'Đang dùng'}
                        </span>
                      </td>
                      <td className="act">
                        {!u.disabled && (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="danger-outline"
                              disabled={busy}
                              onClick={() => setConfirming({ action: 'disable', user: u })}
                            >
                              Khoá
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirming({ action: 'reset', user: u })}
                            >
                              Cấp lại mật khẩu
                            </button>
                            {/* Không hỏi lại: chỉ bắt đăng nhập lại, dữ liệu trên máy người dùng không mất */}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(() => revokeUserSessions(token, u.id), () => `Đã thu hồi phiên: ${u.username}`)
                              }
                            >
                              Thu hồi phiên
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {shown && (
                      <tr className="exp" data-testid={`user-expand-${u.username}`}>
                        <td colSpan={COLUMNS}>
                          <p className="temp-password">
                            Mật khẩu tạm: <code data-testid="temp-password">{shown}</code> (chỉ hiện một lần)
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {limitHint && <p className="hint">{limitHint}</p>}
      {confirming && (
        <ConfirmDialog
          message={
            confirming.action === 'disable'
              ? `Khoá tài khoản "${confirming.user.username}"? Mọi phiên đăng nhập bị thu hồi, người này không đăng nhập được nữa. Trang này không mở khoá được.`
              : `Cấp mật khẩu tạm cho "${confirming.user.username}"? Mật khẩu cũ hết dùng được; các máy đang đăng nhập vẫn giữ phiên.`
          }
          confirmLabel={confirming.action === 'disable' ? 'Khoá' : 'Cấp lại mật khẩu'}
          danger={confirming.action === 'disable'}
          onCancel={() => setConfirming(null)}
          onConfirm={() => confirmed(confirming)}
        />
      )}
    </section>
  );
}
