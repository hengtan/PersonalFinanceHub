// backend/src/api/routes/dashboard.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import { DashboardController } from '../controllers/dashboard.controller';
import { dashboardQuerySchema } from '../validators/dashboard.validator';

const router = Router();
const dashboardController = new DashboardController();

// All dashboard routes require authentication
router.use(authenticate);

router.get('/', validate({ query: dashboardQuerySchema }), dashboardController.getDashboard);
router.get('/summary', dashboardController.getSummary);
router.get('/categories', dashboardController.getCategorySpending);
router.get('/trends', dashboardController.getTrends);

export { router as dashboardRoutes };