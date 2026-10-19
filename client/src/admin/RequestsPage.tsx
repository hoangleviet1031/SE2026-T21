import { useCallback, useEffect, useState } from 'react';
import { REJECT_REASON_MAX_LENGTH, type AdminProjectRequest } from '@field-survey/shared';
import { decideRequest, fetchPendingRequests } from './adminApi';
import { adminErrorMessage, formatShortTime } from './adminMessages';
import { Notice, type NoticeValue } from './Notice';

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
        <p className="hint">Không có yêu cầu nào đang chờ</p>
      ) : (
        <div className="table-wrap">
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
                <tr key={req.id}>
                  <td>{req.name}</td>
                  <td>
                    {req.user.name} ({req.user.username})
                  </td>
                  <td>{formatShortTime(req.createdAt)}</td>
                  <td className="note">{req.note ?? ''}</td>
                  <td>
                    {rejecting === req.id ? (
                      <div className="row-form">
                        <label className="field">
                          <span>Lý do từ chối</span>
                          <textarea
                            data-testid="reject-reason"
                            value={reason}
                            maxLength={REJECT_REASON_MAX_LENGTH}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="danger"
                            disabled={busy || !reasonOk}
                            onClick={() => void decide(req, false)}
                          >
                            Xác nhận từ chối
                          </button>
                          <button type="button" onClick={() => setRejecting(null)}>
                            Huỷ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button type="button" className="primary" disabled={busy} onClick={() => void decide(req, true)}>
                          Duyệt
                        </button>
                        <button
                          type="button"
                          disabled={busy}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
