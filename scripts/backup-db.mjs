// Sao lưu CSDL SQLite bằng VACUUM INTO (design §12). Máy staging không cài sqlite3
// nên dùng node:sqlite có sẵn trong Node 22. Chạy được cả khi server đang mở CSDL (WAL).
//   node --no-warnings scripts/backup-db.mjs <file nguồn> <file đích>
// backup-daily.mjs gọi lại backupDb() để sao lưu hằng ngày cùng thư mục ảnh.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

/** Chép `src` sang `dst` (chưa có) rồi kiểm tra toàn vẹn bản sao; lỗi thì ném. */
export function backupDb(src, dst) {
  // VACUUM INTO báo lỗi nếu file đích đã có, nhưng kiểm trước để câu báo dễ hiểu hơn.
  if (existsSync(dst)) throw new Error(`File đích đã tồn tại: ${dst}`);

  const db = new DatabaseSync(src, { readOnly: true });
  try {
    db.prepare('VACUUM INTO ?').run(dst);
  } finally {
    db.close();
  }

  const copy = new DatabaseSync(dst, { readOnly: true });
  try {
    const { integrity_check: result } = copy.prepare('PRAGMA integrity_check').get();
    if (result !== 'ok') throw new Error(`Bản sao lưu hỏng: ${result}`);
  } finally {
    copy.close();
  }
}

// Chỉ chạy phần dòng lệnh khi gọi trực tiếp, không chạy khi file khác import.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) {
    console.error('Cách dùng: node scripts/backup-db.mjs <file nguồn> <file đích>');
    process.exit(1);
  }
  try {
    backupDb(src, dst);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  console.log(`Đã sao lưu ${src} → ${dst}`);
}
