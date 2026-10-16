import { describe, expect, it } from 'vitest';
import { classifyUploadError, isLiveAttachment, isUploadable, referencedIds } from './attachmentRules';

// Quy tắc hàng đợi ảnh (design §5.6, §5.7, ticket TV3-06).

describe('referencedIds', () => {
  it('lấy mọi chuỗi trong các trường dạng danh sách, bỏ qua giá trị khác', () => {
    const ids = referencedIds({
      housePhoto: ['a', 'b'],
      truoc: ['c'],
      householdName: 'a-khong-tinh',
      members: 3,
      location: { lat: 1, lng: 2 },
      empty: null,
    });
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('isLiveAttachment', () => {
  const rec = { id: 'r1', deleted: false, data: { housePhoto: ['a'] } };
  it('ảnh còn trong phiếu chưa xoá thì còn sống', () => {
    expect(isLiveAttachment(rec, { id: 'a', recordId: 'r1' })).toBe(true);
  });
  it('ảnh đã bỏ khỏi phiếu, phiếu đã xoá, phiếu khác hoặc không có phiếu thì không', () => {
    expect(isLiveAttachment(rec, { id: 'b', recordId: 'r1' })).toBe(false);
    expect(isLiveAttachment({ ...rec, deleted: true }, { id: 'a', recordId: 'r1' })).toBe(false);
    expect(isLiveAttachment(rec, { id: 'a', recordId: 'r2' })).toBe(false);
    expect(isLiveAttachment(undefined, { id: 'a', recordId: 'r1' })).toBe(false);
  });
});

describe('isUploadable', () => {
  const rec = { id: 'r1', deleted: false, baseVersion: 1, data: { housePhoto: ['a'] } };
  it('chỉ ảnh còn sống của phiếu đã có trên server (baseVersion > 0)', () => {
    expect(isUploadable(rec, { id: 'a', recordId: 'r1' })).toBe(true);
    expect(isUploadable({ ...rec, baseVersion: 0 }, { id: 'a', recordId: 'r1' })).toBe(false);
    expect(isUploadable({ ...rec, deleted: true }, { id: 'a', recordId: 'r1' })).toBe(false);
    expect(isUploadable(rec, { id: 'b', recordId: 'r1' })).toBe(false);
  });
});

describe('classifyUploadError', () => {
  it('lỗi tạm thời thì thử lại theo backoff', () => {
    for (const status of [408, 429, 500, 502, 503]) expect(classifyUploadError(status, undefined, 0)).toEqual({ kind: 'retry' });
  });

  it('thiếu chunk thì hỏi lại status và gửi bù', () => {
    expect(classifyUploadError(409, 'missing_chunks', 0)).toEqual({ kind: 'resync' });
  });

  it('sai SHA-256 lần đầu gửi lại từ đầu, lần hai thì failed', () => {
    expect(classifyUploadError(422, 'checksum_mismatch', 0)).toEqual({ kind: 'restart' });
    expect(classifyUploadError(422, 'checksum_mismatch', 1)).toMatchObject({ kind: 'failed' });
  });

  it('413, 415 và 4xx khác là lỗi không thử lại được, có câu cho người dùng', () => {
    expect(classifyUploadError(413, 'payload_too_large', 0)).toEqual({ kind: 'failed', message: 'Ảnh quá lớn (tối đa 10 MB)' });
    expect(classifyUploadError(415, 'unsupported_media_type', 0)).toEqual({
      kind: 'failed',
      message: 'Tệp không phải ảnh JPEG, PNG hoặc WebP',
    });
    expect(classifyUploadError(404, 'not_found', 0)).toMatchObject({ kind: 'failed' });
    expect(classifyUploadError(400, 'invalid_body', 0)).toMatchObject({ kind: 'failed' });
  });
});
