import type { IconName } from './components/Icon';
import type { DisplayKind } from './sync/displayState';

/**
 * Biểu tượng trước nhãn trạng thái phiếu (ui.md "Hệ thống thiết kế"): vòng nét đứt = cần làm, đồng hồ
 * hoặc nửa vòng = đang chờ, tích = ổn, chấm than đỏ = gấp. Chữ luôn đi kèm, hình chỉ giúp nhìn nhanh.
 */
export function statusIcon(kind: DisplayKind): IconName {
  switch (kind) {
    case 'draft':
      return 'draft';
    case 'pending':
      return 'pending';
    case 'uploading':
      return 'upload';
    case 'synced':
      return 'synced';
    case 'conflict':
    case 'error':
    case 'photo-error':
      return 'alert';
  }
}
