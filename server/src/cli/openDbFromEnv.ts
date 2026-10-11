import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb, type Db } from '../db';

/** Mở cùng file SQLite với server (biến DB_PATH, design §12). */
export function openDbFromEnv(env: NodeJS.ProcessEnv = process.env): Db {
  const dbPath = env.DB_PATH ?? 'data/survey.db';
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  // Server có thể đang chạy và giữ khoá ghi; chờ một lúc thay vì lỗi SQLITE_BUSY ngay.
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}
