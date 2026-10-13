import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MeResponse } from '@field-survey/shared';
import { getAccountValue } from '../db/accountDb';
import { useCurrentProject } from '../db/current';
import { formatBytes } from '../formatBytes';
import { logout, projectsBlockingLogout, type BlockedProject } from '../logout';

// Xem docs/ui.md màn hình 8 và design §4.2, §4.7. Chỉ đọc IndexedDB, dùng được khi offline.

function blockedMessage(blocked: BlockedProject[]): string {
  const names = blocked.map((p) => `"${p.name}"`).join(', ');
  return `Còn dữ liệu chưa gửi ở dự án ${names}. Đồng bộ xong mới đăng xuất được.`;
}

export function SettingsPage() {
  const user = useLiveQuery(() => getAccountValue<MeResponse['user'] | null>('user', null), []);
  // Đã thuộc dự án thì câu hướng dẫn đổi theo: mã chỉ còn cần khi được thêm vào dự án khác
  const project = useCurrentProject();
  // Tính lại mỗi khi outbox/phiếu của dự án nào đó đổi, nên nút tự bật khi đồng bộ xong
  const blocked = useLiveQuery(projectsBlockingLogout, []);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    let alive = true;
    void navigator.storage.estimate().then((e) => {
      if (alive) setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onLogout() {
    if (!window.confirm('Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng.')) return;
    setBusy(true);
    setError(null);
    try {
      // Kiểm lại trong lúc xoá: có thể vừa có phiếu mới ở tab khác
      const stillBlocked = await logout();
      if (stillBlocked.length > 0) setError(blockedMessage(stillBlocked));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Cài đặt</h2>

      <h3>Tài khoản</h3>
      {user === undefined ? null : user ? (
        <>
          <p>{user.name}</p>
          {/* TODO(TV2-14): hiện tên đăng nhập thay mã người dùng khi /me trả `username` (design §4.7 🆕) */}
          <p>
            Mã người dùng: <code data-testid="settings-user-id">{user.id}</code>
          </p>
          <p>
            {project === null
              ? 'Gửi mã này cho giám sát viên để được thêm vào dự án.'
              : 'Giám sát viên cần mã này nếu muốn thêm bạn vào dự án khác.'}
          </p>
        </>
      ) : (
        <p data-testid="settings-user-id">Chưa có, cần kết nối mạng một lần.</p>
      )}

      {storage && (
        <>
          <h3>Dung lượng</h3>
          <p data-testid="settings-storage">
            Đã dùng {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
          </p>
        </>
      )}

      <div className="actions">
        <button
          data-testid="logout-button"
          onClick={() => void onLogout()}
          disabled={busy || blocked === undefined || blocked.length > 0}
        >
          Đăng xuất
        </button>
      </div>
      {blocked && blocked.length > 0 && (
        <p className="warning" data-testid="logout-blocked">
          {blockedMessage(blocked)}
        </p>
      )}
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
