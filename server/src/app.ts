import express from 'express';
import cors from 'cors';
import type { Db } from './db';
import { createAuth } from './auth';
import { formsRouter } from './routes/forms';
import { meRouter } from './routes/me';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { directoryRouter } from './routes/directory';
import { projectRequestsRouter } from './routes/projectRequests';
import { recordsRouter } from './routes/records';
import { attachmentsRouter } from './routes/attachments';
import { membersRouter, settingsRouter } from './routes/members';
import { createUploadStore } from './uploads';
import { exportRouter } from './routes/export';
import { faultInjector, faultsRouter, requestLogger } from './routes/faults';
import { testMembershipsRouter } from './routes/testMemberships';

// Bật chủ động: quên cấu hình thì route tiêm lỗi tắt, kể cả khi quên đặt NODE_ENV. Xem docs/design.md §9.
export function testRoutesEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.ENABLE_TEST_ROUTES === '1';
}

export function createApp(
  db: Db,
  opts: { enableTestRoutes?: boolean; uploadDir?: string; publicBaseUrl?: string } = {},
) {
  const app = express();
  // Sau Caddy (cùng máy) mọi request tới từ loopback: chỉ khi đó mới tin X-Forwarded-For, để giới hạn
  // tần suất theo IP đếm đúng người dùng (ADR 0003 §1). Request đến thẳng cổng 3001 từ máy khác
  // thì header này bị bỏ qua.
  app.set('trust proxy', 'loopback');
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  if (opts.enableTestRoutes) {
    app.use('/api/__test', faultsRouter());
    app.use('/api/__test', testMembershipsRouter(db));
    // Nhật ký trước bộ tiêm lỗi để ghi được cả request bị cắt kết nối (design §10.1).
    app.use('/api/projects', requestLogger);
    app.use('/api/projects/:projectId', faultInjector);
  }

  // Route theo dự án: xác thực rồi kiểm thành viên (ADR 0002 §3). projectId chỉ lấy từ đường dẫn.
  const { requireAuth, requireMember, requireAdmin } = createAuth(db);
  app.use('/api/auth', authRouter(db, requireAuth));
  app.use('/api/me', requireAuth, meRouter(db));
  // Không theo dự án và không chạm form, phiếu (ADR 0003 §4): chỉ cần đăng nhập.
  app.use('/api/directory', requireAuth, directoryRouter(db));
  app.use('/api/project-requests', requireAuth, projectRequestsRouter(db));
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter(db));

  const asMember = [requireAuth, requireMember('surveyor')];
  // Lưu form chỉ cho giám sát viên; qua được thì đi tiếp xuống formsRouter như các route forms khác.
  // Chặn ở đây vì router con không thấy :projectId mà requireMember cần.
  app.post('/api/projects/:projectId/forms', requireAuth, requireMember('supervisor'));
  app.use('/api/projects/:projectId/forms', ...asMember, formsRouter(db));
  app.use('/api/projects/:projectId/records', ...asMember, recordsRouter(db));
  // Thành viên: supervisor trở lên; ai được đụng tới vai trò nào kiểm tiếp trong repo (ADR 0003 §2).
  app.use('/api/projects/:projectId/members', requireAuth, requireMember('supervisor'), membersRouter(db));
  app.use('/api/projects/:projectId/settings', requireAuth, requireMember('owner'), settingsRouter(db));
  // Thư mục ảnh: UPLOAD_DIR (design §12); test truyền thư mục tạm.
  const uploads = createUploadStore(opts.uploadDir ?? 'uploads');
  app.use('/api/projects/:projectId/attachments', ...asMember, attachmentsRouter(db, uploads));
  // Xuất dữ liệu: supervisor và owner (design §4.6); PUBLIC_BASE_URL là gốc URL ảnh trong file (§12).
  app.use(
    '/api/projects/:projectId/export',
    requireAuth,
    requireMember('supervisor'),
    exportRouter(db, opts.publicBaseUrl ?? 'http://localhost:3001'),
  );
  return app;
}
