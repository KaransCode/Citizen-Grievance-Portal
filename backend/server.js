import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './src/utils/db.js';
import { csrfProtection } from './src/middleware/auth.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import authRouter from './src/routes/auth.js';
import lookupRouter from './src/routes/lookups.js';
import complaintRouter from './src/routes/complaints.js';
import adminRouter from './src/routes/admin.js';
import departmentRouter from './src/routes/department.js';
import notificationRouter from './src/routes/notifications.js';
import attachmentRouter from './src/routes/attachments.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../frontend/dist');
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production'
    ? { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'] } }
    : false
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(Object.assign(new Error('Origin is not allowed by CORS.'), { status: 403 }));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','X-CSRF-Token','Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many authentication requests. Try again later.' } }));
app.use('/api', csrfProtection);

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', service: 'citizen-grievance-api', timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
});
app.use('/api/auth', authRouter);
app.use('/api', lookupRouter);
app.use('/api/complaints', complaintRouter);
app.use('/api/admin', adminRouter);
app.use('/api/department', departmentRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/attachments', attachmentRouter);

// In production, Express serves the built React application from the same origin as the API.
app.use(express.static(frontendDist, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path === '/api') return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (error) => error && next());
});
app.use(notFound);
app.use(errorHandler);

const server = app.listen(port, () => console.log(`CivicConnect API listening on http://localhost:${port}`));

async function shutdown(signal) {
  console.log(`${signal} received; shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
