import { useState } from 'react';
import { useHashRoute } from '../useHashRoute';
import { NetworkError, logoutSession } from './adminApi';
import { AdminLogin } from './AdminLogin';
import { clearSession, readSession, saveSession, type AdminSession } from './session';

// Khung trang quản trị (design §4.9, ui.md "Trang quản trị"): A1 Yêu cầu ở `#/` (mặc định), A2 Tổ chức
// ở `#/projects`. Mục Tài khoản (A3) chưa hiện tới khi có API của TV2-17.
export function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(readSession);

  if (!session) {
    return (
      <main className="admin">
        <AdminLogin
          onSignedIn={(s) => {
            saveSession(s);
            setSession(s);
          }}
        />
      </main>
    );
  }
  return (
    <AdminShell
      session={session}
      onSignedOut={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

function AdminShell({ session, onSignedOut }: { session: AdminSession; onSignedOut: () => void }) {
  const [page] = useHashRoute();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onProjects = page === 'projects';

  async function signOut() {
    setBusy(true);
    setProblem(null);
    try {
      await logoutSession(session.token);
      onSignedOut();
    } catch (err) {
      // Còn giữ token để bấm lại khi có mạng; bỏ token mà phiên vẫn sống trên server thì không ai thu hồi được
      if (err instanceof NetworkError) setProblem('Cần kết nối mạng để đăng xuất');
      else throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin">
      <header>
        <span className="brand">Quản trị</span>
        <nav className="admin-nav">
          <a href="#/" aria-current={onProjects ? undefined : 'page'}>
            Yêu cầu
          </a>
          <a href="#/projects" aria-current={onProjects ? 'page' : undefined}>
            Tổ chức
          </a>
        </nav>
        <span data-testid="admin-user">{session.user.name}</span>
        <button type="button" onClick={() => void signOut()} disabled={busy}>
          Đăng xuất
        </button>
      </header>
      {problem && <p role="alert">⚠ {problem}</p>}
      <main>
        {onProjects ? (
          <section>
            <h1>Tổ chức</h1>
            <p className="hint">Màn hình này đang làm.</p>
          </section>
        ) : (
          <section>
            <h1>Yêu cầu mở tổ chức</h1>
            <p className="hint">Màn hình này đang làm.</p>
          </section>
        )}
      </main>
    </div>
  );
}
