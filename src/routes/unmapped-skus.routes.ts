import { Hono } from 'hono';
import { UnmappedSkusController } from '../controllers/unmapped-skus.controller.js';

const unmappedSkus = new Hono();

// GET /api/unmapped-skus - List all unmapped SKUs
unmappedSkus.get('/', UnmappedSkusController.list);

// PUT /api/unmapped-skus/:id/resolve - Map or ignore a single unmapped SKU
unmappedSkus.put('/:id/resolve', UnmappedSkusController.resolve);

// POST /api/unmapped-skus/bulk-resolve - Bulk map/ignore unmapped SKUs
unmappedSkus.post('/bulk-resolve', UnmappedSkusController.bulkResolve);

export { unmappedSkus as unmappedSkusRoutes };
