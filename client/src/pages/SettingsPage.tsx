import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MeResponse } from '@field-survey/shared';
import { accountUsername } from '../accountDisplay';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getAccountValue } from '../db/accountDb';
import { useCurrentProject } from '../db/current';
import { formatBytes } from '../formatBytes';
import { logout, projectsBlockingLogout, type BlockedProject } from '../logout';

// Xem docs/ui.md màn hình 8 và design §4.2, §4.7. Chỉ đọc IndexedDB, dùng được khi offline.

// Đang chạy như app đã cài: Android/máy tính báo qua display-mode, Safari iOS qua navigator.standalone
// (thuộc tính riêng của Safari, không có trong kiểu DOM chuẩn nên đọc bằng Reflect)
function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || Reflect.get(navigator, 'standalone') === true;
}

function blockedMessage(blocked: BlockedProject[]): string {
  const names = blocked.map((p) => `"${p.name}"`).join(', ');
  return `Còn dữ liệu chưa gửi ở dự án ${names}. Đồng bộ xong mới đăng xuất được.`;
}

export function SettingsPage() {
  const user = useLiveQuery(() => getAccountValue<MeResponse['user'] | null>('user', null), []);
  // Đã thuộc tổ chức thì câu hướng dẫn đổi theo: tên đăng nhập chỉ còn cần khi được thêm vào tổ chức khác
  const project = useCurrentProject();
  // Tính lại mỗi khi outbox/phiếu của dự án nào đó đổi, nên nút tự bật khi đồng bộ xong
  const blocked = useLiveQuery(projectsBlockingLogout, []);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

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
    setConfirmingLogout(false);
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
      {/* Về #/ chứ không ghi "Về danh sách phiếu": người chưa thuộc tổ chức nào về màn hình Tổ chức */}
      <a href="#/" className="back">
        ← Quay lại
      </a>
      <h2>Cài đặt</h2>

      <h3>Tài khoản</h3>
      {user === undefined ? null : user ? (
        <>
          <p>{user.name}</p>
          <p>
            Tên đăng nhập: <code data-testid="settings-username">{accountUsername(user)}</code>
          </p>
          <p>
            {project === null
              ? 'Gửi tên này cho giám sát viên của tổ chức để được thêm vào.'
              : 'Giám sát viên hoặc Owner cần tên này nếu muốn thêm bạn vào tổ chức khác.'}
          </p>
        </>
      ) : (
        <p data-testid="settings-username">Chưa có, cần kết nối mạng một lần.</p>
      )}

      {storage && (
        <>
          <h3>Dung lượng</h3>
          <p data-testid="settings-storage">
            Đã dùng {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
          </p>
        </>
      )}

      <h3>Cài lên màn hình chính</h3>
      <div data-testid="settings-install">
        {isInstalled() ? (
          <p>Đã cài lên màn hình chính.</p>
        ) : (
          <>
            <p>
              <b>Android:</b> mở bằng Chrome, bấm menu ⋮ rồi chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".
            </p>
            <p>
              <b>iPhone:</b> mở bằng Safari, bấm nút Chia sẻ rồi chọn "Thêm vào màn hình chính". Trên iPhone phải
              cài thì dữ liệu chưa gửi mới không bị xoá sau 7 ngày không mở.
            </p>
          </>
        )}
      </div>

      <div className="actions">
        <button
          data-testid="logout-button"
          onClick={() => setConfirmingLogout(true)}
          disabled={busy || blocked === undefined || blocked.length > 0}
        >
          Đăng xuất
        </button>
      </div>
      {confirmingLogout && (
        <ConfirmDialog
          message="Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng."
          confirmLabel="Đăng xuất"
          onConfirm={() => void onLogout()}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}
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
