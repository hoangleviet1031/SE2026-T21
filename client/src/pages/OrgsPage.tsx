import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DirectoryEntry, MeResponse, ProjectRequest } from '@field-survey/shared';
import { accountUsername } from '../accountDisplay';
import { getAccountValue } from '../db/accountDb';
import { ORG_ERROR_TEXT, ORG_OFFLINE_MSG, orgRequestBody, requestStatusText, sortRequests } from '../orgs';
import { apiFailureText } from '../apiErrors';
import { apiFailure, cancelProjectRequest, fetchDirectory, listMyProjectRequests, requestProject } from '../sync/api';
import { useOnline } from '../useOnline';

// Màn hình Tổ chức (ui.md màn hình 9, design §4.7). Cần mạng: gọi API thẳng, không qua IndexedDB
// (CLAUDE.md bất biến 7 cho phép). Không có nút xin vào tổ chức: muốn vào thì gửi tên đăng nhập cho
// giám sát viên. Yêu cầu được duyệt thì tổ chức hiện trong bộ chọn sau vòng đồng bộ kế tiếp.

/** Lỗi gọi API thành câu hiển thị (mất mạng, 5xx, 401); lỗi lập trình ném tiếp. */
function failureText(err: unknown): string {
  const failure = apiFailure(err);
  if (!failure) throw err;
  return apiFailureText(failure, ORG_OFFLINE_MSG);
}

/**
 * `home`: đang là trang chủ của người chưa thuộc tổ chức nào (design §4.7 "Sau khi đăng nhập"), không có
 * trang nào để quay lại nên ẩn link ←.
 */
export function OrgsPage({ home = false }: { home?: boolean }) {
  const online = useOnline();
  const user = useLiveQuery(() => getAccountValue<MeResponse['user'] | null>('user', null), []);
  const [directory, setDirectory] = useState<DirectoryEntry[] | null>(null);
  const [requests, setRequests] = useState<ProjectRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRequests = useCallback(async () => {
    setRequests(sortRequests(await listMyProjectRequests()));
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDirectory(await fetchDirectory());
      await loadRequests();
    } catch (err) {
      setLoadError(failureText(err));
    }
  }, [loadRequests]);

  // Có mạng lại thì tải lại: lần mở trang lúc offline chưa có gì
  useEffect(() => {
    if (online) void load();
  }, [online, load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const checked = orgRequestBody(name, note);
    if ('error' in checked) return setError(checked.error);
    setBusy(true);
    setError(null);
    try {
      const r = await requestProject(checked.body);
      if (!r.ok) return setError(ORG_ERROR_TEXT[r.error]);
      setName('');
      setNote('');
      await loadRequests();
    } catch (err) {
      setError(failureText(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await cancelProjectRequest(id);
      if (!r.ok) setError(ORG_ERROR_TEXT[r.error]);
      // Kể cả not_found: admin vừa xử lý xong, tải lại để thấy trạng thái mới
      await loadRequests();
    } catch (err) {
      setError(failureText(err));
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) return null;
  const username = user ? accountUsername(user) : '';

  return (
    <section className="orgs" data-testid="orgs">
      <h2>Tổ chức</h2>
      {home && <p>Bạn chưa thuộc tổ chức nào.</p>}
      <p>
        Tên đăng nhập của bạn: <code data-testid="orgs-username">{username}</code>
      </p>
      <p>Gửi tên này cho giám sát viên của tổ chức để được thêm vào.</p>

      {!online && <p role="alert">⚠ {ORG_OFFLINE_MSG}</p>}
      {online && loadError && <p role="alert">⚠ {loadError}</p>}

      <h3>Tổ chức công khai</h3>
      {directory === null ? null : directory.length === 0 ? (
        <p data-testid="directory-empty">Chưa có tổ chức công khai nào</p>
      ) : (
        <ul className="list" data-testid="directory">
          {directory.map((d) => (
            <li key={d.id}>{d.name}</li>
          ))}
        </ul>
      )}

      <h3>Mở tổ chức mới</h3>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Tên</span>
          <input data-testid="org-request-name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Ghi chú cho quản trị</span>
          <textarea data-testid="org-request-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </label>
        <button type="submit" disabled={busy || !online}>
          Gửi yêu cầu
        </button>
        {error && (
          <p role="alert" data-testid="org-request-error">
            ⚠ {error}
          </p>
        )}
      </form>

      {requests && requests.length > 0 && (
        <>
          <h3>Yêu cầu của bạn</h3>
          <ul className="list" data-testid="org-requests">
            {requests.map((r) => (
              <li key={r.id} data-testid={`org-request-${r.id}`}>
                <span>
                  {r.name} · <span data-testid="org-request-status">{requestStatusText(r)}</span>
                </span>
                {r.status === 'pending' && (
                  <button type="button" disabled={busy || !online} onClick={() => void cancel(r.id)}>
                    Huỷ
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {!home && (
        <a className="back" href="#/">
          ← Về danh sách phiếu
        </a>
      )}
    </section>
  );
}
