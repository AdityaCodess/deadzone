import { gameConfig } from '../config/gameConfig.js';

export class ItemRegistry {
  static getWeapon(name) {
    return gameConfig.weapons[name] || null;
  }

  static getConsumable(name) {
    return gameConfig.consumables[name] || null;
  }

  static applyConsumable(name, currentHealth) {
    const item = this.getConsumable(name);
    if (!item) return { valid: false, reason: 'Invalid consumable' };

    if (item.type === 'heal') {
      const maxHealth = gameConfig.player.maxHealth;
      if (currentHealth >= maxHealth) {
        return { valid: false, reason: 'Already at full health' };
      }
      const newHealth = Math.min(maxHealth, currentHealth + item.healAmount);
      return {
        valid: true,
        itemName: name,
        healed: newHealth - currentHealth,
        newHealth
      };
    }

    return { valid: false, reason: 'Unhandled consumable type' };
  }
}