import express from "express";
import pg from "pg";
import client from "prom-client";

const app = express();
const port = Number(process.env.PORT || 3000);
const version = process.env.APP_VERSION || "local-dev";
const databaseUrl = process.env.DATABASE_URL;

client.collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "app_http_requests_total",
  help: "Total number of HTTP requests handled by the application",
  labelNames: ["method", "route", "status_code"]
});

app.use((req, res, next) => {
  res.on("finish", () => {
    httpRequestCounter.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: String(res.statusCode)
    });
  });
  next();
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Final Tier 2 App</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 48px; background: #f7fafc; color: #172033; }
    .card { max-width: 860px; background: white; border-radius: 18px; padding: 32px; box-shadow: 0 12px 35px rgba(0,0,0,.08); }
    h1 { margin-top: 0; color: #075985; }
    code { background: #edf2f7; padding: 3px 6px; border-radius: 6px; }
    .ok { color: #15803d; font-weight: 700; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Startup X - Final Project Tier 2</h1>
    <p class="ok">Running inside Docker container successfully.</p>
    <p>Deployment model: <strong>Single-server containerized deployment using Docker Compose</strong>.</p>
    <p>Application version: <code>${version}</code></p>
    <p>Useful endpoints: <code>/health</code>, <code>/db</code>, <code>/metrics</code></p>
  </main>
</body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "final-tier2-app",
    version,
    timestamp: new Date().toISOString()
  });
});

app.get("/db", async (_req, res) => {
  if (!databaseUrl) {
    res.status(500).json({ ok: false, error: "DATABASE_URL is not configured" });
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    const result = await pool.query("SELECT NOW() AS current_time");
    res.json({
      ok: true,
      database_time: result.rows[0].current_time
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  } finally {
    await pool.end();
  }
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Final Tier 2 app listening on port ${port}`);
});
