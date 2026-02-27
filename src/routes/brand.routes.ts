import { Hono } from 'hono';
import { BrandController } from '../controllers/brand.controller.js';

const brandRoutes = new Hono();

// All brand routes require authentication (handled by tenant middleware in index.ts)
brandRoutes.get('/profile', BrandController.getProfile);
brandRoutes.put('/settings', BrandController.updateSettings);
brandRoutes.get('/analytics', BrandController.getAnalytics);
brandRoutes.get('/dashboard', BrandController.getDashboardStats);

export { brandRoutes };
