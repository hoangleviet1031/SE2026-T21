import { mkdirSync } from 'node:fs';
import { openDb, seed } from './db';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.DB_PATH ?? 'data/survey.db';
if (dbPath !== ':memory:') mkdirSync('data', { recursive: true });

const db = openDb(dbPath);
seed(db);
const app = createApp(db, { enableTestRoutes: process.env.NODE_ENV !== 'production' });
app.listen(port, () => {
  console.log(`API chạy tại http://localhost:${port}`);
});
