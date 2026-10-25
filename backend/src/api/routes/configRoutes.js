import { Router } from 'express';
import {
  getConfig,
  getWorldStateEndpoint,
  getConsumableByName,
  useConsumableEndpoint,
  pickupGroundDropEndpoint,
  dropItemEndpoint,
  claimLootBoxItemEndpoint,
  zombieDeathLootEndpoint,
  setPlayerEquippedEndpoint
} from '../controllers/configController.js';
import { noCacheMiddleware } from '../middlewares/errorHandler.js';

const router = Router();

router.get('/config', noCacheMiddleware, getConfig);
router.get('/world', noCacheMiddleware, getWorldStateEndpoint);
router.get('/consumables/:itemName', noCacheMiddleware, getConsumableByName);
router.post('/consumables/use', useConsumableEndpoint);

// Authoritative Loot & Multiplayer Lootbox Endpoints
router.post('/world/pickup', pickupGroundDropEndpoint);
router.post('/world/drop', dropItemEndpoint);
router.post('/world/lootbox/claim', claimLootBoxItemEndpoint);
router.post('/world/zombie-drop', zombieDeathLootEndpoint);
router.post('/player/equip', setPlayerEquippedEndpoint);

export default router;