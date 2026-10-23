import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class InventoryManager {
  constructor(startingItems, onEquip, onToggleLock) {
    this.totalSlots = 15; 
    this.items = new Array(this.totalSlots).fill(null);
    
    startingItems.forEach((item, i) => {
      if (i < this.totalSlots) this.items[i] = item;
    });

    this.onEquip = onEquip; 
    this.onToggleLock = onToggleLock; 
    
    this.isOpen = false;
    this.activeHotbarIndex = 0;
    this.inspectedItemName = null;
    this.inspectModel = null;

    this._buildUI();
    this._setupInspectionScene();
    this.render();
    
    if (this.items[0]) {
      this.onEquip(this.items[0]);
      this.inspectItem(this.items[0]);
    }
  }

  _buildUI() {
    document.querySelectorAll('#inventory-hotbar, #full-inventory').forEach(el => el.remove());

    this.hotbarContainer = document.createElement('div');
    this.hotbarContainer.id = 'inventory-hotbar';
    this.hotbarContainer.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 10px; z-index: 900;
    `;
    document.body.appendChild(this.hotbarContainer);

    this.modalContainer = document.createElement('div');
    this.modalContainer.id = 'full-inventory';
    this.modalContainer.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 750px; background-color: #2b2726; 
      border: 12px solid #4a4d4e; border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.9);
      padding: 15px; display: none; flex-direction: column; z-index: 1000;
    `;

    const corners = ['top: -12px; left: -12px;', 'top: -12px; right: -12px;', 'bottom: -12px; left: -12px;', 'bottom: -12px; right: -12px;'];
    corners.forEach(pos => {
      const corner = document.createElement('div');
      corner.style.cssText = `position: absolute; ${pos} width: 24px; height: 24px; background: #666a6b; border-radius: 4px; box-shadow: inset 1px 1px 2px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.5);`;
      this.modalContainer.appendChild(corner);
    });

    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #666a6b; padding-bottom: 10px; margin-bottom: 15px;`;
    
    const decoration = document.createElement('div');
    decoration.style.cssText = `width: 100px; height: 20px; background: #4a4d4e; border-radius: 4px;`;
    header.appendChild(decoration);

    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = `width: 24px; height: 24px; background: #666a6b; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-family: sans-serif; font-weight: bold; color: #222; cursor: pointer; transition: background 0.2s;`;
    closeBtn.innerText = 'X';
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = '#ff5555');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = '#666a6b');
    closeBtn.addEventListener('click', () => this.toggle()); 
    header.appendChild(closeBtn);
    this.modalContainer.appendChild(header);

    const layoutWrapper = document.createElement('div');
    layoutWrapper.style.cssText = `display: flex; gap: 20px;`;
    
    this.gridContainer = document.createElement('div');
    this.gridContainer.style.cssText = `display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; flex: 1; align-content: start;`;
    layoutWrapper.appendChild(this.gridContainer);

    this.inspectContainer = document.createElement('div');
    this.inspectContainer.style.cssText = `
      width: 280px; background: #1a1818; border: 2px solid #5a5654; border-radius: 8px; 
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      box-shadow: inset 0 0 15px rgba(0,0,0,0.8); position: relative; overflow: hidden;
    `;
    
    this.inspectTitle = document.createElement('h3');
    this.inspectTitle.style.cssText = `position: absolute; top: 10px; margin: 0; color: #fff; font-family: monospace; text-transform: uppercase; z-index: 10; letter-spacing: 1px;`;
    this.inspectContainer.appendChild(this.inspectTitle);
    
    layoutWrapper.appendChild(this.inspectContainer);
    this.modalContainer.appendChild(layoutWrapper);
    
    document.body.appendChild(this.modalContainer);
  }

  _setupInspectionScene() {
    this.inspectScene = new THREE.Scene();
    this.inspectCamera = new THREE.PerspectiveCamera(45, 280 / 350, 0.1, 100);
    this.inspectCamera.position.set(0, 0, 3);
    
    this.inspectRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.inspectRenderer.setSize(280, 350);
    this.inspectRenderer.setPixelRatio(window.devicePixelRatio);
    this.inspectContainer.appendChild(this.inspectRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.inspectScene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffeedd, 2.0);
    dirLight.position.set(5, 5, 5);
    this.inspectScene.add(dirLight);

    this._animateInspection = this._animateInspection.bind(this);
    requestAnimationFrame(this._animateInspection);
  }

  inspectItem(itemName) {
    if (this.inspectedItemName === itemName) return;
    this.inspectedItemName = itemName;
    this.inspectTitle.innerText = itemName;

    if (this.inspectModel) {
      this.inspectScene.remove(this.inspectModel);
      this.inspectModel = null;
    }

    const loader = new GLTFLoader();
    loader.load(`/deadzone-assets/${itemName}.gltf`, (gltf) => {
      this.inspectModel = gltf.scene;
      
      const box = new THREE.Box3().setFromObject(this.inspectModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      this.inspectModel.position.sub(center);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scaleConfig = { 'Pistol': 0.7, 'Rifle': 1.5, 'Shotgun': 1.4 };
      const finalScale = (scaleConfig[itemName] || 1.2) / maxDim;
      
      this.inspectModel.scale.set(finalScale, finalScale, finalScale);
      this.inspectModel.rotation.set(0.2, 0, 0.1);
      this.inspectScene.add(this.inspectModel);
    });
  }

  _animateInspection() {
    requestAnimationFrame(this._animateInspection);
    if (this.isOpen && this.inspectModel) {
      this.inspectModel.rotation.y += 0.01; 
      this.inspectRenderer.render(this.inspectScene, this.inspectCamera);
    }
  }

  render() {
    this.hotbarContainer.innerHTML = '';
    this.gridContainer.innerHTML = '';

    this.items.forEach((item, index) => {
      const isHotbarSlot = index < 5;
      const isActive = isHotbarSlot && index === this.activeHotbarIndex;
      
      const slot = document.createElement('div');
      slot.style.cssText = `
        aspect-ratio: 1; background-color: ${isActive ? 'rgba(255,255,255,0.8)' : '#3b3735'}; 
        border: 2px solid ${isActive ? '#fff' : '#5a5654'}; border-radius: 10px;
        box-shadow: inset 0 4px 6px rgba(0,0,0,0.4);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        position: relative; user-select: none; transition: transform 0.1s; cursor: pointer;
      `;
      
      if (item) {
        slot.draggable = true;
        slot.innerHTML = `
          <img src="/custom-png/${item.toLowerCase()}.png" alt="${item}" style="width: 100%; height: 100%; object-fit: contain; transform: scale(1.3) translate(4px, 6px); pointer-events: none;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <span style="display: none; color: ${isActive ? '#000' : '#ccc'}; font-family: monospace; font-size: 0.9rem; font-weight: bold; pointer-events: none;">
            ${item.substring(0,3).toUpperCase()}
          </span>
        `;
      }

      const numberLabel = document.createElement('span');
      const shadowColor = isActive ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
      numberLabel.style.cssText = `position: absolute; top: 4px; left: 6px; font-size: 0.8rem; font-weight: bold; font-family: monospace; color: ${isActive ? '#000' : '#888'}; pointer-events: none; z-index: 5; text-shadow: 0px 1px 3px ${shadowColor};`;
      numberLabel.innerText = index + 1;
      slot.appendChild(numberLabel);

      if (isHotbarSlot) {
        const hotbarSlot = slot.cloneNode(true);
        hotbarSlot.style.width = '60px';
        hotbarSlot.style.height = '60px';
        this.hotbarContainer.appendChild(hotbarSlot);
      }

      slot.addEventListener('click', () => {
        if (!item) return;
        this.inspectItem(item);
        if (isHotbarSlot) {
          this.equipHotbar(index);
        }
      });

      slot.addEventListener('dblclick', () => {
        if (!item || isHotbarSlot) return;
        const temp = this.items[this.activeHotbarIndex];
        this.items[this.activeHotbarIndex] = this.items[index];
        this.items[index] = temp;
        
        // BUFFER FIX: Let event bubble safely before nuking DOM
        setTimeout(() => {
          this.equipHotbar(this.activeHotbarIndex);
        }, 10);
      });

      slot.addEventListener('mouseenter', () => { if(item) slot.style.transform = 'scale(1.05)'; });
      slot.addEventListener('mouseleave', () => { slot.style.transform = 'scale(1)'; });

      slot.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        setTimeout(() => slot.style.opacity = '0.5', 0);
      });
      
      slot.addEventListener('dragend', () => slot.style.opacity = '1');
      slot.addEventListener('dragover', (e) => e.preventDefault());
      
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = index;
        
        if (fromIndex !== toIndex && !isNaN(fromIndex)) {
          const temp = this.items[fromIndex];
          this.items[fromIndex] = this.items[toIndex];
          this.items[toIndex] = temp;
          
          // CRITICAL HTML5 DRAG BUG FIX: 
          // Wait 50ms for browser to completely finish drag events before nuking DOM
          setTimeout(() => {
            if (fromIndex === this.activeHotbarIndex || toIndex === this.activeHotbarIndex) {
              this.equipHotbar(this.activeHotbarIndex);
            } else {
              this.render();
            }
          }, 50); 
        }
      });

      this.gridContainer.appendChild(slot);
    });
  }

  addItem(itemName) {
    const emptyIndex = this.items.indexOf(null);
    if (emptyIndex !== -1) {
      this.items[emptyIndex] = itemName;
      this.render();
      if (emptyIndex === this.activeHotbarIndex) {
        this.equipHotbar(this.activeHotbarIndex);
      }
      return true; 
    }
    console.log("Inventory is full!");
    return false;
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.modalContainer.style.display = this.isOpen ? 'flex' : 'none';
    this.onToggleLock(!this.isOpen); 
  }

  equipHotbar(index) {
    if (index >= 0 && index < 5) {
      this.activeHotbarIndex = index;
      this.render(); 
      this.onEquip(this.items[index] || null); 
    }
  }
}