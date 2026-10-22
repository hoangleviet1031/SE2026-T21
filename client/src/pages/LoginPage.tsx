import { useState, type FormEvent } from 'react';
import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { SESSION_EXPIRED_MSG } from '../apiErrors';
import { isSessionExpired } from '../auth';
import { useOnline } from '../useOnline';
import { syncNow } from '../sync/engine';
import { AccountError, AdminAccountError, NetworkError } from '../sync/api';
import { SignInBlockedError, downloadUnsentOnDevice, registerAndSignIn, signIn } from '../signIn';
import {
  EXPORT_FAILED_MSG,
  OFFLINE_MSG,
  accountErrorMessage,
  blockedMessage,
  exportResultText,
  loginReady,
  registerError,
} from '../loginForm';

type Tab = 'login' | 'register';

type Problem = { kind: 'text'; text: string } | { kind: 'admin' } | { kind: 'blocked'; text: string };

// Xem docs/design.md §4.7 (Tài khoản, Sau khi đăng nhập) và docs/ui.md màn hình 1. Lần đầu luôn cần
// mạng: server cấp phiên, và signIn.ts phải biết người dùng là ai trước khi lưu token.
export function LoginPage() {
  const online = useOnline();
  // Bị đẩy về đây vì server từ chối token (401): báo lý do tới khi đăng nhập lại (design §8)
  const expired = useLiveQuery(isSessionExpired, []);
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  // Kết quả nút Xuất JSON khi bị từ chối đổi tài khoản
  const [exportNote, setExportNote] = useState<string | null>(null);

  async function exportUnsent() {
    setExportNote(null);
    try {
      setExportNote(exportResultText(await downloadUnsentOnDevice()));
    } catch (err) {
      // Lỗi đọc IndexedDB: chỉ đọc để tải file, không xoá gì, nên báo cho người dùng bấm lại và ghi lỗi
      // để tra. Lỗi khác là lỗi lập trình, ném tiếp
      if (!(err instanceof Dexie.DexieError)) throw err;
      console.error('xuất JSON lỗi', err);
      setExportNote(EXPORT_FAILED_MSG);
    }
  }

  const shown: Problem | null = online ? problem : { kind: 'text', text: OFFLINE_MSG };

  function switchTab(next: Tab) {
    setTab(next);
    setProblem(null);
    setExportNote(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Thông báo offline đã hiện sẵn bên dưới
    if (!navigator.onLine) return;
    if (tab === 'register') {
      const invalid = registerError({ username, name, password, password2 });
      if (invalid) return setProblem({ kind: 'text', text: invalid });
    } else if (!loginReady({ username, password })) {
      return;
    }
    setBusy(true);
    setProblem(null);
    setExportNote(null);
    try {
      if (tab === 'register') await registerAndSignIn({ username: username.trim(), name: name.trim(), password });
      else await signIn({ username: username.trim(), password });
      // Chưa có token thì các lần đồng bộ trước đều dừng; có rồi thì tải form và phiếu ngay.
      void syncNow().catch((e) => console.warn('sync failed', e));
    } catch (err) {
      if (err instanceof AccountError) setProblem({ kind: 'text', text: accountErrorMessage(err.code) });
      else if (err instanceof AdminAccountError) setProblem({ kind: 'admin' });
      else if (err instanceof SignInBlockedError) {
        setProblem({ kind: 'blocked', text: blockedMessage(err.previousName, err.unsentRecords) });
      } else if (err instanceof NetworkError) setProblem({ kind: 'text', text: OFFLINE_MSG });
      else throw err;
    } finally {
      setBusy(false);
    }
  }

  const ready = tab === 'login' ? loginReady({ username, password }) : username.trim() !== '' && password !== '';

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'login'} onClick={() => switchTab('login')}>
          Đăng nhập
        </button>
        <button type="button" role="tab" aria-selected={tab === 'register'} onClick={() => switchTab('register')}>
          Tạo tài khoản
        </button>
      </div>
      <label className="field">
        <span>Tên đăng nhập</span>
        <input
          data-testid="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
        />
        {tab === 'register' && <small>chữ thường, số, . _ (3–32)</small>}
      </label>
      {tab === 'register' && (
        <label className="field">
          <span>Tên hiển thị</span>
          <input data-testid="register-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
      )}
      <label className="field">
        <span>Mật khẩu</span>
        <input
          data-testid="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
        />
      </label>
      {tab === 'register' && (
        <label className="field">
          <span>Nhập lại mật khẩu</span>
          <input
            data-testid="register-password2"
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
        </label>
      )}
      <button type="submit" disabled={busy || !ready}>
        {tab === 'login' ? 'Tiếp tục' : 'Tạo tài khoản'}
      </button>
      {expired && !problem && <p data-testid="session-expired">⚠ {SESSION_EXPIRED_MSG}</p>}
      {shown?.kind === 'text' && <p role="alert">⚠ {shown.text}</p>}
      {shown?.kind === 'admin' && (
        <p role="alert">
          ⚠ Tài khoản quản trị dùng trang <a href="/admin/">/admin</a>
        </p>
      )}
      {shown?.kind === 'blocked' && (
        <div>
          <p role="alert">⚠ {shown.text}</p>
          <button type="button" onClick={() => void exportUnsent()}>
            Xuất JSON
          </button>
          {exportNote && <p data-testid="export-note">{exportNote}</p>}
        </div>
      )}
    </form>
  );
}
