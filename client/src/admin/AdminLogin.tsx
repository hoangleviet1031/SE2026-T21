import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { accountErrorMessage, loginReady } from '../loginForm';
import { AccountError, NetworkError, NotAdminError, ServerError, adminLogin } from './adminApi';
import { NOT_ADMIN_MSG, OFFLINE_MSG, SERVER_ERROR_MSG } from './adminMessages';
import type { AdminSession } from './session';

/**
 * Câu ở form đăng nhập. 'warn' cho chuyện không phải lỗi của người dùng (mất mạng, phiên hết) nên nền vàng;
 * 'error' chữ đỏ (ui.md trang quản trị A0, cùng luật với màn hình 1 của app)
 */
export type LoginProblem = { kind: 'error' | 'warn'; text: string };

// Đăng nhập trang quản trị (design §4.9, ADR 0003 §8). Chỉ tab Đăng nhập: admin tạo bằng CLI.
export function AdminLogin({
  notice,
  onSignedIn,
}: {
  /** Vì sao phải đăng nhập lại (vd. phiên bị thu hồi) */
  notice: LoginProblem | null;
  onSignedIn: (session: AdminSession) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<LoginProblem | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!loginReady({ username, password })) return;
    setBusy(true);
    setProblem(null);
    try {
      onSignedIn(await adminLogin({ username: username.trim(), password }));
    } catch (err) {
      if (err instanceof AccountError) setProblem({ kind: 'error', text: accountErrorMessage(err.code) });
      else if (err instanceof NotAdminError) setProblem({ kind: 'error', text: NOT_ADMIN_MSG });
      else if (err instanceof NetworkError) setProblem({ kind: 'warn', text: OFFLINE_MSG });
      else if (err instanceof ServerError) setProblem({ kind: 'error', text: SERVER_ERROR_MSG });
      else throw err;
    } finally {
      setBusy(false);
    }
  }

  const shown = problem ?? notice;

  return (
    <form className="card form admin-login" onSubmit={(e) => void submit(e)}>
      <div className="head">
        <span className="logo">
          <Icon name="logo" />
        </span>
        <h1>Quản trị</h1>
      </div>
      <label className="field">
        <span>Tên đăng nhập</span>
        <input
          data-testid="admin-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span>Mật khẩu</span>
        <input
          data-testid="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <button type="submit" className="primary wide" disabled={busy || !loginReady({ username, password })}>
        Đăng nhập
      </button>
      {shown && (
        <p className={shown.kind === 'warn' ? 'warning' : 'field-error'} role="alert">
          ⚠ {shown.text}
        </p>
      )}
    </form>
  );
}
