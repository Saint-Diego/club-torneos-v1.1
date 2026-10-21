import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { corsOrigins, env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { api } from './routes';

export const app = express();

app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet());
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(
  morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    skip: (req) => req.path.startsWith('/health'),
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
});

app.use('/api', apiLimiter, api);
app.use(notFound);
app.use(errorHandler);
