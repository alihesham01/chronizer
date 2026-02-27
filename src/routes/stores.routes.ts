import { Hono } from 'hono';
import { StoresController } from '../controllers/stores.controller.js';

const stores = new Hono();

// GET /api/stores - Get all stores
stores.get('/', StoresController.getStores);

// GET /api/stores/:id - Get a single store
stores.get('/:id', StoresController.getStore);

// POST /api/stores - Create a new store
stores.post('/', StoresController.createStore);

// PUT /api/stores/:id - Update a store
stores.put('/:id', StoresController.updateStore);

// DELETE /api/stores/:id - Delete a store
stores.delete('/:id', StoresController.deleteStore);

// POST /api/stores/bulk - Bulk create stores
stores.post('/bulk', StoresController.bulkCreateStores);

export { stores as storesRoutes };
