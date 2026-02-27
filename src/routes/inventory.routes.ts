import { Hono } from 'hono';
import { InventoryController } from '../controllers/inventory.controller.js';

const inventory = new Hono();

// GET /api/inventory - Get inventory with pagination and filtering
inventory.get('/', InventoryController.getInventory);

// GET /api/inventory/:sku - Get single inventory item with history
inventory.get('/:sku', InventoryController.getInventoryItem);

// GET /api/inventory/low-stock - Get low stock items
inventory.get('/low-stock', InventoryController.getLowStockItems);

// GET /api/inventory/negative-stock - Get negative stock items
inventory.get('/negative-stock', InventoryController.getNegativeStockItems);

// GET /api/inventory/value-summary - Get inventory value summary
inventory.get('/value-summary', InventoryController.getInventoryValueSummary);

// GET /api/inventory/top-by-value - Get top items by inventory value
inventory.get('/top-by-value', InventoryController.getTopItemsByValue);

export { inventory as inventoryRoutes };
