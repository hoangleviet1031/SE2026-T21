import type { FormSchema } from '@field-survey/shared';
import type { Ctx } from '../auth';
import type { Db } from '../db';

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
