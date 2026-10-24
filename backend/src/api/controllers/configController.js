import {
  fetchFullGameConfig,
  fetchItemDetails,
  processConsumableUse
} from '../../services/configService.js';

export const getConfig = (req, res, next) => {
  try {
    const config = fetchFullGameConfig();
    res.status(200).json(config);
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