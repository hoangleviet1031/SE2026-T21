import { useLiveQuery } from 'dexie-react-hooks';
import { getToken } from './auth';
import { useHashRoute } from './useHashRoute';
import { useOnline } from './useOnline';
import { HomePage } from './pages/HomePage';
import { FillPage } from './pages/FillPage';
import { ConflictPage } from './pages/ConflictPage';
import { LoginPage } from './pages/LoginPage';
import { syncNow } from './sync/engine';

export function App() {
  const [page, ...args] = useHashRoute();
  const online = useOnline();
  // Đọc qua liveQuery để khi mã bị xoá (401, đăng xuất) app tự quay về màn hình nhập mã
  const token = useLiveQuery(getToken, []);

  // Đang đọc IndexedDB: chưa vẽ gì, tránh nháy màn hình nhập mã với người đã đăng nhập
  if (token === undefined) return null;

  if (token === null) {
    return (
      <div className="app">
        <header>
          <span className="brand">Khảo sát thực địa</span>
        </header>
        <main>
          <LoginPage />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <a href="#/" className="brand">
          Khảo sát thực địa
        </a>
        <span className={online ? 'badge ok' : 'badge off'} data-testid="network-status">
          {online ? 'Trực tuyến' : 'Ngoại tuyến'}
        </span>
        <button onClick={() => void syncNow()} disabled={!online}>
          Đồng bộ
        </button>
      </header>
      <main>
        {page === 'fill' && args[0] ? (
          <FillPage formId={args[0]} recordId={args[1]} />
        ) : page === 'conflict' && args[0] ? (
          <ConflictPage recordId={args[0]} />
        ) : (
          <HomePage />
        )}
      </main>
    </div>
  );
}
