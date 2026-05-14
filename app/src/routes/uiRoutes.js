import express from 'express';
import os from 'node:os';
import * as dataSource from '../services/dataSource.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const products = await dataSource.getAll();
    res.render('index', {
      products,
      hostname: os.hostname(),
      source: dataSource.isPostgres() ? 'postgresql' : 'in-memory'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
