import { describe, expect, it } from 'vitest';
import type { RecordData } from '@field-survey/shared';
import { displayState } from './displayState';
import type { SyncState } from '../db/projectDb';

// Nhãn hiển thị của phiếu (design §5.1, §5.6): "Đã đồng bộ" chỉ khi phiếu đã đồng bộ VÀ mọi ảnh
// còn trong phiếu đã lên server.

type UploadState = 'pending' | 'uploading' | 'done' | 'failed';

const record = (syncState: SyncState, data: RecordData = {}, deleted = false) => ({ id: 'r1', syncState, data, deleted });
const photo = (id: string, uploadState: UploadState, recordId = 'r1') => ({ id, recordId, uploadState });

describe('displayState', () => {
  it('phiếu chưa đồng bộ: nhãn theo syncState, kể cả khi có ảnh chưa lên', () => {
    const data = { housePhoto: ['a'] };
    const photos = [photo('a', 'pending')];
    expect(displayState(record('draft', data), photos).label).toBe('Nháp');
    expect(displayState(record('pending', data), photos).label).toBe('Chờ đồng bộ');
    expect(displayState(record('error', data), photos).label).toBe('Lỗi');
    expect(displayState(record('conflict', data), photos).label).toBe('Cần xử lý xung đột');
  });

  it('đã đồng bộ, không có ảnh hoặc mọi ảnh xong: "Đã đồng bộ"', () => {
    expect(displayState(record('synced'), [])).toEqual({ kind: 'synced', label: 'Đã đồng bộ', failedPhotoIds: [] });
    const data = { housePhoto: ['a', 'b'] };
    expect(displayState(record('synced', data), [photo('a', 'done'), photo('b', 'done')]).label).toBe('Đã đồng bộ');
  });

  it('đã đồng bộ nhưng còn ảnh chưa lên: "Đang tải ảnh (n)", n đếm cả ảnh đang gửi', () => {
    const data = { housePhoto: ['a', 'b', 'c'] };
    const s = displayState(record('synced', data), [photo('a', 'pending'), photo('b', 'uploading'), photo('c', 'done')]);
    expect(s).toEqual({ kind: 'uploading', label: 'Đang tải ảnh (2)', failedPhotoIds: [] });
  });

  it('đã đồng bộ, có ảnh lỗi: "Lỗi ảnh" (ưu tiên hơn đang tải)', () => {
    const data = { housePhoto: ['a', 'b'] };
    const s = displayState(record('synced', data), [photo('a', 'failed'), photo('b', 'pending')]);
    expect(s).toEqual({ kind: 'photo-error', label: 'Lỗi ảnh', failedPhotoIds: ['a'] });
  });

  it('ảnh lỗi vẫn được liệt kê khi phiếu chưa đồng bộ, để hiện nút Thử lại / Bỏ ảnh này', () => {
    const s = displayState(record('pending', { housePhoto: ['a'] }), [photo('a', 'failed')]);
    expect(s).toEqual({ kind: 'pending', label: 'Chờ đồng bộ', failedPhotoIds: ['a'] });
  });

  it('không tính ảnh đã bỏ khỏi phiếu, ảnh của phiếu khác, hay ảnh không còn trên máy', () => {
    const data = { housePhoto: ['a', 'mat'] };
    const photos = [photo('a', 'done'), photo('da-bo', 'failed'), photo('khac', 'pending', 'r2')];
    expect(displayState(record('synced', data), photos)).toEqual({ kind: 'synced', label: 'Đã đồng bộ', failedPhotoIds: [] });
  });

  it('ảnh nằm ở mọi trường dạng danh sách (nhiều trường ảnh)', () => {
    const data = { truoc: ['a'], sau: ['b'], assets: ['Tivi'] };
    const s = displayState(record('synced', data), [photo('a', 'done'), photo('b', 'pending')]);
    expect(s.label).toBe('Đang tải ảnh (1)');
  });
});
