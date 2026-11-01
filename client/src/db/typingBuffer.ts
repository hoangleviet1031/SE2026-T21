import type { TypingBuffer } from '../typingBuffer';
import type { ProjectDb } from './projectDb';

// Bộ đệm chữ đang gõ nằm trong bảng `meta` của CSDL dự án, khoá `typing:<recordId>` (design §4.2): không đổi
// schema, Đăng xuất hay "Xoá khỏi máy" xoá CSDL thì mất theo. Mỗi lần ghi là một transaction riêng, không
// nằm chung với lưu phiếu hay vòng pull.

const PREFIX = 'typing:';
const key = (recordId: string) => `${PREFIX}${recordId}`;

export async function getTypingBuffer(db: ProjectDb, recordId: string): Promise<TypingBuffer | undefined> {
  return (await db.meta.get(key(recordId)))?.value as TypingBuffer | undefined;
}

/** Mọi bộ đệm của dự án, cho dải "Phiếu đang nhập dở" ở trang chủ */
export async function listTypingBuffers(db: ProjectDb): Promise<{ recordId: string; buffer: TypingBuffer }[]> {
  const rows = await db.meta.where('key').startsWith(PREFIX).toArray();
  return rows.map((r) => ({ recordId: r.key.slice(PREFIX.length), buffer: r.value as TypingBuffer }));
}

export async function putTypingBuffer(db: ProjectDb, recordId: string, buffer: TypingBuffer): Promise<void> {
  await db.meta.put({ key: key(recordId), value: buffer });
}

export async function deleteTypingBuffer(db: ProjectDb, recordId: string): Promise<void> {
  await db.meta.delete(key(recordId));
}

// Trang điền phiếu đăng ký hàm ghi ngay phần đang chờ; dải "Có phiên bản mới" gọi trước khi tải lại, vì lúc
// trang đang tắt thì không chắc kịp ghi (ui.md "Dải cập nhật app").
let pendingFlush: (() => Promise<void>) | null = null;

export function setTypingFlush(flush: (() => Promise<void>) | null): void {
  pendingFlush = flush;
}

export async function flushTyping(): Promise<void> {
  await pendingFlush?.();
}
