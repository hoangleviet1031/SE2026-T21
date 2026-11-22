// Luật ranh giới kiến trúc ở design §3.2 "Quy tắc phụ thuộc", kiểm bằng đọc mã nguồn thay vì
// chỉ dựa vào người review nhớ. Hàm thuần: nhận nội dung file theo đường dẫn, không đọc đĩa.
// Test đọc file thật ở architecture.test.ts.

/** Đường dẫn tính từ gốc repo, dấu `/`, ví dụ `client/src/pages/HomePage.tsx`. */
export type SourceFiles = ReadonlyMap<string, string>;

export interface ImportRef {
  spec: string;
  /** `import type` / `export type`: TypeScript xoá khi build, không kéo code vào lúc chạy. */
  typeOnly: boolean;
}

// Bỏ comment để chữ "fetch(" hay "import" trong comment không bị tính. `//` chỉ tính là comment
// khi đứng đầu dòng hoặc sau khoảng trắng, để không cắt nhầm 'https://…' trong chuỗi.
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+)\s+from\s+['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT = /^\s*import\s+['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

export function parseImports(source: string): ImportRef[] {
  const code = stripComments(source);
  const refs: ImportRef[] = [];
  for (const m of code.matchAll(STATIC_IMPORT)) refs.push({ spec: m[2] ?? '', typeOnly: m[1] !== undefined });
  for (const m of code.matchAll(SIDE_EFFECT_IMPORT)) refs.push({ spec: m[1] ?? '', typeOnly: false });
  for (const m of code.matchAll(DYNAMIC_IMPORT)) refs.push({ spec: m[1] ?? '', typeOnly: false });
  return refs;
}

/** Ghép đường dẫn tương đối theo kiểu posix, giữ `..` vượt ra ngoài để luật thấy được. */
export function joinPath(fromFile: string, spec: string): string {
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

/** File mà import trỏ tới; `null` nếu là gói npm. Không thấy file thì trả đường dẫn đã ghép. */
export function resolveImport(files: SourceFiles, fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = joinPath(fromFile, spec);
  for (const ext of EXTENSIONS) if (files.has(base + ext)) return base + ext;
  return base;
}

export const isTestFile = (path: string): boolean => /\.test\.tsx?$/.test(path);

export interface Violation {
  rule: string;
  file: string;
  detail: string;
}

function runtimeTargets(files: SourceFiles, file: string): string[] {
  const out: string[] = [];
  for (const ref of parseImports(files.get(file) ?? '')) {
    if (ref.typeOnly) continue;
    const target = resolveImport(files, file, ref.spec);
    if (target !== null) out.push(target);
  }
  return out;
}

// Những gì shared/ không được đụng: mạng, DOM, bộ nhớ trình duyệt, tiến trình Node, giờ hệ thống.
// `new Date(Date.UTC(...))` không đọc giờ nên được; giờ phải nhận qua tham số (shared/CLAUDE.md).
const SHARED_FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/\bfetch\s*\(/, 'gọi mạng (fetch)'],
  [/\bXMLHttpRequest\b/, 'gọi mạng (XMLHttpRequest)'],
  [/\b(window|document|navigator)\./, 'dùng DOM/trình duyệt'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'dùng bộ nhớ trình duyệt'],
  [/\bprocess\./, 'dùng tiến trình Node'],
  [/\bDate\.now\s*\(/, 'đọc giờ hệ thống (Date.now)'],
  [/\bnew Date\s*\(\s*\)/, 'đọc giờ hệ thống (new Date())'],
];

/** shared/ chỉ hàm thuần: không import client/server hay gói ngoài, không I/O. */
export function checkSharedIsPure(files: SourceFiles): Violation[] {
  const rule = 'shared thuần';
  const out: Violation[] = [];
  for (const [file, source] of files) {
    if (!file.startsWith('shared/src/')) continue;
    const test = isTestFile(file);
    for (const ref of parseImports(source)) {
      if (test && ref.spec === 'vitest') continue;
      const target = resolveImport(files, file, ref.spec);
      if (target === null) out.push({ rule, file, detail: `import gói ngoài '${ref.spec}'` });
      else if (!target.startsWith('shared/src/')) out.push({ rule, file, detail: `import ra ngoài shared: '${ref.spec}'` });
    }
    if (test) continue;
    const code = stripComments(source);
    for (const [pattern, what] of SHARED_FORBIDDEN) {
      if (pattern.test(code)) out.push({ rule, file, detail: what });
    }
  }
  return out;
}

/** client/src không với sang server/ hay shared/ bằng đường dẫn tương đối; shared đi qua tên gói. */
export function checkClientStaysInClient(files: SourceFiles): Violation[] {
  const out: Violation[] = [];
  for (const file of files.keys()) {
    if (!file.startsWith('client/src/')) continue;
    for (const target of runtimeTargets(files, file)) {
      if (!target.startsWith('client/src/')) {
        out.push({ rule: 'client không với ra ngoài', file, detail: `import '${target}'` });
      }
    }
  }
  return out;
}

// Mạng chỉ đi qua hai lớp gọi API (client/CLAUDE.md): app chính và trang quản trị.
export const NETWORK_FILES: ReadonlySet<string> = new Set(['client/src/sync/api.ts', 'client/src/admin/adminApi.ts']);
const NETWORK_CALL = /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\bnew\s+WebSocket\s*\(/;
// File này chứa chính các mẫu tìm ở trên nên tự khớp; nó không gọi mạng.
const THIS_FILE = 'client/src/importRules.ts';

export function checkNetworkOnlyInApi(files: SourceFiles): Violation[] {
  const out: Violation[] = [];
  for (const [file, source] of files) {
    if (!file.startsWith('client/src/') || isTestFile(file) || NETWORK_FILES.has(file) || file === THIS_FILE) continue;
    if (NETWORK_CALL.test(stripComments(source))) {
      out.push({ rule: 'mạng chỉ qua api', file, detail: 'gọi mạng ngoài sync/api.ts, admin/adminApi.ts' });
    }
  }
  return out;
}

const API_FILE = 'client/src/sync/api.ts';

export const isUiFile = (path: string): boolean =>
  path === 'client/src/App.tsx' || /^client\/src\/(pages|components)\//.test(path);

/**
 * Module "cần mạng": `sync/api.ts` và mọi module ngoài `sync/` (không phải UI) gọi thẳng nó, như
 * `members.ts`, `logout.ts`. Lớp `sync/` (engine, outbox, ảnh) là đường đồng bộ nền, UI dùng được
 * khi offline nên không tính.
 */
export function onlineModules(files: SourceFiles): Set<string> {
  const out = new Set([API_FILE]);
  for (const file of files.keys()) {
    if (!file.startsWith('client/src/') || file.startsWith('client/src/sync/') || file.startsWith('client/src/admin/')) continue;
    if (isUiFile(file) || isTestFile(file)) continue;
    if (runtimeTargets(files, file).includes(API_FILE)) out.add(file);
  }
  return out;
}

/** Bất biến 7: UI chỉ đọc/ghi IndexedDB; chỉ màn hình cần mạng mới dùng module cần mạng. */
export function checkUiOffline(files: SourceFiles, allowed: ReadonlySet<string>): Violation[] {
  const online = onlineModules(files);
  const out: Violation[] = [];
  for (const file of files.keys()) {
    if (!isUiFile(file) || isTestFile(file) || allowed.has(file)) continue;
    for (const target of runtimeTargets(files, file)) {
      if (online.has(target)) out.push({ rule: 'bất biến 7', file, detail: `dùng module cần mạng '${target}'` });
    }
  }
  return out;
}

/** Trang quản trị không giữ dữ liệu trên máy (design §4.9): không dùng `db/`, `sync/` lúc chạy. */
export function checkAdminHasNoLocalData(files: SourceFiles): Violation[] {
  const out: Violation[] = [];
  for (const file of files.keys()) {
    if (!file.startsWith('client/src/admin/')) continue;
    for (const target of runtimeTargets(files, file)) {
      if (/^client\/src\/(db|sync)\//.test(target)) {
        out.push({ rule: 'admin không dữ liệu máy', file, detail: `import '${target}'` });
      }
    }
  }
  return out;
}
