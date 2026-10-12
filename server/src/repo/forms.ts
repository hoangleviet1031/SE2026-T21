import { validateFormSchema, type FormSchema, type SaveFormRequest } from '@field-survey/shared';
import type { Ctx } from '../auth';
import { tx, type Db } from '../db';

interface FormRow {
  schema: string;
}

function toForm(row: FormRow): FormSchema {
  return JSON.parse(row.schema) as FormSchema;
}

/** Phiên bản mới nhất của mỗi form trong dự án. */
export function listLatestForms(ctx: Ctx, db: Db): FormSchema[] {
  const rows = db
    .prepare(
      `SELECT schema FROM forms f
       WHERE f.project_id = ? AND f.version = (SELECT MAX(version) FROM forms WHERE project_id = f.project_id AND id = f.id)
       ORDER BY f.id`,
    )
    .all(ctx.projectId) as unknown as FormRow[];
  return rows.map(toForm);
}

export function getFormVersion(ctx: Ctx, db: Db, id: string, version: number): FormSchema | undefined {
  const row = db
    .prepare(`SELECT schema FROM forms WHERE project_id = ? AND id = ? AND version = ?`)
    .get(ctx.projectId, id, version) as FormRow | undefined;
  return row ? toForm(row) : undefined;
}

/**
 * Lưu phiên bản mới của form: `version` = bản mới nhất + 1 (hoặc 1). Đọc bản trước, validate và
 * ghi trong cùng một transaction, nên hai request song song không ra cùng một version và luật
 * "không làm hỏng phiếu cũ" luôn so với đúng bản mới nhất (design §4.1).
 */
export function saveFormVersion(
  ctx: Ctx,
  db: Db,
  input: SaveFormRequest,
  now: string,
): { ok: true; form: FormSchema } | { ok: false; errors: string[] } {
  return tx(db, () => {
    const latest = db
      .prepare(`SELECT schema FROM forms WHERE project_id = ? AND id = ? ORDER BY version DESC LIMIT 1`)
      .get(ctx.projectId, input.id) as FormRow | undefined;
    const prev = latest ? toForm(latest) : undefined;
    const form: FormSchema = { ...input, version: (prev?.version ?? 0) + 1 };

    const errors = validateFormSchema(form, prev);
    if (errors.length > 0) return { ok: false, errors };

    db.prepare(
      `INSERT INTO forms (project_id, id, version, schema, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(ctx.projectId, form.id, form.version, JSON.stringify(form), now, ctx.userId);
    return { ok: true, form };
  });
}
