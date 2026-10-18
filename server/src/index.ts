import { mkdirSync } from 'node:fs';
import { openDb, seed } from './db';
import { seedDemo } from './seedDemo';
import { createApp, testRoutesEnabled } from './app';
import { deleteExpiredKeys } from './repo/idempotency';
import { cleanupStaleChunks } from './uploads';

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.DB_PATH ?? 'data/survey.db';
const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
if (dbPath !== ':memory:') mkdirSync('data', { recursive: true });

const db = openDb(dbPath);
seed(db);
// Token demo cố định: chỉ bật khi chủ động đặt SEED_DEMO=1 (dev/E2E), không bao giờ mặc định.
if (process.env.SEED_DEMO === '1') seedDemo(db);
// Dọn key idempotency quá 30 ngày khi khởi động và mỗi 24 giờ (ADR 0001 quy tắc 3).
// unref: lịch dọn không giữ tiến trình sống khi server đã đóng.
const cleanKeys = () => {
  const removed = deleteExpiredKeys(db, new Date());
  if (removed > 0) console.log(`Đã dọn ${removed} idempotency key quá 30 ngày`);
};
// Ảnh tải dở (chưa complete) quá 7 ngày thì xoá chunk, cùng lịch (design §5.6).
const cleanChunks = () => {
  const removed = cleanupStaleChunks(uploadDir, new Date());
  if (removed > 0) console.log(`Đã dọn ${removed} ảnh tải dở quá 7 ngày`);
};
cleanKeys();
cleanChunks();
setInterval(cleanKeys, 24 * 60 * 60 * 1000).unref();
setInterval(cleanChunks, 24 * 60 * 60 * 1000).unref();

const app = createApp(db, { enableTestRoutes: testRoutesEnabled(process.env), uploadDir, publicBaseUrl });
app.listen(port, () => {
  console.log(`API chạy tại http://localhost:${port}`);
});
