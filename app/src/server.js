import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import client from 'prom-client';
import productRoutes from './routes/productRoutes.js';
import uiRoutes from './routes/uiRoutes.js';
import * as dataSource from './services/dataSource.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const version = process.env.APP_VERSION || 'local-dev';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

client.collectDefaultMetrics();
const httpRequestCounter = new client.Counter({
  name: 'app_http_requests_total',
  help: 'Total number of HTTP requests handled by the application',
  labelNames: ['method', 'route', 'status_code']
});
const httpRequestDuration = new client.Histogram({
  name: 'app_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route: req.route?.path || req.path || req.originalUrl || 'unknown',
      status_code: String(res.statusCode)
    };
    httpRequestCounter.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
  });
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'final-tier2-app',
    version,
    hostname: os.hostname(),
    timestamp: new Date().toISOString()
  });
});

app.get('/db', async (_req, res) => {
  const db = await dataSource.health();
  res.status(db.ok ? 200 : 503).json(db);
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.use('/', uiRoutes);
app.use('/products', productRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Internal Server Error' });
});

let server;
async function start() {
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  await dataSource.init();
  server = app.listen(port, '0.0.0.0', () => {
    console.log(`Final Tier 2 app listening on port ${port}`);
    console.log(`UI source: original sample-mid layout`);
    console.log(`Data source in use: ${dataSource.isPostgres() ? 'postgresql' : 'in-memory'}`);
  });
}

async function shutdown() {
  console.log('Shutting down application...');
  await dataSource.close();
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

export default app;
