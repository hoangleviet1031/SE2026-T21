import { useHashRoute } from './useHashRoute';
import { useOnline } from './useOnline';
import { HomePage } from './pages/HomePage';
import { FillPage } from './pages/FillPage';
import { ConflictPage } from './pages/ConflictPage';
import { syncNow } from './sync/engine';

export function App() {
  const [page, ...args] = useHashRoute();
  const online = useOnline();

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
