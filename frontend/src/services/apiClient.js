const API_BASE_URL = 'http://localhost:3001/api';

export class ApiClient {
  static async getGameConfig() {
    const response = await fetch(`${API_BASE_URL}/config`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch game config: ${response.statusText}`);
    return await response.json();
  }

  static async getWorldState() {
    const response = await fetch(`${API_BASE_URL}/world`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch world state`);
    return await response.json();
  }

  static async useConsumable(itemName, currentHealth) {
    const response = await fetch(`${API_BASE_URL}/consumables/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemName, currentHealth })
    });
    return await response.json();
  }

  static async pickupGroundDrop(dropId) {
    const response = await fetch(`${API_BASE_URL}/world/pickup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dropId })
    });
    return await response.json();
  }

  static async dropItemOnGround(itemName, count, position) {
    const response = await fetch(`${API_BASE_URL}/world/drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemName, count, position })
    });
    return await response.json();
  }

  static async claimLootBoxItem(boxId, slotId) {
    const response = await fetch(`${API_BASE_URL}/world/lootbox/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId, slotId })
    });
    return await response.json();
  }

  static async requestZombieLoot(position) {
    const response = await fetch(`${API_BASE_URL}/world/zombie-drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position })
    });
    return await response.json();
  }

  static async updateEquippedState(itemName) {
    try {
      await fetch(`${API_BASE_URL}/player/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'local_player', itemName })
      });
    } catch (e) {}
  }
}