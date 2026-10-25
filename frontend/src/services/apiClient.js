const API_BASE_URL = '/api';

export class ApiClient {
  static getToken() {
    return localStorage.getItem('deadzone_jwt') || null;
  }

  static setAuth(token, user) {
    localStorage.setItem('deadzone_jwt', token);
    localStorage.setItem('deadzone_user', JSON.stringify(user));
  }

  static clearAuth() {
    localStorage.removeItem('deadzone_jwt');
    localStorage.removeItem('deadzone_user');
  }

  static getSavedUser() {
    try {
      const raw = localStorage.getItem('deadzone_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static async requestOTP(username, email, password) {
    const res = await fetch(`${API_BASE_URL}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
    return data;
  }

  static async verifyOTP(email, otp) {
    const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'OTP verification failed');
    this.setAuth(data.token, data.user);
    return data;
  }

  static async googleLogin(payload) {
    const res = await fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Google login failed');
    this.setAuth(data.token, data.user);
    return data;
  }

  static async getGameConfig() {
    const response = await fetch(`${API_BASE_URL}/config`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch game config`);
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