import { mkdirSync } from 'node:fs';
import { openDb, seed } from './db';
import { seedDemo } from './seedDemo';
import { createApp, testRoutesEnabled } from './app';

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.DB_PATH ?? 'data/survey.db';
if (dbPath !== ':memory:') mkdirSync('data', { recursive: true });

const db = openDb(dbPath);
seed(db);
// Token demo cố định: chỉ bật khi chủ động đặt SEED_DEMO=1 (dev/E2E), không bao giờ mặc định.
if (process.env.SEED_DEMO === '1') seedDemo(db);
const app = createApp(db, { enableTestRoutes: testRoutesEnabled(process.env) });
app.listen(port, () => {
  console.log(`API chạy tại http://localhost:${port}`);
});
