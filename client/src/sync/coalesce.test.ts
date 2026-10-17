import { describe, expect, it, vi } from 'vitest';
import { coalesce } from './coalesce';

/** Tác vụ mà test tự quyết lúc nào xong hay lỗi. */
function controlled() {
  const pending: { resolve: () => void; reject: (e: Error) => void }[] = [];
  const run = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  );
  /** Cho các microtask chạy hết để vòng kế tiếp (nếu có) kịp bắt đầu */
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { run, pending, settle };
}

describe('coalesce', () => {
  it('gọi một lần thì chạy một vòng', async () => {
    const { run, pending, settle } = controlled();
    const call = coalesce(run);
    const p = call();
    pending[0]?.resolve();
    await p;
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gọi nhiều lần lúc đang chạy thì thêm đúng một vòng, promise xong sau vòng thêm', async () => {
    const { run, pending, settle } = controlled();
    const call = coalesce(run);
    const first = call();
    const second = call();
    call();
    call();
    expect(second).toBe(first);

    let done = false;
    void second.then(() => (done = true));
    pending[0]?.resolve();
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
    expect(done).toBe(false);

    pending[1]?.resolve();
    await second;
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gọi sau khi đã xong thì chạy vòng mới', async () => {
    const { run, pending, settle } = controlled();
    const call = coalesce(run);
    const p1 = call();
    pending[0]?.resolve();
    await p1;
    const p2 = call();
    expect(p2).not.toBe(p1);
    pending[1]?.resolve();
    await p2;
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gọi lúc đang chạy vòng thêm thì có thêm một vòng nữa', async () => {
    const { run, pending, settle } = controlled();
    const call = coalesce(run);
    const p = call();
    call();
    pending[0]?.resolve();
    await settle();
    call();
    pending[1]?.resolve();
    await settle();
    pending[2]?.resolve();
    await p;
    await settle();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('vòng lỗi mà đã có yêu cầu chạy thêm thì vẫn chạy vòng thêm, kết quả theo vòng thêm', async () => {
    const { run, pending, settle } = controlled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const call = coalesce(run);
    const p = call();
    call();
    pending[0]?.reject(new Error('mạng lỗi'));
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
    pending[1]?.resolve();
    await expect(p).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('vòng lỗi mà không có yêu cầu chạy thêm thì ném lỗi; lần gọi sau chạy bình thường', async () => {
    const { run, pending } = controlled();
    const call = coalesce(run);
    const p = call();
    pending[0]?.reject(new Error('mạng lỗi'));
    await expect(p).rejects.toThrow('mạng lỗi');

    const next = call();
    expect(run).toHaveBeenCalledTimes(2);
    pending[1]?.resolve();
    await expect(next).resolves.toBeUndefined();
  });
});
