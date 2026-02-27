import { Hono } from 'hono';
import { ProductsController } from '../controllers/products.controller.js';

const productsRoutes = new Hono();

// Get all products with pagination and filtering
productsRoutes.get('/', ProductsController.getProducts);

// Get a single product
productsRoutes.get('/:id', ProductsController.getProduct);

// Create a new product
productsRoutes.post('/', ProductsController.createProduct);

// Update a product
productsRoutes.put('/:id', ProductsController.updateProduct);

// Delete a product
productsRoutes.delete('/:id', ProductsController.deleteProduct);

// Bulk operations
productsRoutes.post('/bulk', ProductsController.bulkCreateProducts);

export { productsRoutes };
