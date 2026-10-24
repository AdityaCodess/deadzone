export class InventoryManager {
  constructor(startingItems, itemIcons = {}, onEquip, onToggleLock) {
    this.totalSlots = 15; 
    this.items = new Array(this.totalSlots).fill(null);
    this.itemIcons = itemIcons;
    
    startingItems.forEach((item, i) => {
      if (i < this.totalSlots) this.items[i] = item;
    });

    this.onEquip = onEquip; 
    this.onToggleLock = onToggleLock; 
    
    this.isOpen = false;
    this.activeHotbarIndex = 0;
    this.inspectedItemName = null;

    this._buildUI();
    this.render();
    
    if (this.items[0]) {
      this.onEquip(this.items[0]);
      this.inspectItem(this.items[0]);
    }
  }

  _getIconUrl(itemName) {
    if (!itemName) return '';
    return this.itemIcons[itemName] || `/custom-png/${itemName.toLowerCase()}.png`;
  }

  _buildUI() {
    document.querySelectorAll('#inventory-hotbar, #full-inventory, #inv-anim-style').forEach(el => el.remove());

    const style = document.createElement('style');
    style.id = 'inv-anim-style';
    style.innerHTML = `
      @keyframes weaponFloat {
        0%, 100% { transform: translateY(0px) rotate(-4deg) scale(1.05); }
        50% { transform: translateY(-10px) rotate(4deg) scale(1.12); }
      }
    `;
    document.head.appendChild(style);

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
      width: 280px; height: 350px; background: #1a1818; border: 2px solid #5a5654; border-radius: 8px; 
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      box-shadow: inset 0 0 15px rgba(0,0,0,0.8); position: relative; overflow: hidden;
    `;
    
    this.inspectTitle = document.createElement('h3');
    this.inspectTitle.style.cssText = `position: absolute; top: 14px; margin: 0; color: #fff; font-family: monospace; text-transform: uppercase; z-index: 10; letter-spacing: 1px;`;
    this.inspectContainer.appendChild(this.inspectTitle);

    this.inspectPreviewImg = document.createElement('img');
    this.inspectPreviewImg.style.cssText = `
      width: 75%; height: 75%; object-fit: contain;
      filter: drop-shadow(0 12px 15px rgba(0,0,0,0.85));
      animation: weaponFloat 3.5s ease-in-out infinite;
      display: none;
    `;
    this.inspectContainer.appendChild(this.inspectPreviewImg);
    
    layoutWrapper.appendChild(this.inspectContainer);
    this.modalContainer.appendChild(layoutWrapper);
    
    document.body.appendChild(this.modalContainer);
  }

  inspectItem(itemName) {
    if (!itemName) {
      this.inspectedItemName = null;
      this.inspectTitle.innerText = '';
      this.inspectPreviewImg.style.display = 'none';
      return;
    }
    if (this.inspectedItemName === itemName) return;
    this.inspectedItemName = itemName;
    this.inspectTitle.innerText = itemName;
    this.inspectPreviewImg.src = this._getIconUrl(itemName);
    this.inspectPreviewImg.style.display = 'block';
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
        const iconUrl = this._getIconUrl(item);
        slot.draggable = true;
        slot.innerHTML = `
          <img src="${iconUrl}" alt="${item}" style="width: 100%; height: 100%; object-fit: contain; transform: scale(1.3) translate(4px, 6px); pointer-events: none;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
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
    return false;
  }

  getActiveItem() {
    return this.items[this.activeHotbarIndex];
  }

  consumeActiveItem() {
    this.items[this.activeHotbarIndex] = null;
    this.inspectItem(null);
    this.render();
    this.onEquip(null);
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