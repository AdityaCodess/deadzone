import * as THREE from 'three';

export class InteractionManager {
  constructor(scene, camera, inventoryManager) {
    this.scene = scene;
    this.camera = camera;
    this.inventoryManager = inventoryManager;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.0; // Max interaction distance in meters
    this.center = new THREE.Vector2(0, 0);

    this.currentInteractable = null;
    this.promptUI = null;

    this._buildUI();
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

  update(isActive) {
    // If inventory is open or player is dead, don't show prompts
    if (!isActive) {
      this.promptUI.style.display = 'none';
      this.currentInteractable = null;
      return;
    }

    this.raycaster.setFromCamera(this.center, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    const hit = intersects.find(intersect => intersect.object.userData.isInteractable);

    if (hit) {
      // Find the root object that holds the actual item data
      let interactRoot = hit.object;
      while (interactRoot.parent && !interactRoot.userData.itemName) {
        interactRoot = interactRoot.parent;
      }

      this.currentInteractable = interactRoot;
      const actionText = interactRoot.userData.type === 'pickup' ? 'Pick up' : 'Open';
      this.promptUI.innerText = `[E] ${actionText} ${interactRoot.userData.itemName}`;
      this.promptUI.style.display = 'block';
    } else {
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
        this.currentInteractable = null;
        this.promptUI.style.display = 'none';
      }
    }
    
    // Future logic for doors or loot boxes goes here:
    // else if (itemType === 'door') { ... }
  }
}