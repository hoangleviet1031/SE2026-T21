import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// Lưu ảnh trên đĩa: uploads/<projectId>/<id>/<i>.part khi đang tải lên, ghép xong thành
// uploads/<projectId>/<id>/file. Xem docs/design.md §4.4, §5.6, §9 (Upload).

export const MAX_CHUNK_BYTES = 256 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 40 × 256 KB = 10 MB: chỉ số chunk từ 40 trở lên chắc chắn vượt giới hạn ảnh. */
export const MAX_CHUNKS = MAX_IMAGE_BYTES / MAX_CHUNK_BYTES;
export const STALE_CHUNK_MS = 7 * 24 * 60 * 60 * 1000;

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export const IMAGE_TYPES: readonly ImageType[] = ['image/jpeg', 'image/png', 'image/webp'];

const FINAL_FILE = 'file';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id ảnh do client tạo là UUID. Chỉ id qua được hàm này mới được ghép vào đường dẫn file. */
export function isAttachmentId(id: string): boolean {
  return UUID.test(id);
}

/** Nhận loại ảnh theo magic bytes, không tin Content-Type hay mimeType client khai. */
export function detectImageType(buf: Buffer): ImageType | undefined {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return undefined;
}

export interface UploadStore {
  listChunks(projectId: string, id: string): number[];
  /** `false` nếu chunk đã có: giữ bản cũ, không ghi lại (PUT chunk idempotent, §4.4). */
  writeChunk(projectId: string, id: string, index: number, data: Buffer): boolean;
  readChunks(projectId: string, id: string, total: number): Buffer;
  saveFile(projectId: string, id: string, data: Buffer): void;
  readFile(projectId: string, id: string): Buffer;
  removeChunks(projectId: string, id: string): void;
}

export function createUploadStore(rootDir: string): UploadStore {
  const root = resolve(rootDir);

  function dirOf(projectId: string, id: string): string {
    // Lớp chặn thứ hai sau isAttachmentId: đường dẫn cuối cùng phải nằm trong thư mục upload.
    if (!isAttachmentId(id)) throw new Error(`id ảnh không hợp lệ: ${id}`);
    const dir = resolve(root, projectId, id);
    if (!dir.startsWith(root + sep)) throw new Error(`đường dẫn ảnh ra ngoài thư mục upload: ${dir}`);
    return dir;
  }

  const chunkPath = (projectId: string, id: string, i: number) => join(dirOf(projectId, id), `${i}.part`);

  return {
    listChunks(projectId, id) {
      const dir = dirOf(projectId, id);
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .map((name) => /^(\d+)\.part$/.exec(name)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(Number)
        .sort((a, b) => a - b);
    },

    writeChunk(projectId, id, index, data) {
      mkdirSync(dirOf(projectId, id), { recursive: true });
      try {
        // 'wx': không ghi đè chunk đã có, kể cả khi hai request cùng chunk tới gần như cùng lúc.
        writeFileSync(chunkPath(projectId, id, index), data, { flag: 'wx' });
        return true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
        throw e;
      }
    },

    readChunks(projectId, id, total) {
      const parts: Buffer[] = [];
      for (let i = 0; i < total; i++) parts.push(readFileSync(chunkPath(projectId, id, i)));
      return Buffer.concat(parts);
    },

    saveFile(projectId, id, data) {
      writeFileSync(join(dirOf(projectId, id), FINAL_FILE), data);
    },

    readFile(projectId, id) {
      return readFileSync(join(dirOf(projectId, id), FINAL_FILE));
    },

    removeChunks(projectId, id) {
      const dir = dirOf(projectId, id);
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) if (name.endsWith('.part')) rmSync(join(dir, name));
      // Không còn gì (ảnh bị từ chối, chưa có file ghép) thì bỏ luôn thư mục.
      if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
    },
  };
}

/**
 * Xoá thư mục ảnh chưa ghép xong mà chunk mới nhất cũ hơn `maxAgeMs` (§5.6). Thư mục đã có file
 * ghép thì giữ nguyên: record_history có thể còn tham chiếu ảnh. Trả số thư mục đã xoá.
 */
export function cleanupStaleChunks(rootDir: string, now: Date, maxAgeMs = STALE_CHUNK_MS): number {
  const root = resolve(rootDir);
  if (!existsSync(root)) return 0;
  let removed = 0;
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const projectDir = join(root, project.name);
    for (const upload of readdirSync(projectDir, { withFileTypes: true })) {
      if (!upload.isDirectory()) continue;
      const dir = join(projectDir, upload.name);
      const names = readdirSync(dir);
      if (names.includes(FINAL_FILE)) continue;
      const newest = Math.max(0, ...names.map((n) => statSync(join(dir, n)).mtimeMs));
      if (now.getTime() - newest > maxAgeMs) {
        rmSync(dir, { recursive: true });
        removed++;
      }
    }
  }
  return removed;
}
