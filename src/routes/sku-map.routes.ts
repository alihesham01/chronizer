import { Hono } from 'hono';
import { SkuMapController } from '../controllers/sku-map.controller.js';

const skuMap = new Hono();

// GET /api/sku-map - Get all mappings
skuMap.get('/', SkuMapController.getMappings);

// GET /api/sku-map/groups - Get distinct store groups
skuMap.get('/groups', SkuMapController.getGroups);

// GET /api/sku-map/lookup/:storeGroup/:storeSku - Resolve a store SKU
skuMap.get('/lookup/:storeGroup/:storeSku', SkuMapController.lookupSku);

// POST /api/sku-map - Create a single mapping
skuMap.post('/', SkuMapController.createMapping);

// POST /api/sku-map/bulk - Bulk create mappings
skuMap.post('/bulk', SkuMapController.bulkCreateMappings);

// PUT /api/sku-map/:id - Update a mapping
skuMap.put('/:id', SkuMapController.updateMapping);

// DELETE /api/sku-map/group/:group - Delete all mappings for a store group
skuMap.delete('/group/:group', SkuMapController.deleteGroup);

// DELETE /api/sku-map/:id - Delete a mapping
skuMap.delete('/:id', SkuMapController.deleteMapping);

export { skuMap as skuMapRoutes };
