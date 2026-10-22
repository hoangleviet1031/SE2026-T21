// Sao lưu hằng ngày CSDL và thư mục ảnh (design §12, TV3-13). Trên staging chạy bằng systemd
// timer, cách cài ở docs/deploy.md "Sao lưu và khôi phục".
//   node --no-warnings scripts/backup-daily.mjs <file CSDL> <thư mục ảnh> <thư mục đích>
// Mỗi lần tạo <đích>/<YYYYMMDD-HHMMSS>/ gồm survey.db và uploads/, giữ KEEP bản mới nhất.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupDb } from './backup-db.mjs';

const KEEP = 7;
// Tên file ảnh đã ghép xong trong uploads/<projectId>/<id>/ (server/src/uploads.ts).
const FINAL_FILE = 'file';
const BACKUP_NAME = /^\d{8}-\d{6}$/;
const TMP_NAME = /^\.\d{8}-\d{6}\.tmp$/;

const [dbFile, uploadDir, outDir] = process.argv.slice(2);
if (!dbFile || !uploadDir || !outDir) {
  console.error('Cách dùng: node scripts/backup-daily.mjs <file CSDL> <thư mục ảnh> <thư mục đích>');
  process.exit(1);
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Chép ảnh đã ghép xong, bỏ chunk `.part` đang tải dở. Trả số file đã chép.
 * Chạy sau backupDb: server ghi file ảnh trước rồi mới ghi dòng attachments
 * (routes/attachments.ts) và không xoá file đã ghép, nên mọi dòng trong bản sao CSDL đều có
 * file ở đây. File ghi sau lúc sao lưu CSDL có thể lọt vào nhưng không dòng nào trỏ tới, vô hại.
 */
function copyImages(src, dst) {
  mkdirSync(dst);
  // Chưa có ảnh nào thì server chưa tạo thư mục; bước kiểm tra vẫn bắt được nếu CSDL có ảnh.
  if (!existsSync(src)) return 0;
  let count = 0;
  for (const project of readdirSync(src, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const upload of readdirSync(join(src, project.name), { withFileTypes: true })) {
      if (!upload.isDirectory()) continue;
      const from = join(src, project.name, upload.name, FINAL_FILE);
      // Thư mục chưa có file ghép là ảnh tải dở, server có thể xoá nó bất cứ lúc nào.
      if (!existsSync(from)) continue;
      mkdirSync(join(dst, project.name, upload.name), { recursive: true });
      copyFileSync(from, join(dst, project.name, upload.name, FINAL_FILE), constants.COPYFILE_EXCL);
      count++;
    }
  }
  return count;
}

/** Mọi ảnh bản sao CSDL nhắc tới phải có trong bản sao ảnh, đúng cỡ và SHA-256. */
function verifyImages(backupDbFile, imagesDir) {
  const db = new DatabaseSync(backupDbFile, { readOnly: true });
  let rows;
  try {
    rows = db.prepare('SELECT project_id, id, size, sha256 FROM attachments').all();
  } finally {
    db.close();
  }
  const bad = [];
  for (const row of rows) {
    const file = join(imagesDir, row.project_id, row.id, FINAL_FILE);
    if (!existsSync(file)) {
      bad.push(`${row.project_id}/${row.id}: thiếu file`);
      continue;
    }
    const data = readFileSync(file);
    if (data.length !== row.size || createHash('sha256').update(data).digest('hex') !== row.sha256) {
      bad.push(`${row.project_id}/${row.id}: khác cỡ hoặc SHA-256`);
    }
  }
  if (bad.length > 0) throw new Error(`Bản sao lưu thiếu hoặc sai ${bad.length} ảnh:\n  ${bad.join('\n  ')}`);
  return rows.length;
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += statSync(join(entry.parentPath, entry.name)).size;
  }
  return total;
}

mkdirSync(outDir, { recursive: true });
// Thư mục tạm còn sót là lần chạy trước bị ngắt giữa chừng, chưa bao giờ là một bản sao lưu.
for (const name of readdirSync(outDir)) {
  if (TMP_NAME.test(name)) rmSync(join(outDir, name), { recursive: true, force: true });
}

const name = stamp(new Date());
const finalDir = join(outDir, name);
if (existsSync(finalDir)) {
  console.error(`Đã có bản sao lưu ${finalDir}`);
  process.exit(1);
}
// Làm trong thư mục tạm rồi mới đổi tên: bản hỏng giữa chừng không bao giờ được tính vào KEEP
// bản, nên không đẩy được bản tốt cũ ra khỏi vòng xoay.
const tmpDir = join(outDir, `.${name}.tmp`);
mkdirSync(tmpDir);
let images;
let copied;
try {
  backupDb(dbFile, join(tmpDir, 'survey.db'));
  copied = copyImages(uploadDir, join(tmpDir, 'uploads'));
  images = verifyImages(join(tmpDir, 'survey.db'), join(tmpDir, 'uploads'));
  renameSync(tmpDir, finalDir);
} catch (e) {
  rmSync(tmpDir, { recursive: true, force: true });
  console.error(`Sao lưu không thành, giữ nguyên các bản cũ. ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

const backups = readdirSync(outDir).filter((n) => BACKUP_NAME.test(n)).sort().reverse();
for (const old of backups.slice(KEEP)) rmSync(join(outDir, old), { recursive: true });

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(
  `Đã sao lưu ${dbFile} và ${uploadDir} → ${finalDir} (${images} ảnh trong CSDL, ${copied} file ảnh đã chép, ${mb(dirSize(finalDir))} MB); ` +
    `giữ ${Math.min(backups.length, KEEP)} bản`,
);
