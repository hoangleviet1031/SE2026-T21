import { Router } from 'express';
import type { FieldDef, FieldType, SaveFormRequest } from '@field-survey/shared';
import { getCtx } from '../auth';
import type { Db } from '../db';
import { getFormVersion, listLatestForms, saveFormVersion } from '../repo/forms';

const FIELD_TYPES: readonly FieldType[] = ['text', 'number', 'select', 'multiselect', 'date', 'photo', 'gps'];

const isOptional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const isBoolean = (v: unknown) => typeof v === 'boolean';
const isStringArray = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Kiểm kiểu thân request và chỉ giữ các khoá đã biết, để form lưu vào DB đúng `FormSchema`.
 * Sai kiểu → `invalid_body`; luật nội dung (id trùng, option...) để `validateFormSchema` báo.
 * `version` client gửi (nếu có) bị bỏ qua: server tự đặt.
 */
function parseSaveForm(body: unknown): SaveFormRequest | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || typeof b.title !== 'string' || !Array.isArray(b.fields)) return undefined;

  const fields: FieldDef[] = [];
  for (const raw of b.fields as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const f = raw as Record<string, unknown>;
    const type = FIELD_TYPES.find((t) => t === f.type);
    if (
      typeof f.id !== 'string' ||
      !type ||
      typeof f.label !== 'string' ||
      !isOptional(f.required, isBoolean) ||
      !isOptional(f.hidden, isBoolean) ||
      !isOptional(f.options, isStringArray)
    ) {
      return undefined;
    }
    fields.push({
      id: f.id,
      type,
      label: f.label,
      ...(f.required !== undefined && { required: f.required as boolean }),
      ...(f.options !== undefined && { options: f.options as string[] }),
      ...(f.hidden !== undefined && { hidden: f.hidden as boolean }),
    });
  }
  return { id: b.id, title: b.title, fields };
}

export function formsRouter(db: Db): Router {
  const r = Router();

  // Trả về phiên bản mới nhất của mỗi form trong dự án
  r.get('/', (req, res) => {
    res.json(listLatestForms(getCtx(req), db));
  });

  r.get('/:id/versions/:version', (req, res) => {
    const form = getFormVersion(getCtx(req), db, req.params.id, Number(req.params.version));
    if (!form) return void res.status(404).json({ error: 'not_found' });
    res.json(form);
  });

  // Lưu form từ builder thành phiên bản mới. Chỉ giám sát viên: chặn ở app.ts (design §7).
  r.post('/', (req, res) => {
    const input = parseSaveForm(req.body);
    if (!input) return void res.status(400).json({ error: 'invalid_body' });
    const result = saveFormVersion(getCtx(req), db, input, new Date().toISOString());
    if (!result.ok) return void res.status(400).json({ error: 'invalid_form', details: result.errors });
    res.status(201).json(result.form);
  });

  return r;
}
