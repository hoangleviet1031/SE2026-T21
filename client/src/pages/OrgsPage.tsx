import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DirectoryEntry, MeResponse, ProjectRequest } from '@field-survey/shared';
import { accountUsername, initialOf } from '../accountDisplay';
import { BusyNote } from '../components/BusyNote';
import { Icon } from '../components/Icon';
import { getAccountValue } from '../db/accountDb';
import {
  ORG_ERROR_TEXT,
  ORG_OFFLINE_MSG,
  orgRequestBody,
  requestStatusKind,
  requestStatusText,
  sortRequests,
} from '../orgs';
import { apiFailureText } from '../apiErrors';
import { apiFailure, cancelProjectRequest, fetchDirectory, listMyProjectRequests, requestProject } from '../sync/api';
import { useOnline } from '../useOnline';

// Màn hình Tổ chức (ui.md màn hình 9, design §4.7). Cần mạng: gọi API thẳng, không qua IndexedDB
// (CLAUDE.md bất biến 7 cho phép). Không có nút xin vào tổ chức: muốn vào thì gửi tên đăng nhập cho
// giám sát viên. Yêu cầu được duyệt thì tổ chức hiện trong bộ chọn sau vòng đồng bộ kế tiếp.

const SENT_MSG = 'Đã gửi yêu cầu';

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
  // `busy` chung cho Gửi yêu cầu và Huỷ; chữ "Đang gửi yêu cầu…" chỉ hiện khi đang gửi
  const [sending, setSending] = useState(false);
  // Gửi xong ô trống lại nên cần một dòng báo ngay dưới nút (critique K1, Dương chốt 2026-10-24).
  // Gõ tiếp, gửi lại, Huỷ hay gặp lỗi thì dòng này không còn đúng nữa nên tắt.
  const [sent, setSent] = useState(false);

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
    setSent(false);
    const checked = orgRequestBody(name, note);
    if ('error' in checked) return setError(checked.error);
    setBusy(true);
    setSending(true);
    setError(null);
    try {
      const r = await requestProject(checked.body);
      if (!r.ok) return setError(ORG_ERROR_TEXT[r.error]);
      setName('');
      setNote('');
      setSent(true);
      await loadRequests();
    } catch (err) {
      setError(failureText(err));
    } finally {
      setBusy(false);
      setSending(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    setError(null);
    setSent(false);
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
      {/* Đầu trang như Builder, Cài đặt, Thành viên. Trang chủ của người mới thì không có trang nào để quay lại */}
      {!home && (
        <a href="#/" className="back">
          ← Quay lại
        </a>
      )}
      <h2>Tổ chức</h2>
      {/* Trang chủ của người mới: khối chào vàng nói rõ bước tiếp theo, tên đăng nhập to để đọc qua điện thoại */}
      <div className={home ? 'welcome' : 'card'}>
        {home && <p className="big">Bạn chưa thuộc tổ chức nào.</p>}
        <p>
          Tên đăng nhập của bạn:{' '}
          <code className="ucode big" data-testid="orgs-username">
            {username}
          </code>
        </p>
        <p className={home ? undefined : 'hint'}>Gửi tên này cho giám sát viên của tổ chức để được thêm vào.</p>
      </div>

      {!online && (
        <p className="field-error" role="alert">
          ⚠ {ORG_OFFLINE_MSG}
        </p>
      )}
      {online && loadError && (
        <p className="field-error" role="alert">
          ⚠ {loadError}
        </p>
      )}

      {/* Chưa tải được (ngoại tuyến, máy chủ lỗi) thì ẩn cả khối, câu lỗi phía trên đã nói lý do.
          Đã tải xong rồi mới mất mạng thì vẫn giữ danh sách. */}
      {(directory !== null || (online && !loadError)) && (
        <div className="card">
          <h3>Tổ chức công khai</h3>
          {directory === null ? (
            <p className="inline-loading" data-testid="directory-loading">
              <span className="spin" />
              Đang tải…
            </p>
          ) : directory.length === 0 ? (
            <p className="hint" data-testid="directory-empty">
              Chưa có tổ chức công khai nào
            </p>
          ) : (
            // Chỉ để đọc, không bấm được nên không có mũi tên
            <ul className="orows" data-testid="directory">
              {directory.map((d) => (
                <li key={d.id}>
                  <span className="tile" aria-hidden="true">
                    {initialOf(d.name)}
                  </span>
                  {d.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Trên form "Mở tổ chức mới" để gửi xong thấy ngay yêu cầu vừa gửi, không phải cuộn xuống đáy (critique K1) */}
      {requests && requests.length > 0 && (
        <div className="card">
          <h3>Yêu cầu của bạn</h3>
          <ul className="reqs" data-testid="org-requests">
            {requests.map((r) => {
              const kind = requestStatusKind(r.status);
              return (
                // Tên và trạng thái hai dòng nên bỏ " · " giữa hai phần (TV1-12 b2)
                <li key={r.id} data-testid={`org-request-${r.id}`}>
                  <span className="txt">
                    <b>{r.name}</b>
                    <span className={`st ${kind.className}`} data-testid="org-request-status">
                      <Icon name={kind.icon} />
                      {requestStatusText(r)}
                    </span>
                  </span>
                  {r.status === 'pending' && (
                    // Tên đọc ra kèm tên tổ chức: có nhiều dòng thì "Huỷ" trơn không biết huỷ yêu cầu nào (audit C5)
                    <button
                      type="button"
                      className="soft"
                      aria-label={`Huỷ yêu cầu ${r.name}`}
                      disabled={busy || !online}
                      onClick={() => void cancel(r.id)}
                    >
                      Huỷ
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Mở tổ chức mới</h3>
        <form className="form" onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span>Tên</span>
            <input
              data-testid="org-request-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSent(false);
              }}
            />
          </label>
          <label className="field">
            <span>Ghi chú cho quản trị</span>
            <textarea
              data-testid="org-request-note"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSent(false);
              }}
              rows={2}
            />
          </label>
          <button type="submit" className="primary wide" disabled={busy || !online} aria-busy={sending}>
            Gửi yêu cầu
          </button>
          <BusyNote busy={sending} text="Đang gửi yêu cầu…" />
          {/* Vùng status luôn có, chỉ đổi chữ: vùng chèn vào cùng lúc với chữ thì có máy bỏ qua (như builder, #81) */}
          <p className="visually-hidden" role="status" data-testid="org-request-sent-status">
            {sent ? SENT_MSG : ''}
          </p>
          {sent && (
            // Chỉ để nhìn, không role: vùng status ẩn phía trên đã báo cho trình đọc màn hình
            <p className="ok-line" data-testid="org-request-sent">
              <Icon name="synced" />
              {SENT_MSG}
            </p>
          )}
          {error && (
            <p className="field-error" role="alert" data-testid="org-request-error">
              ⚠ {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
