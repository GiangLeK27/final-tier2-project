import express from "express";
import pg from "pg";
import client from "prom-client";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const app = express();
const port = Number(process.env.PORT || 3000);
const version = process.env.APP_VERSION || "local-dev";
const databaseUrl = process.env.DATABASE_URL;

const dbPool = databaseUrl
  ? new pg.Pool({ connectionString: databaseUrl })
  : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viewsDir = path.join(__dirname, "views");
const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");

fs.mkdirSync(uploadsDir, { recursive: true });

app.set("view engine", "ejs");
app.set("views", viewsDir);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(publicDir));

client.collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "app_http_requests_total",
  help: "Total number of HTTP requests handled by the application",
  labelNames: ["method", "route", "status_code"]
});

const httpRequestDuration = new client.Histogram({
  name: "app_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds =
      Number(process.hrtime.bigint() - start) / 1e9;

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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }

    cb(null, true);
  }
});

async function ensureProductsTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(12, 2) NOT NULL,
      color TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const countResult = await dbPool.query(
    "SELECT COUNT(*)::int AS total FROM products"
  );

  if (countResult.rows[0].total === 0) {
    await dbPool.query(`
      INSERT INTO products (name, price, color, description, image_url)
      VALUES
        (
          'iPhone SE (3rd generation)',
          429.00,
          'black',
          'Compact design with A15 Bionic, great value for everyday use.',
          ''
        ),
        (
          'MacBook Pro 14-inch (M2 Pro)',
          1999.00,
          'silver',
          'Powerful M2 Pro chip, Liquid Retina XDR display, and strong battery life.',
          ''
        ),
        (
          'Apple Watch Series 9',
          399.00,
          'starlight',
          'Smart health tracking with a bright display and fast chip.',
          ''
        ),
        (
          'MacBook Air 13-inch (M2)',
          1199.00,
          'midnight',
          'Thin, light, quiet, and suitable for study or daily work.',
          ''
        ),
        (
          'iPad Pro 11-inch (M4)',
          799.00,
          'silver',
          'Premium tablet for creative work and productivity.',
          ''
        ),
        (
          'iPhone 14 Pro Max',
          1099.00,
          'space-black',
          '6.7-inch Super Retina XDR display, A16 Bionic chip, pro camera system.',
          ''
        )
    `);
  }
}

async function getProducts() {
  if (!dbPool) {
    return [];
  }

  const result = await dbPool.query(`
    SELECT
      id,
      name,
      price,
      color,
      description,
      image_url AS "imageUrl"
    FROM products
    ORDER BY id ASC
  `);

  return result.rows;
}

function validateProductInput(body) {
  const name = String(body.name || "").trim();
  const color = String(body.color || "").trim();
  const description = String(body.description || "").trim();
  const price = Number(body.price);

  const errors = [];

  if (!name) {
    errors.push({ msg: "Name is required" });
  }

  if (!color) {
    errors.push({ msg: "Color is required" });
  }

  if (!Number.isFinite(price) || price <= 0) {
    errors.push({ msg: "Price must be greater than 0" });
  }

  return {
    errors,
    data: {
      name,
      color,
      description,
      price
    }
  };
}

app.get("/", async (_req, res) => {
  try {
    await ensureProductsTable();

    const products = await getProducts();

    res.render("index", {
      products,
      hostname: os.hostname(),
      source: "PostgreSQL",
      version
    });
  } catch (error) {
    console.error("Failed to render product page:", error);

    res.status(500).send("Unable to load products");
  }
});

app.get("/products", async (_req, res) => {
  try {
    await ensureProductsTable();

    const products = await getProducts();

    res.json({
      ok: true,
      products
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.post("/products", upload.single("imageFile"), async (req, res) => {
  try {
    if (!dbPool) {
      res.status(500).json({
        ok: false,
        message: "DATABASE_URL is not configured"
      });
      return;
    }

    await ensureProductsTable();

    const { errors, data } = validateProductInput(req.body);

    if (errors.length > 0) {
      res.status(400).json({
        ok: false,
        errors
      });
      return;
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";

    const result = await dbPool.query(
      `
        INSERT INTO products (name, price, color, description, image_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          name,
          price,
          color,
          description,
          image_url AS "imageUrl"
      `,
      [data.name, data.price, data.color, data.description, imageUrl]
    );

    res.status(201).json({
      ok: true,
      product: result.rows[0]
    });
  } catch (error) {
    console.error("Create product failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.patch("/products/:id", upload.single("imageFile"), async (req, res) => {
  try {
    if (!dbPool) {
      res.status(500).json({
        ok: false,
        message: "DATABASE_URL is not configured"
      });
      return;
    }

    await ensureProductsTable();

    const productId = Number(req.params.id);

    if (!Number.isInteger(productId)) {
      res.status(400).json({
        ok: false,
        message: "Invalid product id"
      });
      return;
    }

    const { errors, data } = validateProductInput(req.body);

    if (errors.length > 0) {
      res.status(400).json({
        ok: false,
        errors
      });
      return;
    }

    const currentResult = await dbPool.query(
      "SELECT image_url FROM products WHERE id = $1",
      [productId]
    );

    if (currentResult.rowCount === 0) {
      res.status(404).json({
        ok: false,
        message: "Product not found"
      });
      return;
    }

    const currentImageUrl = currentResult.rows[0].image_url || "";
    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : currentImageUrl;

    const result = await dbPool.query(
      `
        UPDATE products
        SET
          name = $1,
          price = $2,
          color = $3,
          description = $4,
          image_url = $5,
          updated_at = NOW()
        WHERE id = $6
        RETURNING
          id,
          name,
          price,
          color,
          description,
          image_url AS "imageUrl"
      `,
      [
        data.name,
        data.price,
        data.color,
        data.description,
        imageUrl,
        productId
      ]
    );

    res.json({
      ok: true,
      product: result.rows[0]
    });
  } catch (error) {
    console.error("Update product failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    if (!dbPool) {
      res.status(500).json({
        ok: false,
        message: "DATABASE_URL is not configured"
      });
      return;
    }

    const productId = Number(req.params.id);

    if (!Number.isInteger(productId)) {
      res.status(400).json({
        ok: false,
        message: "Invalid product id"
      });
      return;
    }

    const result = await dbPool.query(
      "DELETE FROM products WHERE id = $1 RETURNING id",
      [productId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        ok: false,
        message: "Product not found"
      });
      return;
    }

    res.json({
      ok: true
    });
  } catch (error) {
    console.error("Delete product failed:", error);

    res.status(500).json({
      ok: false,
      message: error.message
    });
  }
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
  if (!dbPool) {
    res.status(500).json({
      ok: false,
      error: "DATABASE_URL is not configured"
    });
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

const server = app.listen(port, "0.0.0.0", async () => {
  console.log(`Final Tier 2 app listening on port ${port}`);

  try {
    await ensureProductsTable();
    console.log("Products table is ready");
  } catch (error) {
    console.error("Database initialization failed:", error.message);
  }
});

const shutdown = async () => {
  console.log("Shutting down application...");

  server.close(async () => {
    if (dbPool) {
      await dbPool.end();
    }

    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);