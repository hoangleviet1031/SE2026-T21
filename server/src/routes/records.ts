import { Router, type Request } from 'express';
import type {
  ConflictResponse,
  PullResponse,
  PushRecordRequest,
  RecordHistoryEntry,
  ServerRecord,
} from '@field-survey/shared';
import { nextSeq, tx, type Db } from '../db';

interface RecordRow {
  id: string;
  form_id: string;
  form_version: number;
  data: string;
  version: number;
  deleted: number;
  updated_at: string;
  updated_by: string;
  seq: number;
}

function toRecord(row: RecordRow): ServerRecord {
  return {
    id: row.id,
    formId: row.form_id,
    formVersion: row.form_version,
    data: JSON.parse(row.data),
    version: row.version,
    deleted: row.deleted === 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export function recordsRouter(db: Db): Router {
  const r = Router();

  // Pull: các bản ghi thay đổi sau cursor
  r.get('/', (req, res) => {
    const since = Number(req.query.since ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 500), 1000);
    const rows = db
      .prepare(`SELECT * FROM records WHERE seq > ? ORDER BY seq LIMIT ?`)
      .all(since, limit) as unknown as RecordRow[];
    const body: PullResponse = {
      records: rows.map(toRecord),
      cursor: rows.length ? rows[rows.length - 1]!.seq : since,
    };
    res.json(body);
  });

  r.get('/:id/history', (req, res) => {
    const rows = db
      .prepare(`SELECT * FROM record_history WHERE record_id = ? ORDER BY version`)
      .all(req.params.id) as unknown as HistoryRow[];
    res.json(rows.map(toHistory));
  });

  // Push: ghi có điều kiện theo baseVersion (optimistic concurrency).
  // Header Idempotency-Key bắt buộc: gửi lại cùng key trả lại đúng response cũ.
  r.put('/:id', (req: Request<{ id: string }, unknown, PushRecordRequest>, res) => {
    const key = req.header('Idempotency-Key');
    if (!key) return void res.status(400).json({ error: 'missing_idempotency_key' });

    const result = tx(db, () => {
      const seen = db.prepare(`SELECT status, body FROM idempotency WHERE key = ?`).get(key) as
        | { status: number; body: string }
        | undefined;
      if (seen) return { status: seen.status, body: JSON.parse(seen.body), replay: true };

      const out = applyPush(db, req.params.id, req.body);
      // Chỉ lưu kết quả thành công; 409 không lưu để client gửi lại sau khi merge (với key mới)
      if (out.status < 300) {
        db.prepare(`INSERT INTO idempotency (key, status, body, created_at) VALUES (?, ?, ?, ?)`).run(
          key,
          out.status,
          JSON.stringify(out.body),
          new Date().toISOString(),
        );
      }
      return { ...out, replay: false };
    });

    if (result.replay) res.setHeader('Idempotent-Replayed', 'true');
    res.status(result.status).json(result.body);
  });

  return r;
}

interface HistoryRow {
  version: number;
  data: string;
  deleted: number;
  updated_at: string;
  updated_by: string;
}

function toHistory(h: HistoryRow): RecordHistoryEntry {
  return {
    version: h.version,
    data: JSON.parse(h.data),
    deleted: h.deleted === 1,
    updatedAt: h.updated_at,
    updatedBy: h.updated_by,
  };
}

function applyPush(db: Db, id: string, body: PushRecordRequest): { status: number; body: unknown } {
  const { baseVersion, data, deleted, formId, formVersion, updatedBy } = body;
  if (typeof baseVersion !== 'number' || typeof data !== 'object' || !formId) {
    return { status: 400, body: { error: 'invalid_body' } };
  }

  const current = db.prepare(`SELECT * FROM records WHERE id = ?`).get(id) as RecordRow | undefined;
  const currentVersion = current?.version ?? 0;

  if (currentVersion !== baseVersion) {
    if (!current) return { status: 404, body: { error: 'not_found' } };
    const history = db
      .prepare(`SELECT * FROM record_history WHERE record_id = ? AND version > ? ORDER BY version`)
      .all(id, baseVersion) as unknown as HistoryRow[];
    const conflict: ConflictResponse = {
      error: 'version_conflict',
      current: toRecord(current),
      history: history.map(toHistory),
    };
    return { status: 409, body: conflict };
  }

  const version = currentVersion + 1;
  const now = new Date().toISOString();
  const seq = nextSeq(db);
  const dataJson = JSON.stringify(data);
  db.prepare(
    `INSERT INTO records (id, form_id, form_version, data, version, deleted, updated_at, updated_by, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, version = excluded.version, deleted = excluded.deleted,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by, seq = excluded.seq`,
  ).run(id, formId, formVersion, dataJson, version, deleted ? 1 : 0, now, updatedBy, seq);
  db.prepare(
    `INSERT INTO record_history (record_id, version, data, deleted, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, version, dataJson, deleted ? 1 : 0, now, updatedBy);

  const saved = db.prepare(`SELECT * FROM records WHERE id = ?`).get(id) as unknown as RecordRow;
  return { status: currentVersion === 0 ? 201 : 200, body: toRecord(saved) };
}
