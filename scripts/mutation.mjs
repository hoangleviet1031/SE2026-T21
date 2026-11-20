// Thử đột biến tay cho phần lõi (docs/mutation.md): mỗi lần sửa một chỗ trong code, chạy unit test của
// chỗ đó, rồi trả file về như cũ. Test đỏ = đột biến bị bắt (KILLED); test vẫn xanh = test chưa đủ chặt
// (SURVIVED). Không dùng thư viện đột biến (Stryker) để khỏi thêm phụ thuộc (CLAUDE.md).
//
// Chạy từ gốc repo, working tree sạch ở các file bị đột biến:
//   node scripts/mutation.mjs              # mọi đột biến
//   node scripts/mutation.mjs M3,M7        # chỉ vài mã
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const MERGE = 'shared/src/merge.ts';
const BACKOFF = 'shared/src/backoff.ts';
const UPLOAD = 'client/src/sync/attachmentRules.ts';

// Mỗi file nguồn chạy với test của nó (workspace, file test)
const TESTS = {
  [MERGE]: ['shared', 'src/merge.test.ts'],
  [BACKOFF]: ['shared', 'src/merge.test.ts'],
  [UPLOAD]: ['client', 'src/sync/attachmentRules.test.ts'],
};

// [mã, file, chuỗi gốc, chuỗi đột biến, mô tả]
const MUTATIONS = [
  // threeWayMerge, valuesEqual (ADR 0001)
  ['M1', MERGE, 'if (a == null || b == null) return a == b;', 'if (a == null || b == null) return false;', 'null và undefined không còn coi là bằng nhau'],
  ['M2', MERGE, 'if (a.length !== b.length) return false;', '', 'Bỏ so độ dài mảng: [x] bằng [x, y]'],
  ['M3', MERGE, 'const sa = [...a].sort();\n    const sb = [...b].sort();', 'const sa = [...a];\n    const sb = [...b];', 'Mảng so theo thứ tự (multiselect đổi thứ tự thành xung đột)'],
  ['M4', MERGE, 'return JSON.stringify(a) === JSON.stringify(b);', 'return true;', 'Mọi object (GPS) coi là bằng nhau'],
  ['M5', MERGE, "if (!valuesEqual(l, b)) autoResolved.push({ field, takenFrom: 'both' });", "if (valuesEqual(l, b)) autoResolved.push({ field, takenFrom: 'both' });", 'Hai bên sửa giống nhau không ghi autoResolved'],
  ['M6', MERGE, 'value = r; // chỉ server sửa', 'value = l; // chỉ server sửa', 'Chỉ server sửa mà lấy giá trị client'],
  ['M7', MERGE, 'value = l; // chỉ client sửa', 'value = r; // chỉ client sửa', 'Chỉ client sửa mà lấy giá trị server'],
  ['M8', MERGE, 'value = r; // tạm giữ giá trị server', 'value = l; // tạm giữ giá trị server', 'Xung đột tạm giữ giá trị client'],
  ['M9', MERGE, 'if (value !== undefined) merged[field] = value;', 'merged[field] = value;', 'Trường bị xoá vẫn nằm trong merged (undefined)'],
  ['M10', MERGE, "autoResolved.push({ field, takenFrom: 'remote' });", "autoResolved.push({ field, takenFrom: 'local' });", 'Ghi sai bên thắng khi chỉ server sửa'],
  ['M11', MERGE, "? 'local-deleted-remote-edited' : 'none';", "? 'none' : 'local-deleted-remote-edited';", 'Xoá ở máy, server sửa: đảo kết quả'],
  ['M12', MERGE, "? 'local-edited-remote-deleted' : 'none';", "? 'none' : 'local-edited-remote-deleted';", 'Sửa ở máy, server xoá: đảo kết quả'],
  ['M13', MERGE, 'if (local.deleted && !remote.deleted) {', 'if (local.deleted) {', 'Hai bên cùng xoá cũng coi là xoá vs sửa'],
  // nextRetryDelay
  ['M14', BACKOFF, 'Math.min(BACKOFF_MAX_MS,', 'Math.max(BACKOFF_MAX_MS,', 'Trần backoff thành sàn'],
  ['M15', BACKOFF, 'return Math.round(exp / 2 + random() * (exp / 2));', 'return Math.round(random() * exp);', 'Jitter từ 0: có thể thử lại ngay lập tức'],
  ['M16', BACKOFF, 'BACKOFF_BASE_MS * 2 ** attempts', 'BACKOFF_BASE_MS * 2 ** (attempts + 1)', 'Lần thử đầu chờ gấp đôi'],
  ['M17', BACKOFF, 'export const BACKOFF_MAX_MS = 5 * 60_000;', 'export const BACKOFF_MAX_MS = 50 * 60_000;', 'Trần 50 phút thay vì 5 phút'],
  // classifyUploadError, isLiveAttachment, isUploadable (design §5.6)
  ['M18', UPLOAD, 'status === 408 || status === 429 || status >= 500', 'status === 429 || status >= 500', '408 thành lỗi hỏng hẳn thay vì thử lại'],
  ['M19', UPLOAD, 'status === 408 || status === 429 || status >= 500', 'status === 408 || status >= 500', '429 thành lỗi hỏng hẳn thay vì thử lại'],
  ['M20', UPLOAD, 'status === 408 || status === 429 || status >= 500', 'status === 408 || status === 429 || status > 500', '500 thành lỗi hỏng hẳn'],
  ['M21', UPLOAD, "if (status === 409 && code === 'missing_chunks')", 'if (status === 409)', 'Mọi 409 đều gửi lại phần thiếu'],
  ['M22', UPLOAD, 'checksumFailures === 0 ?', 'checksumFailures <= 1 ?', 'Sai checksum lần hai vẫn gửi lại từ đầu'],
  ['M23', UPLOAD, 'record.baseVersion > 0 &&', 'record.baseVersion >= 0 &&', 'Upload ảnh khi phiếu chưa có trên server'],
  ['M24', UPLOAD, '!record.deleted &&', '', 'Ảnh của phiếu đã xoá vẫn coi là còn sống'],
  ['M25', UPLOAD, 'record.id === attachment.recordId &&', '', 'Ảnh của phiếu khác vẫn coi là còn sống'],
];

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const results = [];
for (const [id, file, from, to, desc] of MUTATIONS) {
  if (only && !only.has(id)) continue;
  const original = readFileSync(file, 'utf8');
  const normalized = original.replace(/\r\n/g, '\n');
  if (!normalized.includes(from)) throw new Error(`${id}: không thấy chuỗi gốc trong ${file}`);
  writeFileSync(file, normalized.replace(from, to));
  let run;
  try {
    const [workspace, testFile] = TESTS[file];
    // Một chuỗi lệnh qua shell (cần cho npx trên Windows); testFile là hằng trong file này
    run = spawnSync(`npx vitest run ${testFile} --reporter=dot`, {
      cwd: workspace,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, NO_COLOR: '1' },
    });
  } finally {
    writeFileSync(file, original);
  }
  const out = `${run.stdout}${run.stderr}`;
  const summary = /Tests\s+(.+)/.exec(out)?.[1]?.trim() ?? '?';
  const status = run.status === 0 ? 'SURVIVED' : 'KILLED';
  results.push({ id, status });
  console.log(`${id}\t${status}\t${summary}\t${file}\t${desc}`);
}
const killed = results.filter((r) => r.status === 'KILLED').length;
console.log(`\nBắt được ${killed}/${results.length} đột biến`);
