import { useEffect, useRef, type Ref } from 'react';
import { Icon } from '../components/Icon';

export type NoticeValue = { kind: 'ok' | 'error'; text: string };

/** Dòng báo kết quả thao tác ở A1, A2: lỗi là alert (trình đọc màn hình đọc ngay), thành công là status */
export function Notice({ value, ref }: { value: NoticeValue | null; ref?: Ref<HTMLParagraphElement> }) {
  if (!value) return null;
  // tabIndex -1: nhận focus bằng code (useNoticeFocus) nhưng không thêm một điểm dừng Tab
  return value.kind === 'error' ? (
    <p className="result bad" role="alert" data-testid="admin-notice" tabIndex={-1} ref={ref}>
      ⚠ {value.text}
    </p>
  ) : (
    <p className="result ok" role="status" data-testid="admin-notice" tabIndex={-1} ref={ref}>
      <Icon name="synced" />
      {value.text}
    </p>
  );
}

/**
 * Thao tác xong mà focus rơi về body (dòng vừa duyệt biến mất, hàng mở rộng đóng, nút Mở thành Khoá) thì
 * đưa focus tới dòng kết quả, để người dùng bàn phím không phải Tab lại từ đầu trang. Chạy theo số lần
 * thao tác chứ không theo chữ, nên cùng một lỗi lặp lại vẫn nhận focus. Focus còn ở chỗ khác thì để yên.
 */
export function useNoticeFocus(finished: number) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (finished === 0) return;
    const active = document.activeElement;
    if (active === null || active === document.body) ref.current?.focus();
  }, [finished]);
  return ref;
}
