import type { RecordData } from '@field-survey/shared';
import type { LocalAttachment, SyncState } from '../db/projectDb';
import { isLiveAttachment } from './attachmentRules';

// Nhãn trạng thái hiển thị của phiếu, tách khỏi syncState (design §5.1, §5.6). Hàm thuần, dùng
// chung cho danh sách phiếu và trang điền phiếu (ui.md màn hình 4).

export const SYNC_STATE_LABEL: Record<SyncState, string> = {
  draft: 'Nháp',
  synced: 'Đã đồng bộ',
  pending: 'Chờ đồng bộ',
  conflict: 'Cần xử lý xung đột',
  error: 'Lỗi',
};

export type DisplayKind = SyncState | 'uploading' | 'photo-error';

export interface DisplayState {
  kind: DisplayKind;
  label: string;
  /** Ảnh lỗi còn trong phiếu: hiện nút "Thử lại" / "Bỏ ảnh này" kể cả khi phiếu chưa đồng bộ. */
  failedPhotoIds: string[];
}

export function displayState(
  record: { id: string; syncState: SyncState; data: RecordData; deleted: boolean },
  attachments: Pick<LocalAttachment, 'id' | 'recordId' | 'uploadState'>[],
): DisplayState {
  const live = attachments.filter((a) => isLiveAttachment(record, a));
  const failedPhotoIds = live.filter((a) => a.uploadState === 'failed').map((a) => a.id);
  // Phiếu chưa đồng bộ thì nhãn theo phiếu: người dùng cần biết phiếu đã lên chưa trước tiên.
  if (record.syncState !== 'synced') {
    return { kind: record.syncState, label: SYNC_STATE_LABEL[record.syncState], failedPhotoIds };
  }
  if (failedPhotoIds.length > 0) return { kind: 'photo-error', label: 'Lỗi ảnh', failedPhotoIds };
  const notDone = live.filter((a) => a.uploadState !== 'done').length;
  if (notDone > 0) return { kind: 'uploading', label: `Đang tải ảnh (${notDone})`, failedPhotoIds };
  return { kind: 'synced', label: SYNC_STATE_LABEL.synced, failedPhotoIds };
}
