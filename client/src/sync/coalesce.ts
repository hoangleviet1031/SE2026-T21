// Gộp các lần gọi chạy một tác vụ (vòng đồng bộ, design §5.3). Tách khỏi engine để unit test được.

/**
 * Trả hàm gọi chạy `run`. Đang rảnh thì chạy ngay. Gọi lúc đang chạy thì chạy thêm đúng một vòng
 * sau khi vòng hiện tại xong, vì vòng đang chạy có thể đã qua bước cần thấy thay đổi mới (vd. đã
 * gửi outbox trước khi người dùng bấm Lưu). Gọi nhiều lần trong lúc đó cũng chỉ thêm một vòng.
 * Promise trả về xong khi không còn vòng nào được yêu cầu.
 */
export function coalesce(run: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;

  async function loop(): Promise<void> {
    try {
      for (;;) {
        again = false;
        try {
          await run();
        } catch (err) {
          // Đã có yêu cầu chạy thêm: vòng sau làm lại đúng việc này, lỗi của nó mới là kết quả
          if (!again) throw err;
          console.warn('vòng đồng bộ lỗi, chạy lại theo yêu cầu mới', err);
        }
        if (!again) return;
      }
    } finally {
      running = null;
    }
  }

  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = loop();
    return running;
  };
}
