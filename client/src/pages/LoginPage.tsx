import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { BusyNote } from '../components/BusyNote';
import { SESSION_EXPIRED_MSG } from '../apiErrors';
import { isSessionExpired } from '../auth';
import { useOnline } from '../useOnline';
import { syncNow } from '../sync/engine';
import { AccountError, AdminAccountError, NetworkError } from '../sync/api';
import { SignInBlockedError, downloadUnsentOnDevice, registerAndSignIn, signIn } from '../signIn';
import {
  EXPORT_FAILED_MSG,
  OFFLINE_MSG,
  accountErrorFields,
  accountErrorMessage,
  blockedMessage,
  exportResultText,
  loginReady,
  registerProblem,
  tabForKey,
  type LoginField,
  type LoginTab,
} from '../loginForm';

// 'offline' tách khỏi 'text' vì không phải lỗi của người dùng: nền vàng thay vì chữ đỏ (ui.md màn hình 1)
// fields: ô gắn với câu lỗi (aria-invalid, aria-describedby), design §11.3
type Problem =
  | { kind: 'text'; text: string; fields: LoginField[] }
  | { kind: 'offline' }
  | { kind: 'admin' }
  | { kind: 'blocked'; text: string };

// Xem docs/design.md §4.7 (Tài khoản, Sau khi đăng nhập) và docs/ui.md màn hình 1. Lần đầu luôn cần
// mạng: server cấp phiên, và signIn.ts phải biết người dùng là ai trước khi lưu token.
export function LoginPage() {
  const online = useOnline();
  // Bị đẩy về đây vì server từ chối token (401): báo lý do tới khi đăng nhập lại (design §8)
  const expired = useLiveQuery(isSessionExpired, []);
  const [tab, setTab] = useState<LoginTab>('login');
  const tabRefs = { login: useRef<HTMLButtonElement>(null), register: useRef<HTMLButtonElement>(null) };
  const ids = { login: useId(), register: useId(), panel: useId(), error: useId() };
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  // Kết quả nút Xuất JSON khi bị từ chối đổi tài khoản. Lỗi xuất chữ đỏ nên giữ cờ riêng, không so chữ
  const [exportNote, setExportNote] = useState<{ text: string; failed: boolean } | null>(null);

  async function exportUnsent() {
    setExportNote(null);
    try {
      setExportNote({ text: exportResultText(await downloadUnsentOnDevice()), failed: false });
    } catch (err) {
      // Lỗi đọc IndexedDB: chỉ đọc để tải file, không xoá gì, nên báo cho người dùng bấm lại và ghi lỗi
      // để tra. Lỗi khác là lỗi lập trình, ném tiếp
      if (!(err instanceof Dexie.DexieError)) throw err;
      console.error('xuất JSON lỗi', err);
      setExportNote({ text: EXPORT_FAILED_MSG, failed: true });
    }
  }

  const shown: Problem | null = online ? problem : { kind: 'offline' };

  function switchTab(next: LoginTab) {
    setTab(next);
    setProblem(null);
    setExportNote(null);
  }

  // Phím mũi tên, Home, End đổi tab và chuyển con trỏ theo (mẫu tab của WAI-ARIA, design §11.3).
  // Đổi tab không mất chữ đã gõ nên chọn luôn, không đợi Enter
  function onTabKey(e: KeyboardEvent) {
    const next = tabForKey(tab, e.key);
    if (!next) return;
    // Home/End mặc định cuộn trang
    e.preventDefault();
    switchTab(next);
    tabRefs[next].current?.focus();
  }

  // Chỉ gắn khi dòng lỗi đang hiện: mất mạng thì shown đổi sang 'offline' nên ô hết báo lỗi
  function errorProps(field: LoginField) {
    if (shown?.kind !== 'text' || !shown.fields.includes(field)) return {};
    return { 'aria-invalid': true, 'aria-describedby': ids.error } as const;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Thông báo offline đã hiện sẵn bên dưới
    if (!navigator.onLine) return;
    if (tab === 'register') {
      const invalid = registerProblem({ username, name, password, password2 });
      if (invalid) return setProblem({ kind: 'text', ...invalid });
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
      if (err instanceof AccountError) {
        setProblem({ kind: 'text', text: accountErrorMessage(err.code), fields: accountErrorFields(err.code) });
      } else if (err instanceof AdminAccountError) setProblem({ kind: 'admin' });
      else if (err instanceof SignInBlockedError) {
        setProblem({ kind: 'blocked', text: blockedMessage(err.previousName, err.unsentRecords) });
      } else if (err instanceof NetworkError) setProblem({ kind: 'offline' });
      else throw err;
    } finally {
      setBusy(false);
    }
  }

  const ready = tab === 'login' ? loginReady({ username, password }) : username.trim() !== '' && password !== '';

  return (
    <form className="form login" onSubmit={(e) => void submit(e)}>
      <div className="seg" role="tablist" onKeyDown={onTabKey}>
        {(['login', 'register'] as const).map((t) => (
          <button
            key={t}
            ref={tabRefs[t]}
            id={ids[t]}
            type="button"
            role="tab"
            aria-selected={tab === t}
            // Khung của tab không chọn không có trên trang nên không trỏ tới; Tab chỉ dừng ở tab đang chọn
            aria-controls={tab === t ? ids.panel : undefined}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => switchTab(t)}
          >
            {t === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        ))}
      </div>
      <div className="login-panel" role="tabpanel" id={ids.panel} aria-labelledby={ids[tab]}>
        <label className="field">
          <span>Tên đăng nhập</span>
          <input
            data-testid="login-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            {...errorProps('username')}
          />
          {tab === 'register' && <small>chữ thường, số, . _ (3–32)</small>}
        </label>
        {tab === 'register' && (
          <label className="field">
            <span>Tên hiển thị</span>
            <input
              data-testid="register-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              {...errorProps('name')}
            />
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
            {...errorProps('password')}
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
              {...errorProps('password2')}
            />
          </label>
        )}
        <button type="submit" className="primary wide" disabled={busy || !ready} aria-busy={busy}>
          {tab === 'login' ? 'Tiếp tục' : 'Tạo tài khoản'}
        </button>
        <BusyNote busy={busy} text={tab === 'login' ? 'Đang đăng nhập…' : 'Đang tạo tài khoản…'} />
        {/* Theo câu đang hiện chứ không theo problem: mất mạng không ghi vào problem mà vẫn phải ẩn dải này,
            để không hiện cùng lúc hai dải vàng. Có mạng lại thì hiện lại (ui.md màn hình 1) */}
        {expired && !shown && (
          <p className="warning" data-testid="session-expired">
            ⚠ {SESSION_EXPIRED_MSG}
          </p>
        )}
        {shown?.kind === 'text' && (
          <p className="field-error" role="alert" id={ids.error}>
            ⚠ {shown.text}
          </p>
        )}
        {shown?.kind === 'offline' && (
          <p className="warning" role="alert">
            ⚠ {OFFLINE_MSG}
          </p>
        )}
        {shown?.kind === 'admin' && (
          <p className="field-error" role="alert">
            ⚠ Tài khoản quản trị dùng trang <a href="/admin/">/admin</a>
          </p>
        )}
        {shown?.kind === 'blocked' && (
          <div className="blocked">
            <p role="alert">⚠ {shown.text}</p>
            <button type="button" onClick={() => void exportUnsent()}>
              Xuất JSON
            </button>
            {exportNote && (
              <p className={exportNote.failed ? 'result failed' : 'result'} data-testid="export-note">
                {exportNote.text}
              </p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
