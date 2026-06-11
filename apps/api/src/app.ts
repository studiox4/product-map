import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { activityRoutes } from './routes/activity';
import { featuresRoutes } from './routes/features';
import { productsRoutes } from './routes/products';
import { documentsRoutes, exportRoutes } from './routes/documents';
import { uploadsRoutes } from './routes/uploads';
import { overviewRoutes } from './routes/overview';
import { aiRoutes } from './routes/ai';
import { usersRoutes } from './routes/users';
import { commentsRoutes } from './routes/comments';

export const app = new Hono()
  .get('/api/healthz', (c) => c.json({ ok: true }))
  .route('/api/users', usersRoutes)
  .route('/api/features', featuresRoutes)
  .route('/api/activity', activityRoutes)
  .route('/api/comments', commentsRoutes)
  .route('/api/products', productsRoutes)
  .route('/api/documents', documentsRoutes)
  .route('/api', exportRoutes)
  .route('/api/uploads', uploadsRoutes)
  .route('/api/overview', overviewRoutes)
  .route('/api/ai', aiRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  const requestId = crypto.randomUUID();
  console.error(`[${requestId}]`, err);
  return c.json({ error: 'internal', requestId }, 500);
});

export type AppType = typeof app;
