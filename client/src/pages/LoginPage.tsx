import { useState, type FormEvent } from 'react';
import { useOnline } from '../useOnline';
import { syncNow } from '../sync/engine';
import { AccountError, AdminAccountError, NetworkError } from '../sync/api';
import { SignInBlockedError, signInWithToken } from '../signIn';

const OFFLINE_MSG = 'Cần kết nối mạng để đăng nhập lần đầu';

/** Câu báo khi máy còn dữ liệu chưa gửi của người khác (design §4.7). */
function blockedMessage(err: SignInBlockedError): string {
  const who = err.previousName ? ` của ${err.previousName}` : '';
  const what = err.unsentRecords > 0 ? `${err.unsentRecords} phiếu chưa gửi` : 'dữ liệu chưa gửi';
  return `Máy này còn ${what}${who}. Nhập lại mã của người đó để gửi, hoặc xuất JSON trước.`;
}

// Xem docs/design.md §4.7 (Lần đầu mở app) và docs/ui.md màn hình 1. Màn hình tên + mật khẩu là
// việc của TV1-14; tới lúc đó vẫn nhập mã phiên, nhưng mã được kiểm bằng /me trước khi lưu (TV2-16).
export function LoginPage() {
  const online = useOnline();
  const [token, setTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const message = online ? error : OFFLINE_MSG;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = token.trim();
    if (!value) return;
    // Lần đầu phải có mạng để kiểm tra mã; lưu mã chưa kiểm tra thì người dùng
    // chỉ biết mã sai khi đã ra thực địa. Thông báo offline hiện sẵn bên dưới.
    if (!navigator.onLine) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithToken(value);
      // Chưa có mã thì các lần đồng bộ trước đều dừng; có mã rồi thì tải form và phiếu ngay.
      void syncNow().catch((e) => console.warn('sync failed', e));
    } catch (err) {
      if (err instanceof AccountError) setError('Mã không đúng');
      else if (err instanceof AdminAccountError) setError('Tài khoản quản trị dùng trang /admin');
      else if (err instanceof SignInBlockedError) setError(blockedMessage(err));
      else if (err instanceof NetworkError) setError(OFFLINE_MSG);
      else throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>Mã đăng nhập</span>
        <input
          data-testid="login-token"
          value={token}
          onChange={(e) => setTokenInput(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>
      <p>Nhận mã từ quản trị viên.</p>
      <button type="submit" disabled={busy || !token.trim()}>
        Tiếp tục
      </button>
      {message && <p role="alert">⚠ {message}</p>}
    </form>
  );
}
