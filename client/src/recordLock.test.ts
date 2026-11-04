import { describe, expect, it } from 'vitest';
import type { SyncState } from './db/projectDb';
import { recordLock, saveWouldUndelete } from './recordLock';

// Màn hình 4: khi nào form khoá và vì sao (design §4.5, §5.7, ca O10).
describe('recordLock', () => {
  const rec = (over: { id?: string; deleted?: boolean; syncState?: SyncState } = {}) => ({
    id: 'r1',
    deleted: false,
    syncState: 'synced' as SyncState,
    ...over,
  });

  it('phiếu thường và phiếu mới chưa có trên máy thì sửa được', () => {
    expect(recordLock({ record: rec(), recordId: 'r1', seenRecordId: 'r1', inConflict: false })).toBe('editable');
    expect(recordLock({ record: undefined, recordId: 'r1', seenRecordId: undefined, inConflict: false })).toBe('editable');
  });

  it.each(['pending', 'synced', 'error'] as const)('phiếu đã xoá, trạng thái %s thì khoá vì đã xoá', (syncState) => {
    expect(recordLock({ record: rec({ deleted: true, syncState }), recordId: 'r1', seenRecordId: 'r1', inConflict: false })).toBe(
      'deleted',
    );
  });

  it('xung đột được ưu tiên hơn đã xoá: còn phải hỏi người dùng (ADR 0001 quy tắc 6)', () => {
    const deletedConflict = rec({ deleted: true, syncState: 'conflict' });
    expect(recordLock({ record: deletedConflict, recordId: 'r1', seenRecordId: 'r1', inConflict: false })).toBe('conflict');
    expect(recordLock({ record: rec({ syncState: 'conflict' }), recordId: 'r1', seenRecordId: 'r1', inConflict: false })).toBe(
      'conflict',
    );
    expect(recordLock({ record: rec(), recordId: 'r1', seenRecordId: 'r1', inConflict: true })).toBe('conflict');
  });

  it('phiếu đã thấy trên máy mà biến mất thì coi là đã xoá, không thành phiếu mới', () => {
    expect(recordLock({ record: undefined, recordId: 'r1', seenRecordId: 'r1', inConflict: false })).toBe('deleted');
  });

  it('đổi sang id khác: không lấy trạng thái của phiếu trước', () => {
    const previous = rec({ id: 'cu', deleted: true });
    expect(recordLock({ record: previous, recordId: 'r2', seenRecordId: 'cu', inConflict: false })).toBe('editable');
    expect(recordLock({ record: undefined, recordId: 'r2', seenRecordId: 'cu', inConflict: false })).toBe('editable');
  });
});

describe('saveWouldUndelete', () => {
  it('lưu không xoá lên phiếu đã xoá thì bị chặn', () => {
    expect(saveWouldUndelete({ deleted: true }, undefined)).toBe(true);
    expect(saveWouldUndelete({ deleted: true }, false)).toBe(true);
  });

  it('phiếu chưa xoá, chưa có, hoặc lưu giữ nguyên xoá thì không chặn', () => {
    expect(saveWouldUndelete({ deleted: false }, undefined)).toBe(false);
    expect(saveWouldUndelete(undefined, undefined)).toBe(false);
    expect(saveWouldUndelete({ deleted: true }, true)).toBe(false);
  });
});
