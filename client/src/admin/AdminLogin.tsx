import { useState, type FormEvent } from 'react';
import { OFFLINE_MSG, accountErrorMessage, loginReady } from '../loginForm';
import { AccountError, NetworkError, NotAdminError, adminLogin } from './adminApi';
import type { AdminSession } from './session';

const NOT_ADMIN_MSG = 'Tài khoản này không phải quản trị';

// Đăng nhập trang quản trị (design §4.9, ADR 0003 §8). Chỉ tab Đăng nhập: admin tạo bằng CLI.
export function AdminLogin({ onSignedIn }: { onSignedIn: (session: AdminSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!loginReady({ username, password })) return;
    setBusy(true);
    setProblem(null);
    try {
      onSignedIn(await adminLogin({ username: username.trim(), password }));
    } catch (err) {
      if (err instanceof AccountError) setProblem(accountErrorMessage(err.code));
      else if (err instanceof NotAdminError) setProblem(NOT_ADMIN_MSG);
      else if (err instanceof NetworkError) setProblem(OFFLINE_MSG);
      else throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form admin-login" onSubmit={(e) => void submit(e)}>
      <h1>Quản trị</h1>
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
      <button type="submit" className="primary" disabled={busy || !loginReady({ username, password })}>
        Đăng nhập
      </button>
      {problem && <p role="alert">⚠ {problem}</p>}
    </form>
  );
}
