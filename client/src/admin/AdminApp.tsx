import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { useHashRoute } from '../useHashRoute';
import { NetworkError, ServerError, SessionLostError, fetchPendingRequests, logoutSession } from './adminApi';
import { AdminLogin, type LoginProblem } from './AdminLogin';
import { OFFLINE_MSG, SERVER_ERROR_MSG, SESSION_LOST_MSG, adminErrorMessage } from './adminMessages';
import { ProjectsPage } from './ProjectsPage';
import { RequestsPage } from './RequestsPage';
import { clearSession, readSession, saveSession, type AdminSession } from './session';

// Khung trang quản trị (design §4.9, ui.md "Trang quản trị"): A1 Yêu cầu ở `#/` (mặc định), A2 Tổ chức
// ở `#/projects`. Mục Tài khoản (A3) chưa hiện tới khi có API của TV2-17.
export function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(readSession);
  // Câu hiện ở form đăng nhập khi bị đẩy ra do phiên mất
  const [loginNotice, setLoginNotice] = useState<LoginProblem | null>(null);

  const signOutLocally = useCallback((notice: LoginProblem | null) => {
    clearSession();
    setLoginNotice(notice);
    setSession(null);
  }, []);

  if (!session) {
    return (
      <main className="admin alogin">
        <AdminLogin
          notice={loginNotice}
          onSignedIn={(s) => {
            saveSession(s);
            setLoginNotice(null);
            setSession(s);
          }}
        />
      </main>
    );
  }
  return <AdminShell session={session} onSignedOut={signOutLocally} />;
}

function AdminShell({
  session,
  onSignedOut,
}: {
  session: AdminSession;
  onSignedOut: (notice: LoginProblem | null) => void;
}) {
  const [page] = useHashRoute();
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const onProjects = page === 'projects';
  const { token } = session;

  // Lỗi chung của mọi lời gọi API admin. Phiên mất thì về form đăng nhập (trả null: không còn gì để hiện
  // ở trang); lỗi khác ném tiếp để không che lỗi lập trình.
  const handleError = useCallback(
    (err: unknown): string | null => {
      if (err instanceof SessionLostError) {
        // Không phải lỗi của admin: nền vàng ở form đăng nhập
        onSignedOut({ kind: 'warn', text: SESSION_LOST_MSG });
        return null;
      }
      if (err instanceof NetworkError) return OFFLINE_MSG;
      if (err instanceof ServerError) return SERVER_ERROR_MSG;
      throw err;
    },
    [onSignedOut],
  );

  // Số yêu cầu đang chờ trên thanh trên cả khi mở thẳng A2; A1 cập nhật lại mỗi lần tải danh sách
  useEffect(() => {
    fetchPendingRequests(token)
      .then((res) => {
        if (res.ok) setPending(res.value.length);
        else setProblem(adminErrorMessage(res.error));
      })
      .catch((err: unknown) => {
        const text = handleError(err);
        if (text) setProblem(text);
      });
  }, [token, handleError]);

  async function signOut() {
    setBusy(true);
    setProblem(null);
    try {
      await logoutSession(token);
      onSignedOut(null);
    } catch (err) {
      // Còn giữ token để bấm lại; bỏ token mà phiên vẫn sống trên server thì không ai thu hồi được
      if (err instanceof NetworkError) setProblem('Cần kết nối mạng để đăng xuất');
      else if (err instanceof ServerError) setProblem(SERVER_ERROR_MSG);
      else throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin">
      <header className="abar">
        <span className="logo">
          <Icon name="logo" />
        </span>
        <span className="brand-a">Quản trị</span>
        <nav className="admin-nav">
          <a href="#/" aria-current={onProjects ? undefined : 'page'}>
            Yêu cầu{pending === null ? '' : ` (${pending})`}
          </a>
          <a href="#/projects" aria-current={onProjects ? 'page' : undefined}>
            Tổ chức
          </a>
        </nav>
        <span className="who" data-testid="admin-user">
          {session.user.name}
        </span>
        <button type="button" className="small" onClick={() => void signOut()} disabled={busy}>
          Đăng xuất
        </button>
      </header>
      <main className="abody">
        {/* Lỗi chung (đếm yêu cầu, đăng xuất) cùng kiểu dòng kết quả. Không dùng Notice: trang con có Notice
            riêng, hai dòng cùng testid thì không phân biệt được */}
        {problem && (
          <p className="result bad" role="alert">
            ⚠ {problem}
          </p>
        )}
        {onProjects ? (
          <ProjectsPage token={token} onError={handleError} />
        ) : (
          <RequestsPage token={token} onError={handleError} onCount={setPending} />
        )}
      </main>
    </div>
  );
}
