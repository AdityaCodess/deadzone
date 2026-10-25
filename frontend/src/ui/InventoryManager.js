export class InventoryManager {
  constructor(startingItems, itemIcons = {}, maxStacks = {}, onEquip, onToggleLock) {
    this.totalSlots = 20; 
    this.items = new Array(this.totalSlots).fill(null);
    this.itemIcons = itemIcons;
    this.maxStacks = maxStacks;
    
    startingItems.forEach((entry, i) => {
      if (i < this.totalSlots && entry) {
        if (typeof entry === 'string') {
          this.items[i] = { name: entry, count: 1 };
        } else if (entry.name) {
          this.items[i] = { name: entry.name, count: entry.count || 1 };
        }
      }
    });

    this.onEquip = onEquip; 
    this.onToggleLock = onToggleLock; 
    
    this.isOpen = false;
    this.activeHotbarIndex = 0;
    this.inspectedItemName = null;

    this._buildUI();
    this.render();
    
    const firstItem = this.getActiveItem();
    if (firstItem) {
      this.onEquip(firstItem);
      this.inspectItem(firstItem);
    }
  }

  _getMaxStack(itemName) {
    return this.maxStacks[itemName] || 1;
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

    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #666a6b; padding-bottom: 10px; margin-bottom: 15px;`;
    
    const titleLabel = document.createElement('div');
    titleLabel.style.cssText = `color: #ccc; font-family: monospace; font-size: 0.95rem; font-weight: bold;`;
    titleLabel.innerText = 'INVENTORY (PRESS [Q] IN-GAME TO DROP ACTIVE ITEM)';
    header.appendChild(titleLabel);

    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = `width: 24px; height: 24px; background: #666a6b; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-family: sans-serif; font-weight: bold; color: #222; cursor: pointer;`;
    closeBtn.innerText = 'X';
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
    this.inspectTitle.innerText = itemName.replace('_', ' ');
    this.inspectPreviewImg.src = this._getIconUrl(itemName);
    this.inspectPreviewImg.style.display = 'block';
  }

  render() {
    this.hotbarContainer.innerHTML = '';
    this.gridContainer.innerHTML = '';

    this.items.forEach((slotData, index) => {
      const item = slotData ? slotData.name : null;
      const count = slotData ? slotData.count : 0;
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
          <img src="${iconUrl}" alt="${item}" style="width: 100%; height: 100%; object-fit: contain; transform: scale(1.25) translate(2px, 4px); pointer-events: none;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <span style="display: none; color: ${isActive ? '#000' : '#ccc'}; font-family: monospace; font-size: 0.85rem; font-weight: bold; pointer-events: none;">
            ${item.substring(0,4).toUpperCase()}
          </span>
        `;

        if (count > 1) {
          const countBadge = document.createElement('span');
          countBadge.style.cssText = `
            position: absolute; bottom: 3px; right: 5px;
            background: rgba(0,0,0,0.75); color: #33ff66;
            font-family: monospace; font-size: 0.75rem; font-weight: bold;
            padding: 1px 4px; border-radius: 4px; pointer-events: none; z-index: 6;
          `;
          countBadge.innerText = `x${count}`;
          slot.appendChild(countBadge);
        }
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
        if (isHotbarSlot) this.equipHotbar(index);
      });

      slot.addEventListener('dblclick', () => {
        if (!item || isHotbarSlot) return;
        const temp = this.items[this.activeHotbarIndex];
        this.items[this.activeHotbarIndex] = this.items[index];
        this.items[index] = temp;
        setTimeout(() => this.equipHotbar(this.activeHotbarIndex), 10);
      });

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
          const fromSlot = this.items[fromIndex];
          const toSlot = this.items[toIndex];

          // Merge stacks if dropping same stackable item onto another slot
          if (fromSlot && toSlot && fromSlot.name === toSlot.name) {
            const maxStack = this._getMaxStack(fromSlot.name);
            const space = maxStack - toSlot.count;
            if (space > 0) {
              const transfer = Math.min(space, fromSlot.count);
              toSlot.count += transfer;
              fromSlot.count -= transfer;
              if (fromSlot.count <= 0) this.items[fromIndex] = null;
            } else {
              this.items[fromIndex] = toSlot;
              this.items[toIndex] = fromSlot;
            }
          } else {
            this.items[fromIndex] = toSlot;
            this.items[toIndex] = fromSlot;
          }

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

  // Adds item(s) respecting stack limits (e.g. 2 Medkits per slot)
  addItem(itemName, count = 1) {
    let remaining = Number(count) || 1;
    const maxStack = this._getMaxStack(itemName);
    let addedAny = false;

    // 1. Fill existing partial stacks first
    if (maxStack > 1) {
      for (let i = 0; i < this.totalSlots && remaining > 0; i++) {
        const slot = this.items[i];
        if (slot && slot.name === itemName && slot.count < maxStack) {
          const transfer = Math.min(maxStack - slot.count, remaining);
          slot.count += transfer;
          remaining -= transfer;
          addedAny = true;
        }
      }
    }

    // 2. Place remaining into empty slots
    for (let i = 0; i < this.totalSlots && remaining > 0; i++) {
      if (!this.items[i]) {
        const put = Math.min(maxStack, remaining);
        this.items[i] = { name: itemName, count: put };
        remaining -= put;
        addedAny = true;
        if (i === this.activeHotbarIndex) {
          this.onEquip(itemName);
        }
      }
    }

    if (addedAny) this.render();
    return addedAny;
  }

  getActiveItem() {
    return this.items[this.activeHotbarIndex]?.name || null;
  }

  getActiveSlotData() {
    return this.items[this.activeHotbarIndex];
  }

  // Consumes 1 unit from the active hotbar slot (e.g. using 1 of 2 stacked Medkits or throwing 1 Grenade)
  consumeActiveItem(amount = 1) {
    const slot = this.items[this.activeHotbarIndex];
    if (!slot) return;

    slot.count -= amount;
    if (slot.count <= 0) {
      this.items[this.activeHotbarIndex] = null;
      this.inspectItem(null);
      this.render();
      this.onEquip(null);
    } else {
      this.render();
      this.onEquip(slot.name);
    }
  }

  // Drops the currently active hotbar item/stack when pressing [Q]
  dropActiveSlotItem() {
    const slot = this.items[this.activeHotbarIndex];
    if (!slot) return null;

    const dropped = { name: slot.name, count: slot.count };
    this.items[this.activeHotbarIndex] = null;
    this.inspectItem(null);
    this.render();
    this.onEquip(null);
    return dropped;
  }

  // Counts total reserve ammo of a specific type across all inventory slots
  getTotalItemCount(itemName) {
    let total = 0;
    for (const slot of this.items) {
      if (slot && slot.name === itemName) total += slot.count;
    }
    return total;
  }

  // Deducts reserve ammo when reloading a weapon
  consumeItemByName(itemName, amount) {
    let needed = amount;
    for (let i = this.totalSlots - 1; i >= 0 && needed > 0; i--) {
      const slot = this.items[i];
      if (slot && slot.name === itemName) {
        const take = Math.min(slot.count, needed);
        slot.count -= take;
        needed -= take;
        if (slot.count <= 0) {
          this.items[i] = null;
          if (i === this.activeHotbarIndex) this.onEquip(null);
        }
      }
    }
    this.render();
    return amount - needed;
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
      this.onEquip(this.items[index]?.name || null); 
    }
  }
}