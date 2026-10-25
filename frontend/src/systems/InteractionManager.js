import * as THREE from 'three';
import { ApiClient } from '../services/apiClient.js';

export class InteractionManager {
  constructor(scene, camera, inventoryManager, onLockChange) {
    this.scene = scene;
    this.camera = camera;
    this.inventoryManager = inventoryManager;
    this.onLockChange = onLockChange;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.5; 
    this.center = new THREE.Vector2(0, 0);

    this.interactables = [];
    this.currentInteractable = null;
    this.promptUI = null;
    this.lootBoxModal = null;
    this.isLootBoxOpen = false;
    this._checkTimer = 0;

    this._buildUI();
  }

  registerInteractable(object3D) {
    this.interactables.push(object3D);
  }

  removeInteractableById(id) {
    const idx = this.interactables.findIndex(obj => obj.userData.dropId === id || obj.userData.boxId === id);
    if (idx !== -1) {
      const [obj] = this.interactables.splice(idx, 1);
      this.scene.remove(obj);
    }
  }

  _buildUI() {
    document.querySelectorAll('#interaction-prompt, #lootbox-modal').forEach(el => el.remove());

    this.promptUI = document.createElement('div');
    this.promptUI.id = 'interaction-prompt';
    this.promptUI.style.cssText = `
      position: fixed; top: 55%; left: 50%; transform: translateX(-50%);
      color: #fff; font-family: monospace; font-size: 1.2rem; font-weight: bold;
      text-shadow: 0px 2px 4px rgba(0,0,0,0.9), 0px 0px 10px rgba(0,0,0,0.8); 
      display: none; z-index: 100; pointer-events: none;
    `;
    document.body.appendChild(this.promptUI);

    this.lootBoxModal = document.createElement('div');
    this.lootBoxModal.id = 'lootbox-modal';
    this.lootBoxModal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 420px; background: #242120; border: 6px solid #5a5654; border-radius: 8px;
      padding: 16px; display: none; flex-direction: column; gap: 12px; z-index: 1100;
      box-shadow: 0 12px 35px rgba(0,0,0,0.9); font-family: monospace; color: #fff;
    `;
    document.body.appendChild(this.lootBoxModal);
  }

  closeLootBox() {
    if (!this.isLootBoxOpen) return;
    this.isLootBoxOpen = false;
    this.lootBoxModal.style.display = 'none';
    if (this.onLockChange) this.onLockChange(true);
  }

  _renderLootBoxModal(boxRoot) {
    const boxId = boxRoot.userData.boxId;
    const items = boxRoot.userData.items || [];

    this.lootBoxModal.innerHTML = '';
    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #444; padding-bottom: 8px;`;
    header.innerHTML = `<span style="font-size: 1.1rem; color: #ffaa44; font-weight: bold;">SUPPLY LOOTBOX (SHARED)</span>`;

    const closeBtn = document.createElement('button');
    closeBtn.innerText = 'CLOSE [ESC/E]';
    closeBtn.style.cssText = `background: #555; color: #fff; border: none; padding: 4px 8px; cursor: pointer; font-family: monospace; border-radius: 4px;`;
    closeBtn.onclick = () => this.closeLootBox();
    header.appendChild(closeBtn);
    this.lootBoxModal.appendChild(header);

    if (items.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.innerText = 'Lootbox is empty!';
      emptyMsg.style.cssText = `color: #888; text-align: center; padding: 20px;`;
      this.lootBoxModal.appendChild(emptyMsg);
      return;
    }

    const list = document.createElement('div');
    list.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;

    items.forEach((slot) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        background: #332f2d; padding: 8px 12px; border-radius: 6px; border: 1px solid #4a4644;
      `;
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${this.inventoryManager._getIconUrl(slot.itemName)}" style="width: 36px; height: 36px; object-fit: contain;" />
          <span style="font-weight: bold;">${slot.itemName.toUpperCase()} <span style="color: #33ff66;">x${slot.count}</span></span>
        </div>
      `;

      const takeBtn = document.createElement('button');
      takeBtn.innerText = 'TAKE';
      takeBtn.style.cssText = `background: #2e8b57; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-family: monospace; font-weight: bold;`;
      takeBtn.onclick = async () => {
        const res = await ApiClient.claimLootBoxItem(boxId, slot.slotId);
        if (res && res.valid) {
          this.inventoryManager.addItem(res.claimed.itemName, res.claimed.count);
          boxRoot.userData.items = res.remainingItems;
          if (res.boxEmpty) {
            this.removeInteractableById(boxId);
            this.closeLootBox();
          } else {
            this._renderLootBoxModal(boxRoot);
          }
        } else {
          // Another player claimed it first
          boxRoot.userData.items = res?.remainingItems || [];
          this._renderLootBoxModal(boxRoot);
        }
      };

      row.appendChild(takeBtn);
      list.appendChild(row);
    });

    this.lootBoxModal.appendChild(list);
  }

  update(isActive, delta = 0.016) {
    if (!isActive || this.isLootBoxOpen || this.interactables.length === 0) {
      if (this.promptUI.style.display !== 'none') {
        this.promptUI.style.display = 'none';
      }
      this.currentInteractable = null;
      return;
    }

    this._checkTimer += delta;
    if (this._checkTimer < 0.1) return;
    this._checkTimer = 0;

    this.raycaster.setFromCamera(this.center, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactables, true);
    const hit = intersects.find(intersect => intersect.object.userData.isInteractable);

    if (hit) {
      let interactRoot = hit.object;
      while (interactRoot.parent && !interactRoot.userData.itemName && interactRoot.userData.type !== 'lootbox') {
        interactRoot = interactRoot.parent;
      }

      if (this.currentInteractable !== interactRoot) {
        this.currentInteractable = interactRoot;
        if (interactRoot.userData.type === 'lootbox') {
          this.promptUI.innerText = `[E] Open Supply Lootbox`;
        } else {
          const countTxt = (interactRoot.userData.count && interactRoot.userData.count > 1) ? ` (x${interactRoot.userData.count})` : '';
          this.promptUI.innerText = `[E] Pick up ${interactRoot.userData.itemName}${countTxt}`;
        }
        this.promptUI.style.display = 'block';
      }
    } else if (this.currentInteractable) {
      this.currentInteractable = null;
      this.promptUI.style.display = 'none';
    }
  }

  async interact() {
    if (this.isLootBoxOpen) {
      this.closeLootBox();
      return;
    }
    if (!this.currentInteractable) return;

    const target = this.currentInteractable;
    const itemType = target.userData.type;

    if (itemType === 'lootbox') {
      // Refresh latest world state so multiplayer lootbox contents are always synced
      try {
        const worldState = await ApiClient.getWorldState();
        const latestBox = worldState.lootBoxes.find(b => b.id === target.userData.boxId);
        if (!latestBox) {
          this.removeInteractableById(target.userData.boxId);
          return;
        }
        target.userData.items = latestBox.items;
      } catch (e) {}

      this.isLootBoxOpen = true;
      this.promptUI.style.display = 'none';
      if (this.onLockChange) this.onLockChange(false);
      this.lootBoxModal.style.display = 'flex';
      this._renderLootBoxModal(target);
      return;
    }

    if (itemType === 'pickup') {
      const dropId = target.userData.dropId;
      const itemName = target.userData.itemName;
      const count = target.userData.count || 1;

      if (dropId) {
        const res = await ApiClient.pickupGroundDrop(dropId);
        if (!res || !res.valid) {
          this.removeInteractableById(dropId);
          return;
        }
      }

      const added = this.inventoryManager.addItem(itemName, count);
      if (added) {
        this.scene.remove(target);
        const idx = this.interactables.indexOf(target);
        if (idx !== -1) this.interactables.splice(idx, 1);
        this.currentInteractable = null;
        this.promptUI.style.display = 'none';
      }
    }
  }
}