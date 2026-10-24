import * as THREE from 'three';

export class InteractionManager {
  constructor(scene, camera, inventoryManager) {
    this.scene = scene;
    this.camera = camera;
    this.inventoryManager = inventoryManager;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.0; 
    this.center = new THREE.Vector2(0, 0);

    this.interactables = [];
    this.currentInteractable = null;
    this.promptUI = null;
    this._checkTimer = 0;

    this._buildUI();
  }

  registerInteractable(object3D) {
    this.interactables.push(object3D);
  }

  _buildUI() {
    this.promptUI = document.createElement('div');
    this.promptUI.style.cssText = `
      position: fixed; top: 55%; left: 50%; transform: translateX(-50%);
      color: #fff; font-family: monospace; font-size: 1.2rem; font-weight: bold;
      text-shadow: 0px 2px 4px rgba(0,0,0,0.9), 0px 0px 10px rgba(0,0,0,0.8); 
      display: none; z-index: 100; pointer-events: none;
    `;
    document.body.appendChild(this.promptUI);
  }

  update(isActive, delta = 0.016) {
    if (!isActive || this.interactables.length === 0) {
      if (this.promptUI.style.display !== 'none') {
        this.promptUI.style.display = 'none';
      }
      this.currentInteractable = null;
      return;
    }

    // Throttle raycast to ~10Hz instead of 60Hz
    this._checkTimer += delta;
    if (this._checkTimer < 0.1) return;
    this._checkTimer = 0;

    this.raycaster.setFromCamera(this.center, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactables, true);
    
    const hit = intersects.find(intersect => intersect.object.userData.isInteractable);

    if (hit) {
      let interactRoot = hit.object;
      while (interactRoot.parent && !interactRoot.userData.itemName) {
        interactRoot = interactRoot.parent;
      }

      if (this.currentInteractable !== interactRoot) {
        this.currentInteractable = interactRoot;
        const actionText = interactRoot.userData.type === 'pickup' ? 'Pick up' : 'Open';
        this.promptUI.innerText = `[E] ${actionText} ${interactRoot.userData.itemName}`;
        this.promptUI.style.display = 'block';
      }
    } else if (this.currentInteractable) {
      this.currentInteractable = null;
      this.promptUI.style.display = 'none';
    }
  }

  interact() {
    if (!this.currentInteractable) return;

    const itemType = this.currentInteractable.userData.type;
    const itemName = this.currentInteractable.userData.itemName;

    if (itemType === 'pickup') {
      const added = this.inventoryManager.addItem(itemName);
      if (added) {
        this.scene.remove(this.currentInteractable);
        const idx = this.interactables.indexOf(this.currentInteractable);
        if (idx !== -1) this.interactables.splice(idx, 1);
        this.currentInteractable = null;
        this.promptUI.style.display = 'none';
      }
    }
  }
}