import {
  fetchFullGameConfig,
  fetchItemDetails,
  processConsumableUse
} from '../../services/configService.js';
import { worldService } from '../../game/WorldService.js';

export const getConfig = (req, res, next) => {
  try {
    const config = fetchFullGameConfig();
    res.status(200).json({
      ...config,
      worldState: worldService.getWorldState()
    });
  } catch (err) {
    next(err);
  }
};

export const getWorldStateEndpoint = (req, res, next) => {
  try {
    res.status(200).json(worldService.getWorldState());
  } catch (err) {
    next(err);
  }
};

export const getConsumableByName = (req, res, next) => {
  try {
    const { itemName } = req.params;
    const item = fetchItemDetails('consumables', itemName);
    if (!item) {
      return res.status(404).json({ error: `Consumable '${itemName}' not found` });
    }
    res.status(200).json(item);
  } catch (err) {
    next(err);
  }
};

export const useConsumableEndpoint = (req, res, next) => {
  try {
    const { itemName, currentHealth } = req.body;
    const result = processConsumableUse(itemName, Number(currentHealth));
    if (!result.valid) {
      return res.status(400).json(result);
    }
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const pickupGroundDropEndpoint = (req, res, next) => {
  try {
    const { dropId } = req.body;
    const drop = worldService.pickupGroundDrop(dropId);
    if (!drop) {
      return res.status(404).json({ valid: false, reason: 'Item already picked up' });
    }
    res.status(200).json({ valid: true, drop });
  } catch (err) {
    next(err);
  }
};

export const dropItemEndpoint = (req, res, next) => {
  try {
    const { itemName, count, position } = req.body;
    if (!itemName || !Array.isArray(position)) {
      return res.status(400).json({ valid: false, reason: 'Invalid drop payload' });
    }
    const drop = worldService.createGroundDrop(itemName, count, position);
    res.status(200).json({ valid: true, drop });
  } catch (err) {
    next(err);
  }
};

export const claimLootBoxItemEndpoint = (req, res, next) => {
  try {
    const { boxId, slotId } = req.body;
    const result = worldService.claimLootBoxItem(boxId, slotId);
    if (!result.valid) {
      return res.status(409).json(result);
    }
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const zombieDeathLootEndpoint = (req, res, next) => {
  try {
    const { position } = req.body;
    const drop = worldService.rollZombieLoot(position || [0, 0.02, 0]);
    res.status(200).json({ valid: true, drop });
  } catch (err) {
    next(err);
  }
};

export const setPlayerEquippedEndpoint = (req, res, next) => {
  try {
    const { playerId = 'local_player', itemName } = req.body;
    worldService.setPlayerEquipped(playerId, itemName);
    res.status(200).json({ valid: true });
  } catch (err) {
    next(err);
  }
};