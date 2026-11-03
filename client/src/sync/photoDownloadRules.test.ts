import { describe, expect, it } from 'vitest';
import {
  blobWithin,
  classifyDownload,
  clearNetworkFailures,
  fetchFailureTexts,
  idsToFetch,
  isFetchPending,
  type PhotoFetchState,
} from './photoDownloadRules';

// Quy tắc tải ảnh về để xem (design §5.6, §8).

describe('classifyDownload', () => {
  it('200 với đúng ba loại ảnh server nhận lúc complete', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(classifyDownload(200, type)).toBe('ok');
  });

  it('200 mà không phải ảnh (captive portal trả HTML) là lỗi máy chủ, không lưu', () => {
    expect(classifyDownload(200, 'text/html')).toBe('server');
    expect(classifyDownload(200, '')).toBe('server');
    expect(classifyDownload(200, undefined)).toBe('server');
  });

  it('404 tách riêng; mọi mã còn lại là lỗi máy chủ', () => {
    expect(classifyDownload(404, undefined)).toBe('not_found');
    for (const status of [400, 403, 429, 500, 503]) expect(classifyDownload(status, undefined)).toBe('server');
  });
});

describe('idsToFetch', () => {
  it('chỉ lấy id chưa thử: liveQuery chạy lại không gọi thêm', () => {
    const states = new Map<string, PhotoFetchState>([
      ['loi', 'server'],
      ['dang', 'loading'],
    ]);
    expect(idsToFetch(['loi', 'dang', 'moi'], states)).toEqual(['moi']);
  });
});

describe('clearNetworkFailures', () => {
  it('chỉ bỏ lỗi mạng: 404, 5xx không tự thử lại', () => {
    const states = new Map<string, PhotoFetchState>([
      ['a', 'network'],
      ['b', 'not_found'],
      ['c', 'server'],
      ['d', 'loading'],
    ]);
    expect([...clearNetworkFailures(states).keys()]).toEqual(['b', 'c', 'd']);
  });
});

describe('fetchFailureTexts', () => {
  it('mỗi loại một dòng, thứ tự cố định dù ảnh lỗi theo thứ tự nào', () => {
    const states = new Map<string, PhotoFetchState>([
      ['a', 'server'],
      ['b', 'not_found'],
      ['c', 'not_found'],
    ]);
    expect(fetchFailureTexts(['a', 'b', 'c'], states)).toEqual(['Ảnh chưa được tải lên', 'Máy chủ đang lỗi, thử lại sau']);
  });

  it('ảnh đã có blob thì không còn báo; đang tải, phiên hết hạn, phiếu không còn thì không có câu', () => {
    const states = new Map<string, PhotoFetchState>([
      ['da-co', 'network'],
      ['dang', 'loading'],
      ['phien', 'auth'],
      ['mat', 'gone'],
    ]);
    expect(fetchFailureTexts(['dang', 'phien', 'mat'], states)).toEqual([]);
  });

  it('đủ câu theo design §8', () => {
    const states = new Map<string, PhotoFetchState>([
      ['a', 'network'],
      ['b', 'not_member'],
      ['c', 'storage_full'],
    ]);
    expect(fetchFailureTexts(['a', 'b', 'c'], states)).toEqual([
      'Cần kết nối để xem ảnh này',
      'Bạn không còn thuộc tổ chức này',
      'Bộ nhớ đầy: đồng bộ rồi dọn ảnh đã tải lên',
    ]);
  });
});

describe('isFetchPending', () => {
  it('còn chờ khi chưa có kết quả, hoặc đã lưu mà chưa thấy dòng mới', () => {
    for (const s of [undefined, 'loading', 'saved'] as const) expect(isFetchPending(s)).toBe(true);
    for (const s of ['network', 'gone', 'auth'] as const) expect(isFetchPending(s)).toBe(false);
  });
});

describe('blobWithin', () => {
  it('đọc xong trong hạn thì trả blob đúng loại', async () => {
    const blob = await blobWithin(new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/jpeg' } }), 1000);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(2);
  });

  it('thân treo thì báo lỗi khi hết hạn, không quay mãi', async () => {
    const stalled = new Response(new ReadableStream({ start() {} }));
    await expect(blobWithin(stalled, 10)).rejects.toThrow('quá hạn');
  });

  it('kết nối bị cắt giữa chừng thì báo lỗi', async () => {
    const cut = new Response(new ReadableStream({ start: (c) => c.error(new Error('đứt kết nối')) }));
    await expect(blobWithin(cut, 1000)).rejects.toThrow('đứt kết nối');
  });
});
