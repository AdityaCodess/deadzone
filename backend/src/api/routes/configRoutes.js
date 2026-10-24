import { Router } from 'express';
import {
  getConfig,
  getConsumableByName,
  useConsumableEndpoint
} from '../controllers/configController.js';
import { noCacheMiddleware } from '../middlewares/errorHandler.js';

const router = Router();

// GET http://localhost:3001/api/config
router.get('/config', noCacheMiddleware, getConfig);

// GET http://localhost:3001/api/consumables/:itemName
router.get('/consumables/:itemName', noCacheMiddleware, getConsumableByName);

// POST http://localhost:3001/api/consumables/use
router.post('/consumables/use', useConsumableEndpoint);

export default router;