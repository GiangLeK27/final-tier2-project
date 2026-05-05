// Import required libraries
// express: used to create the web server
// pg: PostgreSQL client for Node.js
// prom-client: used to expose Prometheus metrics
import express from "express";
import pg from "pg";
import client from "prom-client";

// Create express application
const app = express();

// Application port configuration
const port = Number(process.env.PORT || 3000);

// Application version (can be set through environment variable)
const version = process.env.APP_VERSION || "local-dev";

// Database connection string
const databaseUrl = process.env.DATABASE_URL;

// Create PostgreSQL connection pool if DATABASE_URL exists
const dbPool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;


// Collect default Node.js process metrics for Prometheus
// Example: CPU usage, memory usage, event loop lag
client.collectDefaultMetrics();


// Counter metric to track total HTTP requests
// Labels help categorize requests by method, route, and status code
const httpRequestCounter = new client.Counter({
  name: "app_http_requests_total",
  help: "Total number of HTTP requests handled by the application",
  labelNames: ["method", "route", "status_code"]
});


// Histogram metric to measure request duration
// Used to analyze application latency
const httpRequestDuration = new client.Histogram({
  name: "app_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});


// Middleware used to measure request duration
// and update Prometheus metrics
app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    const labels = {
      method: req.method,
      route: req.route?.path || req.path || req.originalUrl || "unknown",
      status_code: String(res.statusCode)
    };

    httpRequestCounter.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
  });

  next();
});

// Root endpoint
// Displays a simple HTML page showing application status
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
    <h1>Welcome to Devops</h1>
    <p class="ok">Running inside Docker container successfully.</p>
    <p>Deployment model: <strong>Single-server containerized deployment using Docker Compose</strong>.</p>
    <p>Application version: <code>${version}</code></p>
    <p>Useful endpoints: <code>/health</code>, <code>/db</code>, <code>/metrics</code></p>
    <p>Custom metrics: <code>app_http_requests_total</code>, <code>app_http_request_duration_seconds</code></p>
  </main>
</body>
</html>`);
});

// Health check endpoint
// Used by monitoring systems or load balancers
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "final-tier2-app",
    version,
    timestamp: new Date().toISOString()
  });
});

app.get("/db", async (_req, res) => {
  if (!dbPool) {
    res.status(500).json({ ok: false, error: "DATABASE_URL is not configured" });
    return;
  }

  try {
    const result = await dbPool.query("SELECT NOW() AS current_time");
    res.json({
      ok: true,
      database_time: result.rows[0].current_time
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Final Tier 2 app listening on port ${port}`);
});

// Graceful shutdown function
// Ensures the server and database close properly
const shutdown = async () => {
  console.log("Shutting down application...");
  server.close(async () => {
    if (dbPool) {
      await dbPool.end();
    }
    process.exit(0);
  });
};
// Handle container shutdown signals (Docker / Kubernetes)
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
