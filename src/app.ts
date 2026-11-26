import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './routes/authRoutes.js';
import { inventoryRouter } from './routes/inventoryRoutes.js';
import { masterRouter } from './routes/masterRoutes.js';
import { paymentRouter } from './routes/paymentRoutes.js';
import { productionRouter } from './routes/productionRoutes.js';
import { reportRouter } from './routes/reportRoutes.js';
import { salesRouter } from './routes/salesRoutes.js';
import { errorHandler } from './utils/errors.js';

export function createApp() {
  const app = express();

  app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? Number(value) : value,
  );

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'SavorSouth Foods ERP API',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/master', masterRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/production', productionRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/reports', reportRouter);

  app.use(errorHandler);
  return app;
}
