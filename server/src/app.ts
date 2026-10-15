import express from 'express';
import cors from 'cors';
import type { Db } from './db';
import { createAuth } from './auth';
import { formsRouter } from './routes/forms';
import { meRouter } from './routes/me';
import { adminRouter } from './routes/admin';
import { recordsRouter } from './routes/records';
import { attachmentsRouter } from './routes/attachments';
import { createUploadStore } from './uploads';
import { exportRouter } from './routes/export';
import { faultInjector, faultsRouter } from './routes/faults';
import { testMembershipsRouter } from './routes/testMemberships';

// Bật chủ động: quên cấu hình thì route tiêm lỗi tắt, kể cả khi quên đặt NODE_ENV. Xem docs/design.md §9.
export function testRoutesEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.ENABLE_TEST_ROUTES === '1';
}

export function createApp(db: Db, opts: { enableTestRoutes?: boolean; uploadDir?: string } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  if (opts.enableTestRoutes) {
    app.use('/api/__test', faultsRouter());
    app.use('/api/__test', testMembershipsRouter(db));
    app.use('/api/projects/:projectId/records', faultInjector);
  }

  // Route theo dự án: xác thực rồi kiểm thành viên (ADR 0002 §3). projectId chỉ lấy từ đường dẫn.
  const { requireAuth, requireMember, requireAdmin } = createAuth(db);
  app.use('/api/me', requireAuth, meRouter(db));
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter(db));

  const asMember = [requireAuth, requireMember('surveyor')];
  // Lưu form chỉ cho giám sát viên; qua được thì đi tiếp xuống formsRouter như các route forms khác.
  // Chặn ở đây vì router con không thấy :projectId mà requireMember cần.
  app.post('/api/projects/:projectId/forms', requireAuth, requireMember('supervisor'));
  app.use('/api/projects/:projectId/forms', ...asMember, formsRouter(db));
  app.use('/api/projects/:projectId/records', ...asMember, recordsRouter(db));
  // Thư mục ảnh: UPLOAD_DIR (design §12); test truyền thư mục tạm.
  const uploads = createUploadStore(opts.uploadDir ?? 'uploads');
  app.use('/api/projects/:projectId/attachments', ...asMember, attachmentsRouter(db, uploads));
  app.use('/api/export', exportRouter(db));
  return app;
}
