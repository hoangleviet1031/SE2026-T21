import { Icon } from '../components/Icon';

export type NoticeValue = { kind: 'ok' | 'error'; text: string };

/** Dòng báo kết quả thao tác ở A1, A2: lỗi là alert (trình đọc màn hình đọc ngay), thành công là status */
export function Notice({ value }: { value: NoticeValue | null }) {
  if (!value) return null;
  return value.kind === 'error' ? (
    <p className="result bad" role="alert" data-testid="admin-notice">
      ⚠ {value.text}
    </p>
  ) : (
    <p className="result ok" role="status" data-testid="admin-notice">
      <Icon name="synced" />
      {value.text}
    </p>
  );
}
