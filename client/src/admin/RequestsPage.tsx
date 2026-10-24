import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { REJECT_REASON_MAX_LENGTH, type AdminProjectRequest } from '@field-survey/shared';
import { decideRequest, fetchPendingRequests } from './adminApi';
import { adminErrorMessage, formatShortTime } from './adminMessages';
import { Icon } from '../components/Icon';
import { Notice, type NoticeValue } from './Notice';

const COLUMNS = 5;

// A1. Yêu cầu mở tổ chức (design §4.9, ui.md A1). Duyệt tạo tổ chức và người gửi thành Owner; từ chối
// bắt buộc có lý do, người gửi thấy lý do ở màn hình Tổ chức.
export function RequestsPage({
  token,
  onError,
  onCount,
}: {
  token: string;
  /** Phiên mất, mất mạng, máy chủ lỗi: AdminApp xử lý chung, trả câu cần hiện (null nếu đã về đăng nhập) */
  onError: (err: unknown) => string | null;
  /** Số yêu cầu đang chờ cho thanh trên "Yêu cầu (n)" */
  onCount: (n: number) => void;
}) {
  const [requests, setRequests] = useState<AdminProjectRequest[] | null>(null);
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Bàn phím: mở ô lý do thì vào thẳng ô, Huỷ thì về lại nút [Từ chối…] của dòng đó (ô đã mất khỏi trang)
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const rejectButtons = useRef(new Map<string, HTMLButtonElement>());
  const [focusBack, setFocusBack] = useState<string | null>(null);

  useEffect(() => {
    if (rejecting) reasonRef.current?.focus();
  }, [rejecting]);

  useEffect(() => {
    if (!focusBack) return;
    rejectButtons.current.get(focusBack)?.focus();
    setFocusBack(null);
  }, [focusBack]);

  function cancelReject() {
    setFocusBack(rejecting);
    setRejecting(null);
  }

  const load = useCallback(async () => {
    const res = await fetchPendingRequests(token);
    if (!res.ok) return setNotice({ kind: 'error', text: adminErrorMessage(res.error) });
    setRequests(res.value);
    onCount(res.value.length);
  }, [token, onCount]);

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

  async function decide(req: AdminProjectRequest, approve: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await decideRequest(
        token,
        req.id,
        approve ? { decision: 'approve' } : { decision: 'reject', reason: reason.trim() },
      );
      if (res.ok) {
        setNotice({
          kind: 'ok',
          text: approve ? `Đã duyệt: ${req.name} (mã ${res.value.projectId ?? ''})` : `Đã từ chối: ${req.name}`,
        });
        setRejecting(null);
        setReason('');
      } else {
        setNotice({ kind: 'error', text: adminErrorMessage(res.error) });
      }
      // Luôn tải lại: request_decided nghĩa là danh sách đang hiện đã cũ (tab khác đã xử lý)
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const trimmedReason = reason.trim();
  const reasonOk = trimmedReason.length >= 1 && trimmedReason.length <= REJECT_REASON_MAX_LENGTH;

  return (
    <section>
      <h1>Yêu cầu mở tổ chức</h1>
      <Notice value={notice} />
      {requests === null ? (
        <p className="hint">Đang tải…</p>
      ) : requests.length === 0 ? (
        <div className="tcard">
          <p className="aempty">
            <Icon name="inbox" />
            Không có yêu cầu nào đang chờ
          </p>
        </div>
      ) : (
        <div className="tcard table-wrap">
          <table className="admin-table" data-testid="admin-requests">
            <thead>
              <tr>
                <th>Tên tổ chức</th>
                <th>Người gửi</th>
                <th>Lúc</th>
                <th>Ghi chú</th>
                <th>
                  <span className="visually-hidden">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <Fragment key={req.id}>
                  <tr className={rejecting === req.id ? 'open' : undefined}>
                    <td>
                      <b>{req.name}</b>
                    </td>
                    <td>
                      {req.user.name} ({req.user.username})
                    </td>
                    <td className="when">{formatShortTime(req.createdAt)}</td>
                    <td className="note">{req.note || '—'}</td>
                    <td className="act">
                      {rejecting !== req.id && (
                        <div className="row-actions">
                          <button type="button" className="primary" disabled={busy} onClick={() => void decide(req, true)}>
                            Duyệt
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            ref={(el) => {
                              if (el) rejectButtons.current.set(req.id, el);
                              else rejectButtons.current.delete(req.id);
                            }}
                            onClick={() => {
                              setRejecting(req.id);
                              setReason('');
                            }}
                          >
                            Từ chối…
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {/* Mở ngay dưới dòng, rộng hết bảng cho ô lý do đủ chỗ (ui.md A1) */}
                  {rejecting === req.id && (
                    <tr className="exp" data-testid={`request-expand-${req.id}`}>
                      <td colSpan={COLUMNS}>
                        <div className="inline-form">
                          <label className="field">
                            <span>Lý do từ chối</span>
                            <textarea
                              ref={reasonRef}
                              data-testid="reject-reason"
                              value={reason}
                              maxLength={REJECT_REASON_MAX_LENGTH}
                              onChange={(e) => setReason(e.target.value)}
                            />
                          </label>
                          <button
                            type="button"
                            className="danger"
                            disabled={busy || !reasonOk}
                            onClick={() => void decide(req, false)}
                          >
                            Xác nhận từ chối
                          </button>
                          <button type="button" className="soft" onClick={cancelReject}>
                            Huỷ
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
