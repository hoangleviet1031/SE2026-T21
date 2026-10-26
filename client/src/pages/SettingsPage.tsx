import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MeResponse } from '@field-survey/shared';
import { accountUsername } from '../accountDisplay';
import { apiFailureText } from '../apiErrors';
import {
  CHANGE_PASSWORD_DONE_MSG,
  CHANGE_PASSWORD_OFFLINE_MSG,
  changePasswordError,
  changePasswordErrorText,
  type ChangePasswordInput,
} from '../changePasswordForm';
import { BusyNote } from '../components/BusyNote';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { getAccountValue } from '../db/accountDb';
import { useCurrentProject } from '../db/current';
import { formatBytes, usagePercent } from '../formatBytes';
import { logout, projectsBlockingLogout, type BlockedProject } from '../logout';
import { apiFailure, changePassword } from '../sync/api';
import { useOnline } from '../useOnline';

// Xem docs/ui.md màn hình 8 và design §4.2, §4.7. Chỉ đọc IndexedDB, dùng được khi offline; riêng Đổi mật khẩu
// gọi API thẳng (cần mạng, CLAUDE.md bất biến 7).

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
  const blockedId = useId();

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

  const percent = storage ? usagePercent(storage.usage, storage.quota) : null;

  return (
    <section className="settings">
      {/* Về #/ chứ không ghi "Về danh sách phiếu": người chưa thuộc tổ chức nào về màn hình Tổ chức */}
      <a href="#/" className="back">
        ← Quay lại
      </a>
      <h2>Cài đặt</h2>

      <div className="card">
        <h3>Tài khoản</h3>
        {user === undefined ? null : user ? (
          <>
            <p className="acct-name">{user.name}</p>
            <p>
              Tên đăng nhập:{' '}
              <code className="ucode" data-testid="settings-username">
                {accountUsername(user)}
              </code>
            </p>
            <p className="hint">
              {project === null
                ? 'Gửi tên này cho giám sát viên của tổ chức để được thêm vào.'
                : 'Giám sát viên hoặc Owner cần tên này nếu muốn thêm bạn vào tổ chức khác.'}
            </p>
          </>
        ) : (
          <p data-testid="settings-username">Chưa có, cần kết nối mạng một lần.</p>
        )}
      </div>

      {user && <ChangePasswordCard />}

      {storage && (
        <div className="card">
          <h3>Dung lượng</h3>
          <p data-testid="settings-storage">
            Đã dùng {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
          </p>
          {/* Chữ ở trên đã nói đủ con số, thanh chỉ để nhìn nên trình đọc màn hình bỏ qua */}
          {percent !== null && (
            <div className="bar" aria-hidden="true" data-testid="storage-bar">
              <i style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Cài lên màn hình chính</h3>
        <div className="install" data-testid="settings-install">
          {isInstalled() ? (
            <p className="ok-line">
              <Icon name="synced" />
              Đã cài lên màn hình chính.
            </p>
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
      </div>

      <div className="card">
        {/* Nút khoá thì trình đọc màn hình đọc luôn lý do khi tới nút, không phải dò xuống dòng dưới (audit C4) */}
        <button
          className="danger-outline wide"
          data-testid="logout-button"
          onClick={() => setConfirmingLogout(true)}
          disabled={busy || blocked === undefined || blocked.length > 0}
          aria-describedby={blocked && blocked.length > 0 ? blockedId : undefined}
        >
          Đăng xuất
        </button>
        {/* Ngay dưới nút để thấy vì sao nút khoá (ui.md màn hình 8) */}
        {blocked && blocked.length > 0 && (
          <p className="warning" id={blockedId} data-testid="logout-blocked">
            {blockedMessage(blocked)}
          </p>
        )}
        {error && (
          <p className="warning" role="alert">
            ⚠ {error}
          </p>
        )}
      </div>
      {confirmingLogout && (
        <ConfirmDialog
          message="Đăng xuất khỏi máy này? Đăng nhập lại cần có mạng."
          confirmLabel="Đăng xuất"
          onConfirm={() => void onLogout()}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}
    </section>
  );
}

const EMPTY_PASSWORDS: ChangePasswordInput = { currentPassword: '', newPassword: '', newPassword2: '' };

/**
 * Đổi mật khẩu (design §4.7, ui.md màn hình 8). Ba ô chỉ hiện khi bấm [Đổi mật khẩu…]: trang Cài đặt mở
 * thường xuyên, để sẵn ô mật khẩu thì trình duyệt tự điền và trang rối (Dương chốt 2026-10-26).
 */
function ChangePasswordCard() {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(EMPTY_PASSWORDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const offlineId = useId();

  useEffect(() => {
    if (open) firstRef.current?.focus();
  }, [open]);

  // Huỷ, đổi xong đều xoá chữ đã gõ: không để mật khẩu nằm lại trong ô khi mở lại
  function close() {
    setOpen(false);
    setInput(EMPTY_PASSWORDS);
    setError(null);
    toggleRef.current?.focus();
  }

  function edit(key: keyof ChangePasswordInput, value: string) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = changePasswordError(input);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      const r = await changePassword({ currentPassword: input.currentPassword, newPassword: input.newPassword });
      if (!r.ok) return setError(changePasswordErrorText(r.error));
      close();
      setDone(true);
    } catch (err) {
      const failure = apiFailure(err);
      if (!failure) throw err;
      setError(apiFailureText(failure, CHANGE_PASSWORD_OFFLINE_MSG));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof ChangePasswordInput, label: string, autoComplete: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        ref={key === 'currentPassword' ? firstRef : undefined}
        type="password"
        autoComplete={autoComplete}
        value={input[key]}
        onChange={(e) => edit(key, e.target.value)}
      />
    </label>
  );

  return (
    <div className="card">
      <h3>Đổi mật khẩu</h3>
      <button
        ref={toggleRef}
        className="wide"
        aria-expanded={open}
        aria-controls={open ? formId : undefined}
        onClick={() => {
          // Không khoá nút bằng disabled: đổi xong con trỏ quay về nút này ngay, lúc đó busy chưa kịp tắt
          if (busy) return;
          if (open) return close();
          setDone(false);
          setOpen(true);
        }}
      >
        Đổi mật khẩu…
      </button>
      {/* Vùng status luôn có, chỉ đổi chữ: vùng chèn vào cùng lúc với chữ thì có máy bỏ qua (như màn hình 9) */}
      <p className="visually-hidden" role="status">
        {done ? CHANGE_PASSWORD_DONE_MSG : ''}
      </p>
      {done && (
        <p className="ok-line" data-testid="change-password-done">
          <Icon name="synced" />
          {CHANGE_PASSWORD_DONE_MSG}
        </p>
      )}
      {open && (
        <form id={formId} className="form" noValidate onSubmit={(e) => void submit(e)}>
          {field('currentPassword', 'Mật khẩu hiện tại', 'current-password')}
          {field('newPassword', 'Mật khẩu mới', 'new-password')}
          {field('newPassword2', 'Nhập lại mật khẩu mới', 'new-password')}
          <div className="actions">
            <button
              type="submit"
              className="primary"
              disabled={busy || !online}
              aria-busy={busy}
              aria-describedby={online ? undefined : offlineId}
            >
              Đổi mật khẩu
            </button>
            <button type="button" className="soft" onClick={close} disabled={busy}>
              Huỷ
            </button>
          </div>
          <BusyNote busy={busy} text="Đang đổi mật khẩu…" />
          {!online && (
            <p className="hint" id={offlineId} data-testid="change-password-offline">
              {CHANGE_PASSWORD_OFFLINE_MSG}
            </p>
          )}
          {error && (
            <p className="field-error" role="alert" data-testid="change-password-error">
              ⚠ {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
