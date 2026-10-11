import { useState, type FormEvent } from 'react';
import { setToken } from '../auth';
import { useOnline } from '../useOnline';

const OFFLINE_MSG = 'Cần kết nối mạng để đăng nhập lần đầu';

// Xem docs/design.md §4.7 (Lần đầu mở app) và docs/ui.md màn hình 1.
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
      // TODO(TV2-04): gọi GET /api/me qua api.ts để kiểm tra mã; 401 thì báo "Mã không đúng".
      await setToken(value);
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
