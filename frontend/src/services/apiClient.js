const API_BASE_URL = 'http://localhost:3001/api';

export class ApiClient {
  static async getGameConfig() {
    const response = await fetch(`${API_BASE_URL}/config`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch game config: ${response.statusText}`);
    }
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
}