import { gameConfig } from '../config/gameConfig.js';
import { ItemRegistry } from '../game/ItemRegistry.js';

export const fetchFullGameConfig = () => {
  return gameConfig;
};

export const fetchItemDetails = (category, itemName) => {
  if (category === 'weapons') return ItemRegistry.getWeapon(itemName);
  if (category === 'consumables') return ItemRegistry.getConsumable(itemName);
  return null;
};

export const processConsumableUse = (itemName, currentHealth) => {
  return ItemRegistry.applyConsumable(itemName, currentHealth);
};