import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  checkAdminHasNoLocalData,
  checkClientStaysInClient,
  checkNetworkOnlyInApi,
  checkSharedIsPure,
  checkUiOffline,
  onlineModules,
  parseImports,
  resolveImport,
  type SourceFiles,
} from './importRules';

// Màn hình được dùng module cần mạng (bất biến 7 ở CLAUDE.md). Thêm màn hình vào đây là đổi spec:
// sửa bất biến 7 và design §3.2 cùng PR.
const ONLINE_UI: ReadonlySet<string> = new Set([
  'client/src/pages/LoginPage.tsx', // Đăng nhập / Tạo tài khoản cần mạng (§4.2)
  'client/src/pages/OrgsPage.tsx', // Tổ chức (§4.2)
  'client/src/pages/MembersPage.tsx', // Thành viên (§4.2)
  'client/src/pages/BuilderPage.tsx', // lưu form (§4.1)
  'client/src/pages/SettingsPage.tsx', // Đổi mật khẩu, Đăng xuất thu hồi phiên (§4.2, §4.7)
  'client/src/components/ExportButtons.tsx', // Xuất (§7)
  'client/src/components/RecordHistory.tsx', // Lịch sử sửa ở màn 4 (§4.1)
]);

const files = (entries: Record<string, string>): SourceFiles => new Map(Object.entries(entries));

describe('parseImports', () => {
  it('đọc import tĩnh, nhiều dòng, side-effect, động; tách import type', () => {
    const refs = parseImports(
      [
        "import { a,",
        "  b } from './x';",
        "import type { T } from '../sync/api';",
        "import D, { e } from 'dexie';",
        "import * as ns from './ns';",
        "import './styles.css';",
        "export { f } from './f';",
        "const m = await import('./lazy');",
      ].join('\n'),
    );
    expect(refs).toEqual(
      expect.arrayContaining([
        { spec: './x', typeOnly: false },
        { spec: '../sync/api', typeOnly: true },
        { spec: 'dexie', typeOnly: false },
        { spec: './ns', typeOnly: false },
        { spec: './styles.css', typeOnly: false },
        { spec: './f', typeOnly: false },
        { spec: './lazy', typeOnly: false },
      ]),
    );
    expect(refs).toHaveLength(7);
  });

  it('bỏ qua import nằm trong comment, giữ URL trong chuỗi', () => {
    const src = "// import { x } from './old';\n/* import './y'; */\nconst u = 'https://a.b'; fetch(u);";
    expect(parseImports(src)).toEqual([]);
  });

  it('resolveImport thêm đuôi .ts/.tsx/index.ts, gói npm trả null', () => {
    const f = files({ 'client/src/sync/api.ts': '', 'client/src/db/index.ts': '' });
    expect(resolveImport(f, 'client/src/pages/A.tsx', '../sync/api')).toBe('client/src/sync/api.ts');
    expect(resolveImport(f, 'client/src/pages/A.tsx', '../db')).toBe('client/src/db/index.ts');
    expect(resolveImport(f, 'client/src/pages/A.tsx', 'react')).toBeNull();
    expect(resolveImport(f, 'client/src/a.ts', '../../server/src/db')).toBe('server/src/db');
  });
});

// Mỗi luật phải bắt được vi phạm thật, không thì test trên repo xanh cũng chẳng chứng minh gì.
describe('luật bắt được vi phạm', () => {
  it('shared: gói ngoài, import ra ngoài, I/O, giờ hệ thống; test được import vitest', () => {
    const v = checkSharedIsPure(
      files({
        'shared/src/a.ts': "import { db } from 'dexie';\nexport const x = () => fetch('/api');",
        'shared/src/b.ts': "import { y } from '../../client/src/y';\nexport const t = Date.now();",
        'shared/src/c.ts': 'export const d = new Date();\nexport const ok = new Date(Date.UTC(2026, 0, 1));',
        'shared/src/a.test.ts': "import { it } from 'vitest';\nit('x', () => fetch('/'));",
        'shared/src/ok.ts': "import { z } from './z';\n// fetch() trong comment không tính",
        'shared/src/z.ts': 'export const z = 1;',
      }),
    );
    expect(v.map((x) => `${x.file}: ${x.detail}`).sort()).toEqual([
      "shared/src/a.ts: gọi mạng (fetch)",
      "shared/src/a.ts: import gói ngoài 'dexie'",
      'shared/src/b.ts: import ra ngoài shared: \'../../client/src/y\'',
      'shared/src/b.ts: đọc giờ hệ thống (Date.now)',
      'shared/src/c.ts: đọc giờ hệ thống (new Date())',
    ]);
  });

  it('client không với sang server hay shared bằng đường dẫn tương đối', () => {
    const v = checkClientStaysInClient(
      files({
        'client/src/a.ts': "import { x } from '../../server/src/db';\nimport { m } from '@field-survey/shared';",
        'client/src/b.ts': "import { y } from '../../shared/src/merge';",
        'client/src/c.ts': "import type { T } from '../../server/src/types';\nimport { a } from './a';",
        'client/src/pages/P.tsx': "import { b } from '../b';",
      }),
    );
    expect(v.map((x) => x.file).sort()).toEqual(['client/src/a.ts', 'client/src/b.ts']);
  });

  it('fetch ngoài sync/api.ts, admin/adminApi.ts là vi phạm', () => {
    const v = checkNetworkOnlyInApi(
      files({
        'client/src/sync/api.ts': "fetch('/api/me');",
        'client/src/admin/adminApi.ts': "fetch('/api/admin');",
        'client/src/pages/HomePage.tsx': "await fetch('/api/forms');",
        'client/src/x.test.ts': "fetch('/');",
      }),
    );
    expect(v.map((x) => x.file)).toEqual(['client/src/pages/HomePage.tsx']);
  });

  it('bất biến 7: màn offline dùng api trực tiếp hoặc qua module trung gian đều bị bắt', () => {
    const f = files({
      'client/src/sync/api.ts': '',
      'client/src/sync/engine.ts': "import { push } from './api';",
      'client/src/members.ts': "import { addMember } from './sync/api';",
      'client/src/pages/FillPage.tsx': "import { saveForm } from '../sync/api';",
      'client/src/pages/HomePage.tsx': "import { addMembers } from '../members';\nimport { syncNow } from '../sync/engine';",
      'client/src/pages/ConflictPage.tsx': "import type { ApiError } from '../sync/api';",
      'client/src/pages/MembersPage.tsx': "import { addMembers } from '../members';",
    });
    expect([...onlineModules(f)].sort()).toEqual(['client/src/members.ts', 'client/src/sync/api.ts']);
    const v = checkUiOffline(f, new Set(['client/src/pages/MembersPage.tsx']));
    expect(v.map((x) => `${x.file} → ${x.detail}`).sort()).toEqual([
      "client/src/pages/FillPage.tsx → dùng module cần mạng 'client/src/sync/api.ts'",
      "client/src/pages/HomePage.tsx → dùng module cần mạng 'client/src/members.ts'",
    ]);
  });

  it('admin dùng db/ hay sync/ lúc chạy là vi phạm, import type thì không', () => {
    const v = checkAdminHasNoLocalData(
      files({
        'client/src/admin/A.tsx': "import { db } from '../db/db';",
        'client/src/admin/adminApi.ts': "import type { AccountErrorCode } from '../sync/api';",
      }),
    );
    expect(v.map((x) => x.file)).toEqual(['client/src/admin/A.tsx']);
  });
});

// Đọc mã nguồn thật của repo. Test nằm ở client vì client chạy code shared trong trình duyệt.
function readSources(): SourceFiles {
  const root = new URL('../../', import.meta.url);
  const out = new Map<string, string>();
  for (const dir of ['client/src', 'shared/src']) {
    for (const entry of readdirSync(new URL(dir, root), { recursive: true, encoding: 'utf8' })) {
      const rel = `${dir}/${entry.replaceAll('\\', '/')}`;
      if (/\.tsx?$/.test(rel)) out.set(rel, readFileSync(new URL(rel, root), 'utf8'));
    }
  }
  return out;
}

describe('repo giữ đúng ranh giới (design §3.2)', () => {
  const repo = readSources();

  it('đọc được mã nguồn', () => {
    expect(repo.has('client/src/sync/api.ts')).toBe(true);
    expect(repo.has('shared/src/merge.ts')).toBe(true);
  });

  it('shared/ chỉ hàm thuần, không I/O', () => {
    expect(checkSharedIsPure(repo)).toEqual([]);
  });

  it('client/ không với sang server/, shared/ bằng đường dẫn tương đối', () => {
    expect(checkClientStaysInClient(repo)).toEqual([]);
  });

  it('mạng chỉ đi qua sync/api.ts, admin/adminApi.ts', () => {
    expect(checkNetworkOnlyInApi(repo)).toEqual([]);
  });

  it('bất biến 7: chỉ màn hình cần mạng mới dùng module cần mạng', () => {
    expect(checkUiOffline(repo, ONLINE_UI)).toEqual([]);
  });

  it('danh sách màn cần mạng không thừa: màn nào trong danh sách cũng thật sự dùng mạng', () => {
    const online = onlineModules(repo);
    const unused = [...ONLINE_UI].filter(
      (file) => !parseImports(repo.get(file) ?? '').some((ref) => {
        const target = resolveImport(repo, file, ref.spec);
        return !ref.typeOnly && target !== null && online.has(target);
      }),
    );
    expect(unused).toEqual([]);
  });

  it('trang quản trị không dùng db/, sync/', () => {
    expect(checkAdminHasNoLocalData(repo)).toEqual([]);
  });
});
