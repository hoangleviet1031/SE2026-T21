import { useState } from 'react';
import { shareUsernameText } from '../accountDisplay';
import { Icon } from './Icon';

// [Sao chép] [Chia sẻ] dưới tên đăng nhập ở màn hình 8, 9 (design §4.7). Chỉ dùng API của trình duyệt,
// không gọi máy chủ nên offline vẫn bấm được.

const COPIED_MSG = 'Đã sao chép tên đăng nhập';
const COPY_FAILED_MSG = 'Không sao chép được. Hãy chọn tên đăng nhập rồi chép tay.';
const SHARE_FAILED_MSG = 'Không chia sẻ được. Hãy dùng nút Sao chép.';

export function UsernameActions({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setCopied(false);
    setError(null);
    try {
      // Chỉ chép đúng tên, người nhận dán thẳng vào ô thêm thành viên. Trang không chạy HTTPS thì
      // trình duyệt không có navigator.clipboard, lỗi rơi xuống cùng câu báo.
      await navigator.clipboard.writeText(username);
      setCopied(true);
    } catch {
      setError(COPY_FAILED_MSG);
    }
  }

  async function share() {
    setCopied(false);
    setError(null);
    try {
      await navigator.share({ text: shareUsernameText(username) });
    } catch (err) {
      // Người dùng tự đóng hộp chia sẻ của máy, không phải lỗi
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(SHARE_FAILED_MSG);
    }
  }

  return (
    <div className="uname-actions">
      <div className="uname-buttons">
        <button type="button" aria-label="Sao chép tên đăng nhập" onClick={() => void copy()}>
          Sao chép
        </button>
        {/* Nhiều trình duyệt máy tính không có navigator.share: ẩn nút, không để bấm rồi mới báo lỗi */}
        {typeof navigator.share === 'function' && (
          <button type="button" aria-label="Chia sẻ tên đăng nhập" onClick={() => void share()}>
            Chia sẻ
          </button>
        )}
      </div>
      {/* Vùng status luôn có, chỉ đổi chữ: vùng chèn vào cùng lúc với chữ thì có máy bỏ qua (như màn hình 9) */}
      <p className="visually-hidden" role="status">
        {copied ? COPIED_MSG : ''}
      </p>
      {copied && (
        <p className="ok-line" data-testid="username-copied">
          <Icon name="synced" />
          {COPIED_MSG}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert" data-testid="username-action-error">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
