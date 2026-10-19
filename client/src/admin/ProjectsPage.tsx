import { useCallback, useEffect, useState } from 'react';
import type { AdminProject } from '@field-survey/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { assignOwner, fetchProjects, setProjectArchived, type AdminErrorCode } from './adminApi';
import { adminErrorMessage, ownersLabel } from './adminMessages';
import { Notice, type NoticeValue } from './Notice';

type Outcome = { ok: true } | { ok: false; error: AdminErrorCode };

// A2. Tổ chức (design §4.9, ui.md A2): khoá/mở, chỉ định Owner khi khách hàng mất tài khoản Owner.
// Không hiện form, phiếu hay danh sách thành viên: dữ liệu thuộc về Owner (ADR 0003 Y8).
export function ProjectsPage({ token, onError }: { token: string; onError: (err: unknown) => string | null }) {
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const [confirmLock, setConfirmLock] = useState<AdminProject | null>(null);
  const [ownerFor, setOwnerFor] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchProjects(token);
    if (!res.ok) return setNotice({ kind: 'error', text: adminErrorMessage(res.error) });
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
    load().catch(fail);
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
    }
  }

  return (
    <section>
      <h1>Tổ chức</h1>
      <Notice value={notice} />
      {projects === null ? (
        <p className="hint">Đang tải…</p>
      ) : (
        <div className="table-wrap">
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
                <tr key={p.id} data-testid={`project-row-${p.id}`}>
                  <td>
                    {p.name}
                    <br />
                    <small className="hint">{p.id}</small>
                  </td>
                  <td data-testid="project-owners">{ownersLabel(p.ownerUsernames)}</td>
                  <td>{p.memberCount}</td>
                  <td data-testid="project-status">{p.archived ? 'Đã khoá' : 'Đang dùng'}</td>
                  <td>
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
                        <button type="button" className="danger" disabled={busy} onClick={() => setConfirmLock(p)}>
                          Khoá
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setOwnerFor(ownerFor === p.id ? null : p.id);
                          setUsername('');
                        }}
                      >
                        Đổi Owner…
                      </button>
                    </div>
                    {ownerFor === p.id && (
                      <form
                        className="row-form"
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
                          <small>Owner cũ vẫn giữ quyền; muốn bỏ thì Owner rút ở màn hình Thành viên.</small>
                        </label>
                        <div className="row-actions">
                          <button type="submit" className="primary" disabled={busy || username.trim() === ''}>
                            Thêm làm Owner
                          </button>
                        </div>
                      </form>
                    )}
                  </td>
                </tr>
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
