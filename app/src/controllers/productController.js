import os from 'node:os';
import * as dataSource from '../services/dataSource.js';

function meta() {
  return { hostname: os.hostname(), source: dataSource.isPostgres() ? 'postgresql' : 'in-memory' };
}

export async function list(_req, res, next) {
  try {
    const items = await dataSource.getAll();
    res.json({ data: items, ...meta() });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const item = await dataSource.getById(req.params.id);
    if (!item) {
      res.status(404).json({ message: 'Not found', ...meta() });
      return;
    }
    res.json({ data: item, ...meta() });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const payload = pickBody(req.body);
    if (req.file) payload.imageUrl = `/uploads/${req.file.filename}`;
    const item = await dataSource.create(payload);
    res.status(201).json({ data: item, ...meta() });
  } catch (err) {
    next(err);
  }
}

export async function put(req, res, next) {
  try {
    const payload = pickBody(req.body);
    if (req.file) payload.imageUrl = `/uploads/${req.file.filename}`;
    const item = await dataSource.replace(req.params.id, payload);
    if (!item) {
      res.status(404).json({ message: 'Not found', ...meta() });
      return;
    }
    res.json({ data: item, ...meta() });
  } catch (err) {
    next(err);
  }
}

export async function patch(req, res, next) {
  try {
    const payload = {};
    for (const key of ['name', 'price', 'color', 'description']) {
      if (key in req.body) payload[key] = req.body[key];
    }
    if (req.file) payload.imageUrl = `/uploads/${req.file.filename}`;
    const item = await dataSource.patch(req.params.id, payload);
    if (!item) {
      res.status(404).json({ message: 'Not found', ...meta() });
      return;
    }
    res.json({ data: item, ...meta() });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const item = await dataSource.remove(req.params.id);
    if (!item) {
      res.status(404).json({ message: 'Not found', ...meta() });
      return;
    }
    res.json({ data: item, ...meta() });
  } catch (err) {
    next(err);
  }
}

function pickBody(body) {
  const { name, price, color, description } = body;
  return { name, price, color, description };
}
