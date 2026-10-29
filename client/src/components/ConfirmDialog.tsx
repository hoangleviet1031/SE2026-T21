import { useEffect, useId, useRef, useState } from 'react';

// Hộp xác nhận trong app thay cho confirm() của trình duyệt (design §5.7). Dùng <dialog> có sẵn:
// showModal() khoá phần trang phía sau và giữ focus trong hộp, không cần thêm thư viện.
// Chỉ render khi cần hỏi; đóng hộp = component cha bỏ render.

export function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Nút xác nhận màu đỏ cho việc mất dữ liệu/quyền; `false` cho việc không mất gì (Tải lại, Đổi vai trò) */
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const messageId = useId();
  // Hộp bị gỡ chứ không close() nên trình duyệt không trả con trỏ về nút đã mở hộp (tech-debt N18).
  // Chỉ Huỷ/Esc mới trả: bấm xác nhận thì mỗi màn tự lo (vd. trang quản trị về dòng kết quả), design §4.7.
  const cancelled = useRef(false);
  // Nhớ lúc render đầu, trước showModal: StrictMode chạy effect hai lần, lần sau con trỏ đã ở trong hộp
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    ref.current?.showModal();
    return () => {
      if (cancelled.current && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  const cancel = () => {
    cancelled.current = true;
    onCancel();
  };

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={messageId}
      // Esc: trình duyệt tự đóng hộp, nhưng cha mới là nơi quyết định đóng nên chặn lại và báo Huỷ
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <p id={messageId}>{message}</p>
      {/* Huỷ đứng trước để nhận focus đầu tiên: lỡ bấm Enter thì không mất gì */}
      <div className="actions">
        <button className="soft" onClick={cancel}>
          Huỷ
        </button>
        <button className={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
