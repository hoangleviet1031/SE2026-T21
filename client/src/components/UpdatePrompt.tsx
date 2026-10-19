import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ConfirmDialog } from './ConfirmDialog';

// Dải "Có phiên bản mới" (design §4.3). SW mới chỉ thay bản cũ khi người dùng bấm Tải lại, để
// không tự reload lúc đang nhập phiếu.

// App đã cài thường mở cả ngày, trình duyệt chỉ tự kiểm bản mới khi điều hướng
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function UpdatePrompt() {
  const [confirming, setConfirming] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        if (!navigator.onLine) return;
        // Lỗi mạng giữa chừng: lần kiểm sau thử lại, không ảnh hưởng bản đang chạy
        registration.update().catch((e) => console.warn('không kiểm được bản mới', e));
      }, CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  const reload = () => {
    setConfirming(false);
    // Tự tải lại khi SW mới nắm trang: workbox-window chỉ tự làm việc này nếu trang được SW nắm
    // ngay từ lúc mở, còn trang được nắm bằng clientsClaim ở lần cài đầu thì không
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    void updateServiceWorker(true);
  };

  return (
    <div className="warning update-prompt" role="status" data-testid="update-prompt">
      <span>Có phiên bản mới</span>
      {/* Nội dung đang gõ ở trang nhập phiếu chỉ nằm trong state React, tải lại là mất: hỏi trước */}
      <button onClick={() => (location.hash.startsWith('#/fill/') ? setConfirming(true) : reload())}>Tải lại</button>
      {confirming && (
        <ConfirmDialog
          message="Phiếu đang nhập chưa lưu sẽ mất. Tải lại?"
          confirmLabel="Tải lại"
          danger={false}
          onConfirm={reload}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
