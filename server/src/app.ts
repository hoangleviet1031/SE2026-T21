import express from 'express';
import cors from 'cors';
import type { Db } from './db';
import { formsRouter } from './routes/forms';
import { recordsRouter } from './routes/records';
import { attachmentsRouter } from './routes/attachments';
import { exportRouter } from './routes/export';
import { faultInjector, faultsRouter } from './routes/faults';

export function createApp(db: Db, opts: { enableTestRoutes?: boolean } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  if (opts.enableTestRoutes) {
    app.use('/api/__test', faultsRouter());
    app.use('/api/records', faultInjector);
  }

  app.use('/api/forms', formsRouter(db));
  app.use('/api/records', recordsRouter(db));
  app.use('/api/attachments', attachmentsRouter());
  app.use('/api/export', exportRouter(db));
  return app;
}
