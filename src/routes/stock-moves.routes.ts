import { Hono } from 'hono';
import { StockMovesController } from '../controllers/stock-moves.controller.js';

const stockMoves = new Hono();

// GET /api/stock-moves - Get all stock moves
stockMoves.get('/', StockMovesController.getStockMoves);

// GET /api/stock-moves/:id - Get a single stock move
stockMoves.get('/:id', StockMovesController.getStockMove);

// POST /api/stock-moves - Create a new stock move
stockMoves.post('/', StockMovesController.createStockMove);

// PUT /api/stock-moves/:id - Update a stock move
stockMoves.put('/:id', StockMovesController.updateStockMove);

// DELETE /api/stock-moves/:id - Delete a stock move
stockMoves.delete('/:id', StockMovesController.deleteStockMove);

// POST /api/stock-moves/bulk - Bulk create stock moves
stockMoves.post('/bulk', StockMovesController.bulkCreateStockMoves);

// GET /api/stock-moves/summary - Get stock summary
stockMoves.get('/summary', StockMovesController.getStockSummary);

export { stockMoves as stockMovesRoutes };
