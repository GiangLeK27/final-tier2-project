import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pool = null;
let inMemory = [];
let postgresReady = false;
let lastDatabaseError = null;

function createAppleProducts() {
  return [
    {
      name: 'iPhone 14 Pro Max',
      price: 1099,
      color: 'space-black',
      description: '6.7-inch Super Retina XDR display, A16 Bionic chip, pro camera system.',
      imageUrl: ''
    },
    {
      name: 'iPhone SE (3rd generation)',
      price: 429,
      color: 'black',
      description: 'Compact design with A15 Bionic, great value for everyday use.',
      imageUrl: ''
    },
    {
      name: 'MacBook Pro 14-inch (M2 Pro)',
      price: 1999,
      color: 'silver',
      description: 'Powerful M2 Pro chip, Liquid Retina XDR display, up to 18-hour battery life.',
      imageUrl: ''
    },
    {
      name: 'MacBook Air 13-inch (M2)',
      price: 1199,
      color: 'midnight',
      description: 'Thin and light with M2 chip, silent fanless design and great battery life.',
      imageUrl: ''
    },
    {
      name: 'iPad Pro 11-inch (M4)',
      price: 799,
      color: 'silver',
      description: 'M4 chip, Liquid Retina display with ProMotion, powerful for creative work.',
      imageUrl: ''
    },
    {
      name: 'Apple Watch Series 9',
      price: 399,
      color: 'starlight',
      description: 'Faster S9 chip, more accurate sensors, and brighter display.',
      imageUrl: ''
    },
    {
      name: 'AirPods Pro (2nd generation)',
      price: 249,
      color: 'white',
      description: 'Active Noise Cancellation, improved audio quality and longer battery.',
      imageUrl: ''
    },
    {
      name: 'HomePod (2nd generation)',
      price: 299,
      color: 'white',
      description: 'High-fidelity audio with computational audio and Siri smart home control.',
      imageUrl: ''
    },
    {
      name: 'iPhone 13',
      price: 699,
      color: 'blue',
      description: 'A great all-rounder with excellent battery life and dual-camera system.',
      imageUrl: ''
    },
    {
      name: 'iPad (10th generation)',
      price: 449,
      color: 'pink',
      description: 'Updated design, larger display, and capable for school and home use.',
      imageUrl: ''
    }
  ];
}

function memorySeed() {
  return createAppleProducts().map((product) => ({ id: uuidv4(), ...product }));
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    color: row.color,
    description: row.description || null,
    imageUrl: row.image_url || ''
  };
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      color TEXT NOT NULL,
      description TEXT,
      image_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function seedPostgres() {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM products');
  if (result.rows[0].count > 0) return;

  const products = createAppleProducts();
  for (const product of products) {
    await pool.query(
      `INSERT INTO products (id, name, price, color, description, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), product.name, product.price, product.color, product.description || null, product.imageUrl || '']
    );
  }
}

export async function init() {
  inMemory = memorySeed();
  postgresReady = false;
  lastDatabaseError = null;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    lastDatabaseError = 'DATABASE_URL is not configured';
    console.warn(`${lastDatabaseError}. Falling back to in-memory data.`);
    return;
  }

  pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('SELECT 1');
    await ensureSchema();
    await seedPostgres();
    postgresReady = true;
    console.log('Connected to PostgreSQL — using PostgreSQL as data source.');
  } catch (error) {
    lastDatabaseError = error.message;
    postgresReady = false;
    console.warn(`Failed to initialize PostgreSQL: ${error.message}. Falling back to in-memory data.`);
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }
  }
}

export function isPostgres() {
  return postgresReady;
}

export async function getAll() {
  if (postgresReady) {
    const result = await pool.query('SELECT id, name, price, color, description, image_url FROM products ORDER BY created_at ASC');
    return result.rows.map(mapRow);
  }
  return inMemory.slice();
}

export async function getById(id) {
  if (postgresReady) {
    const result = await pool.query('SELECT id, name, price, color, description, image_url FROM products WHERE id = $1', [id]);
    return mapRow(result.rows[0]);
  }
  return inMemory.find((product) => product.id === id) || null;
}

export async function create(payload) {
  if (postgresReady) {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO products (id, name, price, color, description, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, price, color, description, image_url`,
      [id, payload.name, payload.price, payload.color, payload.description || null, payload.imageUrl || '']
    );
    return mapRow(result.rows[0]);
  }
  const item = { id: uuidv4(), ...payload, imageUrl: payload.imageUrl || '' };
  inMemory.push(item);
  return item;
}

async function removeUploadedFile(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
  const filePath = path.join(__dirname, '..', 'public', imageUrl.substring(1));
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore missing files.
  }
}

export async function replace(id, payload) {
  if (postgresReady) {
    const previous = await getById(id);
    if (!previous) return null;
    if (payload.imageUrl) await removeUploadedFile(previous.imageUrl);
    const result = await pool.query(
      `UPDATE products
       SET name = $2,
           price = $3,
           color = $4,
           description = $5,
           image_url = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, price, color, description, image_url`,
      [id, payload.name, payload.price, payload.color, payload.description || null, payload.imageUrl || previous.imageUrl || '']
    );
    return mapRow(result.rows[0]);
  }

  const index = inMemory.findIndex((product) => product.id === id);
  if (index === -1) return null;
  const previous = inMemory[index];
  if (payload.imageUrl) await removeUploadedFile(previous.imageUrl);
  const item = { id, ...payload, imageUrl: payload.imageUrl || previous.imageUrl || '' };
  inMemory[index] = item;
  return item;
}

export async function patch(id, payload) {
  if (postgresReady) {
    const previous = await getById(id);
    if (!previous) return null;
    if (payload.imageUrl) await removeUploadedFile(previous.imageUrl);

    const next = {
      name: payload.name ?? previous.name,
      price: payload.price ?? previous.price,
      color: payload.color ?? previous.color,
      description: payload.description ?? previous.description,
      imageUrl: payload.imageUrl ?? previous.imageUrl
    };

    const result = await pool.query(
      `UPDATE products
       SET name = $2,
           price = $3,
           color = $4,
           description = $5,
           image_url = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, price, color, description, image_url`,
      [id, next.name, next.price, next.color, next.description || null, next.imageUrl || '']
    );
    return mapRow(result.rows[0]);
  }

  const item = inMemory.find((product) => product.id === id);
  if (!item) return null;
  if (payload.imageUrl) await removeUploadedFile(item.imageUrl);
  Object.assign(item, payload);
  return item;
}

export async function remove(id) {
  if (postgresReady) {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING id, name, price, color, description, image_url',
      [id]
    );
    const deleted = mapRow(result.rows[0]);
    if (deleted) await removeUploadedFile(deleted.imageUrl);
    return deleted;
  }

  const index = inMemory.findIndex((product) => product.id === id);
  if (index === -1) return null;
  const [deleted] = inMemory.splice(index, 1);
  await removeUploadedFile(deleted.imageUrl);
  return deleted;
}

export async function health() {
  if (!postgresReady || !pool) {
    return { ok: false, source: 'in-memory', error: lastDatabaseError || 'PostgreSQL is unavailable' };
  }

  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    return { ok: true, source: 'postgresql', database_time: result.rows[0].current_time };
  } catch (error) {
    return { ok: false, source: 'postgresql', error: error.message };
  }
}

export async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
