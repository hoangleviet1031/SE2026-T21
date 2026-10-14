// Xin trình duyệt không tự xoá IndexedDB khi máy thiếu chỗ (design §4.2 "Chống bị xoá dữ liệu").
// Gọi sau mỗi lần lưu phiếu, kể cả nháp: đã được cấp thì không xin lại, nên thực tế chỉ xin ở lần
// lưu đầu (và lần sau nếu trình duyệt từ chối). iOS dưới 17 không có API này thì bỏ qua (§11.1).
export async function requestPersistentStorage(): Promise<void> {
  const storage = navigator.storage;
  if (!storage?.persist || !storage.persisted) return;
  if (await storage.persisted()) return;
  // Chrome tự quyết theo mức dùng (đã cài app thì thường được), không hỏi người dùng;
  // bị từ chối cũng không làm gì thêm, dung lượng vẫn xem được ở trang Cài đặt
  await storage.persist();
}
