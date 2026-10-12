// Sao lưu CSDL SQLite bằng VACUUM INTO (design §12). Máy staging không cài sqlite3
// nên dùng node:sqlite có sẵn trong Node 22. Chạy được cả khi server đang mở CSDL (WAL).
//   node --no-warnings scripts/backup-db.mjs <file nguồn> <file đích>
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error('Cách dùng: node scripts/backup-db.mjs <file nguồn> <file đích>');
  process.exit(1);
}
// VACUUM INTO báo lỗi nếu file đích đã có, nhưng kiểm trước để câu báo dễ hiểu hơn.
if (existsSync(dst)) {
  console.error(`File đích đã tồn tại: ${dst}`);
  process.exit(1);
}

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
console.log(`Đã sao lưu ${src} → ${dst}`);
