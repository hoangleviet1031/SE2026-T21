import { Fragment, useCallback, useEffect, useState } from 'react';
import type { AdminProject } from '@field-survey/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { assignOwner, fetchProjects, setProjectArchived, type AdminErrorCode } from './adminApi';
import { adminErrorMessage, ownersLabel } from './adminMessages';
import { Notice, useNoticeFocus, type NoticeValue } from './Notice';

type Outcome = { ok: true } | { ok: false; error: AdminErrorCode };

const COLUMNS = 5;

// A2. Tổ chức (design §4.9, ui.md A2): khoá/mở, chỉ định Owner khi khách hàng mất tài khoản Owner.
// Không hiện form, phiếu hay danh sách thành viên: dữ liệu thuộc về Owner (ADR 0003 Y8).
export function ProjectsPage({ token, onError }: { token: string; onError: (err: unknown) => string | null }) {
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  // Lần tải đầu lỗi: danh sách vẫn chưa có nhưng không còn đang chờ, chỉ hiện dòng lỗi (không kẹt "Đang tải…")
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const [confirmLock, setConfirmLock] = useState<AdminProject | null>(null);
  const [ownerFor, setOwnerFor] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(0);
  const noticeRef = useNoticeFocus(finished);

  const load = useCallback(async () => {
    const res = await fetchProjects(token);
    if (!res.ok) {
      setLoadFailed(true);
      return setNotice({ kind: 'error', text: adminErrorMessage(res.error) });
    }
    setLoadFailed(false);
    setProjects(res.value);
  }, [token]);

  const fail = useCallback(
    (err: unknown) => {
      const text = onError(err);
      if (text) setNotice({ kind: 'error', text });
    },
    [onError],
  );

  useEffect(() => {
    load().catch((err: unknown) => {
      setLoadFailed(true);
      fail(err);
    });
  }, [load, fail]);

  async function run(action: () => Promise<Outcome>, okText: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await action();
      if (res.ok) {
        setNotice({ kind: 'ok', text: okText });
        setOwnerFor(null);
        setUsername('');
      } else {
        setNotice({ kind: 'error', text: adminErrorMessage(res.error) });
      }
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      setFinished((n) => n + 1);
    }
  }

  return (
    <section>
      <h1>Tổ chức</h1>
      <Notice value={notice} ref={noticeRef} />
      {projects === null ? (
        !loadFailed && <p className="hint">Đang tải…</p>
      ) : (
        <div className="tcard table-wrap">
          <table className="admin-table" data-testid="admin-projects">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Owner</th>
                <th>Thành viên</th>
                <th>Trạng thái</th>
                <th>
                  <span className="visually-hidden">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <Fragment key={p.id}>
                  <tr className={ownerFor === p.id ? 'open' : undefined} data-testid={`project-row-${p.id}`}>
                    <td>
                      <b>{p.name}</b>
                      <br />
                      <small className="hint">{p.id}</small>
                    </td>
                    <td data-testid="project-owners" className={p.ownerUsernames.length === 0 ? 'none' : undefined}>
                      {ownersLabel(p.ownerUsernames)}
                    </td>
                    <td>{p.memberCount}</td>
                    <td>
                      {/* Biểu tượng chỉ để nhìn, chữ đã nói trạng thái */}
                      <span className={p.archived ? 'st st-locked' : 'st st-synced'} data-testid="project-status">
                        <Icon name={p.archived ? 'lock' : 'synced'} />
                        {p.archived ? 'Đã khoá' : 'Đang dùng'}
                      </span>
                    </td>
                    <td className="act">
                      <div className="row-actions">
                        {p.archived ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void run(() => setProjectArchived(token, p.id, false), `Đã mở: ${p.name}`)}
                          >
                            Mở
                          </button>
                        ) : (
                          <button type="button" className="danger-outline" disabled={busy} onClick={() => setConfirmLock(p)}>
                            Khoá
                          </button>
                        )}
                        {/* "Thêm" chứ không "Đổi": Owner cũ vẫn giữ quyền (critique K5, Dương duyệt chữ 2026-10-24) */}
                        <button
                          type="button"
                          disabled={busy}
                          aria-expanded={ownerFor === p.id}
                          aria-controls={ownerFor === p.id ? `project-expand-${p.id}` : undefined}
                          onClick={() => {
                            setOwnerFor(ownerFor === p.id ? null : p.id);
                            setUsername('');
                          }}
                        >
                          Thêm Owner…
                        </button>
                      </div>
                    </td>
                  </tr>
                  {ownerFor === p.id && (
                    <tr className="exp" id={`project-expand-${p.id}`} data-testid={`project-expand-${p.id}`}>
                      <td colSpan={COLUMNS}>
                        <form
                          className="inline-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const name = username.trim();
                            void run(() => assignOwner(token, p.id, name), `Đã thêm ${name} làm Owner của ${p.name}`);
                          }}
                        >
                          <label className="field">
                            <span>Tên đăng nhập của Owner mới</span>
                            <input
                              data-testid="owner-username"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              autoCapitalize="off"
                              spellCheck={false}
                            />
                          </label>
                          <button type="submit" className="primary" disabled={busy || username.trim() === ''}>
                            Thêm làm Owner
                          </button>
                          <small>Owner cũ vẫn giữ quyền; muốn bỏ thì Owner rút ở màn hình Thành viên.</small>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmLock && (
        <ConfirmDialog
          message={`Khoá "${confirmLock.name}"? Mọi thành viên sẽ không đồng bộ được với tổ chức này.`}
          confirmLabel="Khoá"
          onCancel={() => setConfirmLock(null)}
          onConfirm={() => {
            const p = confirmLock;
            setConfirmLock(null);
            void run(() => setProjectArchived(token, p.id, true), `Đã khoá: ${p.name}`);
          }}
        />
      )}
    </section>
  );
}
