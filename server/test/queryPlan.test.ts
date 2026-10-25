import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { PULL_SQL } from '../src/repo/records';

// TV2-11 (design §11.2): pull đi theo index, không quét cả bảng records, để thời gian mỗi trang không
// tăng theo tổng số phiếu của mọi dự án. Kiểm trên đúng câu SQL server chạy (PULL_SQL).

// Tham số giả đúng số dấu ? của từng câu: chỉ cần kế hoạch truy vấn, không cần dữ liệu.
const PARAMS = { all: ['p', 0, 500], own: ['p', 'u', 0, 500] } as const;

function plan(scope: keyof typeof PULL_SQL): string[] {
  const db = openDb(':memory:');
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${PULL_SQL[scope]}`).all(...PARAMS[scope]) as { detail: string }[];
  return rows.map((r) => r.detail);
}

describe('EXPLAIN QUERY PLAN của pull', () => {
  it('phạm vi "all" dùng index (project_id, seq), không quét records, không sắp xếp tạm', () => {
    const detail = plan('all');
    expect(detail.some((d) => /^SEARCH r USING INDEX records_project_seq \(project_id=\? AND seq>\?\)/.test(d))).toBe(true);
    expect(detail.some((d) => /^SCAN r\b/.test(d))).toBe(false);
    expect(detail.some((d) => d.includes('USE TEMP B-TREE FOR ORDER BY'))).toBe(false);
  });

  it('phạm vi "own" dùng index (project_id, created_by, seq), không quét records, không sắp xếp tạm', () => {
    const detail = plan('own');
    expect(
      detail.some((d) =>
        /^SEARCH r USING INDEX records_project_creator_seq \(project_id=\? AND created_by=\? AND seq>\?\)/.test(d),
      ),
    ).toBe(true);
    expect(detail.some((d) => /^SCAN r\b/.test(d))).toBe(false);
    expect(detail.some((d) => d.includes('USE TEMP B-TREE FOR ORDER BY'))).toBe(false);
  });

  it('ghép tên người tạo/sửa tra users theo khoá chính, không quét users', () => {
    for (const scope of ['all', 'own'] as const) {
      const detail = plan(scope);
      for (const alias of ['cu', 'uu']) {
        expect(
          detail.some((d) => new RegExp(`^SEARCH ${alias} USING (INDEX \\S+|INTEGER PRIMARY KEY) \\(id=\\?\\)`).test(d)),
          `${scope} ${alias}: ${detail.join(' | ')}`,
        ).toBe(true);
        expect(detail.some((d) => new RegExp(`^SCAN ${alias}\\b`).test(d)), scope).toBe(false);
      }
    }
  });
});
