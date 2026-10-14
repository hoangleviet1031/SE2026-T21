import { describe, expect, it } from 'vitest';
import { missingFeatures, type BrowserEnv } from './browserSupport';

function fullEnv(): BrowserEnv {
  return {
    navigator: { serviceWorker: {}, locks: {} },
    indexedDB: {},
    crypto: { randomUUID: () => 'x', subtle: {} },
  };
}

describe('missingFeatures', () => {
  it('đủ API thì không thiếu gì', () => {
    expect(missingFeatures(fullEnv())).toEqual([]);
  });

  it.each<[string, (env: BrowserEnv) => void]>([
    ['Service Worker', (env) => delete env.navigator.serviceWorker],
    ['IndexedDB', (env) => (env.indexedDB = null)],
    ['crypto.randomUUID', (env) => delete env.crypto?.randomUUID],
    ['Web Locks', (env) => delete env.navigator.locks],
    ['crypto.subtle', (env) => delete env.crypto?.subtle],
  ])('thiếu %s', (name, remove) => {
    const env = fullEnv();
    remove(env);
    expect(missingFeatures(env)).toEqual([name]);
  });

  it('trang HTTP thường (không phải localhost): thiếu cả SW lẫn crypto.subtle, theo thứ tự design §11.1', () => {
    const env = fullEnv();
    delete env.navigator.serviceWorker;
    delete env.crypto?.subtle;
    expect(missingFeatures(env)).toEqual(['Service Worker', 'crypto.subtle']);
  });

  it('không có cả đối tượng crypto', () => {
    expect(missingFeatures({ ...fullEnv(), crypto: undefined })).toEqual(['crypto.randomUUID', 'crypto.subtle']);
  });
});
