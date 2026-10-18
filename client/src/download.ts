/** Tải một chuỗi JSON về máy thành file (Xuất JSON phiếu lỗi, design §8; dự án đã rời, §4.7). */
export function downloadJson(filename: string, json: string): void {
  downloadBlob(filename, new Blob([json], { type: 'application/json' }));
}

/** Tải một Blob về máy thành file (vd. file xuất CSV/JSON của form, design §4.6). */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Thu hồi ở lượt sau: một số trình duyệt (Safari) huỷ tải nếu URL bị thu hồi ngay sau click
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
