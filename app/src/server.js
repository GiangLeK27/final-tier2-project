import crypto from "node:crypto";
import express from "express";
import pg from "pg";
import client from "prom-client";

const app = express();
const port = Number(process.env.PORT || 3000);
const version = process.env.APP_VERSION || "local-dev";
const databaseUrl = process.env.DATABASE_URL;
const dbPool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;

const seedProducts = [
  {
    name: "iPhone 14 Pro Max",
    price: 1099,
    color: "space-black",
    description: "6.7-inch Super Retina XDR display, A16 Bionic chip, pro camera system.",
    imageUrl: ""
  },
  {
    name: "iPhone SE (3rd generation)",
    price: 429,
    color: "black",
    description: "Compact design with A15 Bionic, great value for everyday use.",
    imageUrl: ""
  },
  {
    name: "MacBook Pro 14-inch (M2 Pro)",
    price: 1999,
    color: "silver",
    description: "Powerful M2 Pro chip, Liquid Retina XDR display, and strong battery life.",
    imageUrl: ""
  },
  {
    name: "MacBook Air 13-inch (M2)",
    price: 1199,
    color: "midnight",
    description: "Thin, light, quiet, and suitable for study or daily work.",
    imageUrl: ""
  },
  {
    name: "iPad Pro 11-inch (M4)",
    price: 799,
    color: "silver",
    description: "Premium tablet for creative work and productivity.",
    imageUrl: ""
  },
  {
    name: "Apple Watch Series 9",
    price: 399,
    color: "starlight",
    description: "Smart health tracking with a bright display and fast chip.",
    imageUrl: ""
  }
];

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numericPrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizePayload(body, { allowPartial = false } = {}) {
  const source = body && typeof body === "object" ? body : {};
  const payload = {};
  const errors = [];

  if (!allowPartial || Object.hasOwn(source, "name")) {
    const name = String(source.name ?? "").trim();
    if (!name) {
      errors.push("name is required");
    } else {
      payload.name = name;
    }
  }

  if (!allowPartial || Object.hasOwn(source, "price")) {
    const price = numericPrice(source.price);
    if (price === null) {
      errors.push("price must be a non-negative number");
    } else {
      payload.price = price;
    }
  }

  if (!allowPartial || Object.hasOwn(source, "color")) {
    const color = String(source.color ?? "").trim();
    if (!color) {
      errors.push("color is required");
    } else {
      payload.color = color;
    }
  }

  if (!allowPartial || Object.hasOwn(source, "description")) {
    payload.description = String(source.description ?? "").trim();
  }

  if (!allowPartial || Object.hasOwn(source, "imageUrl")) {
    payload.imageUrl = String(source.imageUrl ?? "").trim();
  }

  return { payload, errors };
}

function rowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    color: row.color,
    description: row.description || "",
    imageUrl: row.image_url || ""
  };
}

async function ensureSchema() {
  if (!dbPool) {
    console.warn("DATABASE_URL is not configured. Product persistence is unavailable.");
    return;
  }

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
      color TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const countResult = await dbPool.query("SELECT COUNT(*)::int AS total FROM products");
  if (countResult.rows[0].total === 0) {
    for (const product of seedProducts) {
      await dbPool.query(
        `INSERT INTO products (id, name, price, color, description, image_url)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [crypto.randomUUID(), product.name, product.price, product.color, product.description, product.imageUrl]
      );
    }
  }
}

async function fetchProducts() {
  if (!dbPool) {
    return [];
  }

  const result = await dbPool.query(`
    SELECT id, name, price, color, description, image_url
    FROM products
    ORDER BY created_at DESC, name ASC
  `);
  return result.rows.map(rowToProduct);
}

async function fetchProduct(id) {
  if (!dbPool) {
    return null;
  }

  const result = await dbPool.query(
    `SELECT id, name, price, color, description, image_url
     FROM products
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ? rowToProduct(result.rows[0]) : null;
}

async function insertProduct(payload) {
  const id = crypto.randomUUID();
  const result = await dbPool.query(
    `INSERT INTO products (id, name, price, color, description, image_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, price, color, description, image_url`,
    [id, payload.name, payload.price, payload.color, payload.description || "", payload.imageUrl || ""]
  );
  return rowToProduct(result.rows[0]);
}

async function replaceProduct(id, payload) {
  const result = await dbPool.query(
    `UPDATE products
     SET name = $2,
         price = $3,
         color = $4,
         description = $5,
         image_url = $6,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, price, color, description, image_url`,
    [id, payload.name, payload.price, payload.color, payload.description || "", payload.imageUrl || ""]
  );
  return result.rows[0] ? rowToProduct(result.rows[0]) : null;
}

async function patchProduct(id, payload) {
  const current = await fetchProduct(id);
  if (!current) {
    return null;
  }

  return replaceProduct(id, {
    name: payload.name ?? current.name,
    price: payload.price ?? current.price,
    color: payload.color ?? current.color,
    description: payload.description ?? current.description,
    imageUrl: payload.imageUrl ?? current.imageUrl
  });
}

async function deleteProduct(id) {
  const result = await dbPool.query(
    `DELETE FROM products
     WHERE id = $1
     RETURNING id, name, price, color, description, image_url`,
    [id]
  );
  return result.rows[0] ? rowToProduct(result.rows[0]) : null;
}

function statusMeta() {
  return {
    source: "postgresql",
    service: "final-tier2-app",
    version
  };
}

function productsMarkup(products) {
  if (!products.length) {
    return '<p class="empty">Chưa có sản phẩm nào trong PostgreSQL.</p>';
  }

  return products.map((product) => {
    const imageMarkup = product.imageUrl
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
      : `<div class="fallback-image">${escapeHtml(product.name.slice(0, 2).toUpperCase())}</div>`;

    return `<article class="product-card" data-id="${escapeHtml(product.id)}">
      <div class="media">${imageMarkup}</div>
      <div class="product-body">
        <div class="row between align-start">
          <h3>${escapeHtml(product.name)}</h3>
          <span class="price">$${escapeHtml(product.price.toFixed(2))}</span>
        </div>
        <p class="chip">${escapeHtml(product.color)}</p>
        <p class="description">${escapeHtml(product.description || "Không có mô tả")}</p>
        <div class="actions">
          <button type="button" class="ghost edit-btn" data-id="${escapeHtml(product.id)}">Sửa</button>
          <button type="button" class="danger delete-btn" data-id="${escapeHtml(product.id)}">Xóa</button>
        </div>
      </div>
    </article>`;
  }).join("");
}

function pageHtml(products) {
  const initialData = JSON.stringify(products).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sample Mid Products - PostgreSQL</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef4ff;
      --surface: #ffffff;
      --surface-soft: #f7f9fc;
      --text: #152238;
      --muted: #5f6b7a;
      --line: #dbe5f0;
      --primary: #0f62fe;
      --primary-dark: #0847bf;
      --danger: #d92d20;
      --success: #067647;
      --shadow: 0 18px 50px rgba(15, 35, 70, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(15, 98, 254, 0.16), transparent 32rem),
        linear-gradient(135deg, #f7fbff 0%, var(--bg) 100%);
    }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0 56px; }
    .hero {
      display: grid;
      gap: 24px;
      grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
      align-items: stretch;
      margin-bottom: 28px;
    }
    .panel, .stats, .form-card, .catalog { background: rgba(255,255,255,0.94); border: 1px solid rgba(219,229,240,0.9); box-shadow: var(--shadow); border-radius: 28px; }
    .panel { padding: 34px; }
    .eyebrow { margin: 0 0 12px; color: var(--primary); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.82rem; }
    h1 { margin: 0 0 14px; font-size: clamp(2.3rem, 5vw, 4.6rem); line-height: 0.98; letter-spacing: -0.06em; }
    .lead { margin: 0; color: var(--muted); font-size: 1.05rem; line-height: 1.65; max-width: 720px; }
    .badges { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
    .badge { border-radius: 999px; padding: 10px 14px; background: #e8f0ff; color: var(--primary-dark); font-weight: 750; font-size: 0.92rem; }
    .stats { padding: 26px; display: grid; gap: 16px; }
    .stat { padding: 18px; background: var(--surface-soft); border-radius: 22px; border: 1px solid var(--line); }
    .stat strong { display: block; font-size: 2rem; margin-bottom: 4px; }
    .stat span { color: var(--muted); }
    .layout { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 24px; align-items: start; }
    .form-card { padding: 24px; position: sticky; top: 24px; }
    .form-card h2, .catalog h2 { margin: 0 0 8px; font-size: 1.35rem; }
    .form-card p, .catalog-head p { margin: 0 0 20px; color: var(--muted); line-height: 1.55; }
    label { display: grid; gap: 8px; margin-bottom: 14px; font-weight: 750; font-size: 0.92rem; }
    input, textarea {
      width: 100%; border-radius: 16px; border: 1px solid var(--line); padding: 13px 14px; font: inherit; color: inherit; background: #fff;
    }
    textarea { min-height: 104px; resize: vertical; }
    input:focus, textarea:focus { outline: 3px solid rgba(15,98,254,0.16); border-color: var(--primary); }
    .form-actions, .actions, .row { display: flex; gap: 10px; }
    .between { justify-content: space-between; }
    .align-start { align-items: flex-start; }
    button {
      border: 0; border-radius: 16px; padding: 12px 15px; font: inherit; font-weight: 800; cursor: pointer;
      background: var(--primary); color: #fff; transition: transform .18s ease, opacity .18s ease, background .18s ease;
    }
    button:hover { transform: translateY(-1px); }
    button:disabled { cursor: wait; opacity: 0.65; transform: none; }
    .ghost { background: #edf3ff; color: var(--primary-dark); }
    .danger { background: #fff0ef; color: var(--danger); }
    .catalog { padding: 24px; }
    .catalog-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
    .catalog-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .catalog-tools input { min-width: 220px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 18px; }
    .product-card { overflow: hidden; border: 1px solid var(--line); border-radius: 24px; background: #fff; display: flex; flex-direction: column; min-height: 100%; }
    .media { height: 176px; background: linear-gradient(135deg, #dbeafe, #eff6ff); display: grid; place-items: center; overflow: hidden; }
    .media img { width: 100%; height: 100%; object-fit: cover; }
    .fallback-image { font-size: 3rem; font-weight: 900; color: rgba(15,98,254,.58); }
    .product-body { padding: 18px; display: grid; gap: 12px; height: 100%; }
    .product-body h3 { margin: 0; font-size: 1.08rem; line-height: 1.35; }
    .price { font-weight: 950; color: var(--success); white-space: nowrap; }
    .chip { margin: 0; justify-self: start; border-radius: 999px; background: #f3f4f6; padding: 7px 10px; font-size: .82rem; font-weight: 800; }
    .description { margin: 0; color: var(--muted); line-height: 1.58; min-height: 70px; }
    .actions { margin-top: auto; }
    .notice { min-height: 24px; margin: 14px 0 0; font-weight: 800; color: var(--primary-dark); }
    .notice.error { color: var(--danger); }
    .empty { border: 1px dashed var(--line); border-radius: 22px; padding: 28px; color: var(--muted); text-align: center; }
    .footer { margin-top: 24px; color: var(--muted); text-align: center; }
    code { background: #eef2ff; border-radius: 8px; padding: 3px 7px; }
    @media (max-width: 900px) {
      .hero, .layout { grid-template-columns: 1fr; }
      .form-card { position: static; }
      .catalog-head { flex-direction: column; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <article class="panel">
        <p class="eyebrow">Sample Mid UI • PostgreSQL backend</p>
        <h1>Product Catalog</h1>
        <p class="lead">Giao diện web đã được thay bằng màn hình quản lý sản phẩm kiểu sample-mid. Phần deploy Docker, Caddy, PostgreSQL, tag image và CI/CD vẫn bám theo project Final Tier 2 cũ.</p>
        <div class="badges">
          <span class="badge">Image/tag cũ giữ nguyên</span>
          <span class="badge">PostgreSQL</span>
          <span class="badge">CRUD /products</span>
          <span class="badge">/health • /db • /metrics</span>
        </div>
      </article>
      <aside class="stats">
        <div class="stat"><strong id="product-count">${products.length}</strong><span>Sản phẩm hiện có</span></div>
        <div class="stat"><strong>${escapeHtml(version)}</strong><span>APP_VERSION</span></div>
        <div class="stat"><strong>PG</strong><span>Nguồn dữ liệu PostgreSQL</span></div>
      </aside>
    </section>

    <section class="layout">
      <aside class="form-card">
        <h2 id="form-title">Thêm sản phẩm</h2>
        <p>Dữ liệu được lưu trong bảng <code>products</code> trên PostgreSQL.</p>
        <form id="product-form">
          <input type="hidden" id="product-id" />
          <label>Tên sản phẩm<input id="name" name="name" maxlength="180" required /></label>
          <label>Giá<input id="price" name="price" type="number" min="0" step="0.01" required /></label>
          <label>Màu<input id="color" name="color" maxlength="80" required /></label>
          <label>Mô tả<textarea id="description" name="description" maxlength="3000"></textarea></label>
          <label>URL ảnh (tuỳ chọn)<input id="imageUrl" name="imageUrl" type="url" placeholder="https://..." /></label>
          <div class="form-actions">
            <button id="submit-btn" type="submit">Lưu sản phẩm</button>
            <button id="cancel-btn" type="button" class="ghost" hidden>Huỷ sửa</button>
          </div>
        </form>
        <p id="notice" class="notice" aria-live="polite"></p>
      </aside>

      <section class="catalog">
        <div class="catalog-head">
          <div>
            <h2>Danh sách sản phẩm</h2>
            <p>Quản lý nhanh bằng API PostgreSQL mới.</p>
          </div>
          <div class="catalog-tools">
            <input id="search" type="search" placeholder="Tìm theo tên hoặc màu..." />
            <button id="refresh-btn" type="button" class="ghost">Tải lại</button>
          </div>
        </div>
        <div id="product-grid" class="grid">${productsMarkup(products)}</div>
      </section>
    </section>

    <p class="footer">Các endpoint phục vụ báo cáo vẫn có sẵn: <code>/health</code>, <code>/db</code>, <code>/metrics</code>.</p>
  </main>
  <script id="initial-products" type="application/json">${initialData}</script>
  <script>
    const grid = document.getElementById('product-grid');
    const form = document.getElementById('product-form');
    const notice = document.getElementById('notice');
    const search = document.getElementById('search');
    const cancelBtn = document.getElementById('cancel-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const submitBtn = document.getElementById('submit-btn');
    const formTitle = document.getElementById('form-title');
    const count = document.getElementById('product-count');
    let products = JSON.parse(document.getElementById('initial-products').textContent || '[]');

    function esc(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function card(product) {
      const image = product.imageUrl
        ? '<img src="' + esc(product.imageUrl) + '" alt="' + esc(product.name) + '" loading="lazy" />'
        : '<div class="fallback-image">' + esc(product.name.slice(0, 2).toUpperCase()) + '</div>';
      return '<article class="product-card" data-id="' + esc(product.id) + '">' +
        '<div class="media">' + image + '</div>' +
        '<div class="product-body">' +
        '<div class="row between align-start"><h3>' + esc(product.name) + '</h3><span class="price">$' + Number(product.price).toFixed(2) + '</span></div>' +
        '<p class="chip">' + esc(product.color) + '</p>' +
        '<p class="description">' + esc(product.description || 'Không có mô tả') + '</p>' +
        '<div class="actions"><button type="button" class="ghost edit-btn" data-id="' + esc(product.id) + '">Sửa</button><button type="button" class="danger delete-btn" data-id="' + esc(product.id) + '">Xóa</button></div>' +
        '</div></article>';
    }

    function render() {
      const term = search.value.trim().toLowerCase();
      const visible = products.filter((product) => {
        const haystack = [product.name, product.color, product.description].join(' ').toLowerCase();
        return haystack.includes(term);
      });
      grid.innerHTML = visible.length ? visible.map(card).join('') : '<p class="empty">Không tìm thấy sản phẩm phù hợp.</p>';
      count.textContent = String(products.length);
    }

    function setNotice(message, isError = false) {
      notice.textContent = message;
      notice.classList.toggle('error', isError);
    }

    function resetForm() {
      form.reset();
      document.getElementById('product-id').value = '';
      formTitle.textContent = 'Thêm sản phẩm';
      submitBtn.textContent = 'Lưu sản phẩm';
      cancelBtn.hidden = true;
    }

    function loadIntoForm(product) {
      document.getElementById('product-id').value = product.id;
      document.getElementById('name').value = product.name;
      document.getElementById('price').value = product.price;
      document.getElementById('color').value = product.color;
      document.getElementById('description').value = product.description || '';
      document.getElementById('imageUrl').value = product.imageUrl || '';
      formTitle.textContent = 'Cập nhật sản phẩm';
      submitBtn.textContent = 'Lưu thay đổi';
      cancelBtn.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function readJson(response) {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || (Array.isArray(data.errors) ? data.errors.join(', ') : 'Yêu cầu thất bại'));
      }
      return data;
    }

    async function refreshProducts() {
      refreshBtn.disabled = true;
      try {
        const data = await readJson(await fetch('/products'));
        products = data.data || [];
        render();
        setNotice('Đã tải lại dữ liệu từ PostgreSQL.');
      } catch (error) {
        setNotice(error.message, true);
      } finally {
        refreshBtn.disabled = false;
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submitBtn.disabled = true;
      const id = document.getElementById('product-id').value;
      const payload = {
        name: document.getElementById('name').value,
        price: document.getElementById('price').value,
        color: document.getElementById('color').value,
        description: document.getElementById('description').value,
        imageUrl: document.getElementById('imageUrl').value
      };

      try {
        await readJson(await fetch(id ? '/products/' + encodeURIComponent(id) : '/products', {
          method: id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }));
        await refreshProducts();
        setNotice(id ? 'Đã cập nhật sản phẩm.' : 'Đã thêm sản phẩm.');
        resetForm();
      } catch (error) {
        setNotice(error.message, true);
      } finally {
        submitBtn.disabled = false;
      }
    });

    grid.addEventListener('click', async (event) => {
      const editButton = event.target.closest('.edit-btn');
      const deleteButton = event.target.closest('.delete-btn');
      if (editButton) {
        const product = products.find((item) => item.id === editButton.dataset.id);
        if (product) loadIntoForm(product);
      }
      if (deleteButton) {
        deleteButton.disabled = true;
        try {
          await readJson(await fetch('/products/' + encodeURIComponent(deleteButton.dataset.id), { method: 'DELETE' }));
          await refreshProducts();
          setNotice('Đã xóa sản phẩm.');
        } catch (error) {
          setNotice(error.message, true);
          deleteButton.disabled = false;
        }
      }
    });

    search.addEventListener('input', render);
    cancelBtn.addEventListener('click', resetForm);
    refreshBtn.addEventListener('click', refreshProducts);
  </script>
</body>
</html>`;
}

app.get("/", async (_req, res, next) => {
  try {
    const products = await fetchProducts();
    res.type("html").send(pageHtml(products));
  } catch (error) {
    next(error);
  }
});

app.get("/products", async (_req, res, next) => {
  try {
    const products = await fetchProducts();
    res.json({ data: products, ...statusMeta() });
  } catch (error) {
    next(error);
  }
});

app.get("/products/:id", async (req, res, next) => {
  try {
    const product = await fetchProduct(req.params.id);
    if (!product) {
      res.status(404).json({ message: "Not found", ...statusMeta() });
      return;
    }
    res.json({ data: product, ...statusMeta() });
  } catch (error) {
    next(error);
  }
});

app.post("/products", async (req, res, next) => {
  try {
    if (!dbPool) {
      res.status(500).json({ message: "DATABASE_URL is not configured", ...statusMeta() });
      return;
    }

    const { payload, errors } = normalizePayload(req.body);
    if (errors.length) {
      res.status(400).json({ errors, ...statusMeta() });
      return;
    }

    const product = await insertProduct(payload);
    res.status(201).json({ data: product, ...statusMeta() });
  } catch (error) {
    next(error);
  }
});

app.put("/products/:id", async (req, res, next) => {
  try {
    if (!dbPool) {
      res.status(500).json({ message: "DATABASE_URL is not configured", ...statusMeta() });
      return;
    }

    const { payload, errors } = normalizePayload(req.body);
    if (errors.length) {
      res.status(400).json({ errors, ...statusMeta() });
      return;
    }

    const product = await replaceProduct(req.params.id, payload);
    if (!product) {
      res.status(404).json({ message: "Not found", ...statusMeta() });
      return;
    }
    res.json({ data: product, ...statusMeta() });
  } catch (error) {
    next(error);
  }
});

app.patch("/products/:id", async (req, res, next) => {
  try {
    if (!dbPool) {
      res.status(500).json({ message: "DATABASE_URL is not configured", ...statusMeta() });
      return;
    }

    const { payload, errors } = normalizePayload(req.body, { allowPartial: true });
    if (errors.length) {
      res.status(400).json({ errors, ...statusMeta() });
      return;
    }

    const product = await patchProduct(req.params.id, payload);
    if (!product) {
      res.status(404).json({ message: "Not found", ...statusMeta() });
      return;
    }
    res.json({ data: product, ...statusMeta() });
  } catch (error) {
    next(error);
  }
});

app.delete("/products/:id", async (req, res, next) => {
  try {
    if (!dbPool) {
      res.status(500).json({ message: "DATABASE_URL is not configured", ...statusMeta() });
      return;
    }

    const product = await deleteProduct(req.params.id);
    if (!product) {
      res.status(404).json({ message: "Not found", ...statusMeta() });
      return;
    }
    res.json({ data: product, ...statusMeta() });
  } catch (error) {
    next(error);
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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error", detail: error.message, ...statusMeta() });
});

await ensureSchema().catch((error) => {
  console.error("Failed to initialize products table:", error.message);
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Final Tier 2 app listening on port ${port}`);
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
