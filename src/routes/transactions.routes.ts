import { Hono } from 'hono';
import { TransactionsController } from '../controllers/transactions.controller.js';

const transactions = new Hono();

// GET /api/transactions - Get all transactions
transactions.get('/', TransactionsController.getTransactions);

// GET /api/transactions/:id - Get a single transaction
transactions.get('/:id', TransactionsController.getTransaction);

// POST /api/transactions - Create a new transaction
transactions.post('/', TransactionsController.createTransaction);

// PUT /api/transactions/:id - Update a transaction
transactions.put('/:id', TransactionsController.updateTransaction);

// DELETE /api/transactions/:id - Delete a transaction
transactions.delete('/:id', TransactionsController.deleteTransaction);

// POST /api/transactions/bulk - Bulk create transactions
transactions.post('/bulk', TransactionsController.bulkCreateTransactions);

// GET /api/transactions/export - Export transactions as CSV or JSON
transactions.get('/export', TransactionsController.exportTransactions);

export { transactions as transactionsRoutes };
