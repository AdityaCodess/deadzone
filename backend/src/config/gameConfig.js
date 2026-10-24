export const gameConfig = {
  player: {
    baseSpeed: 45.0,
    sprintMultiplier: 1.65,
    gravity: 28.0,
    jumpForce: 10.5,
    maxHealth: 100,
    maxStamina: 100,
    staminaDrain: 25.0,
    staminaRegen: 8.0,
    jumpCost: 20.0
  },
  startingInventory: ['Pistol', 'Rifle', null, null, null],
  weapons: {
    Pistol: {
      damage: 34,
      fireRate: 250,
      range: 60,
      maxAmmo: 12,
      reloadTime: 1.2,
      automatic: false,
      pellets: 1,
      spread: 0.01
    },
    Rifle: {
      damage: 25,
      fireRate: 110,
      range: 90,
      maxAmmo: 30,
      reloadTime: 1.8,
      automatic: true,
      pellets: 1,
      spread: 0.035
    },
    Shotgun: {
      damage: 18,
      fireRate: 850,
      range: 35,
      maxAmmo: 6,
      reloadTime: 2.2,
      automatic: false,
      pellets: 8,
      spread: 0.12
    }
  },
  consumables: {
    Medkit: {
      type: 'heal',
      healAmount: 50,
      useTime: 2.0, // Seconds if you want to add a channel timer later, or instant
      cooldown: 1.5,
      modelPath: '/deadzone-assets/medkit.gltf',
      iconPath: '/custom-png/medkit.png'
    }
  },
  zombies: {
    basic: {
      health: 100,
      speed: 4.2,
      damage: 15,
      attackCooldown: 1200
    }
  },
  worldLoot: [
    { itemName: 'Shotgun', modelPath: '/deadzone-assets/Shotgun.gltf', position: [0, 0.1, -4], rotationY: Math.PI / 2, scale: 1.0 },
    { itemName: 'Medkit', modelPath: '/deadzone-assets/medkit.gltf', position: [2.5, 0.1, -4], rotationY: 0, scale: 1.0 }
  ]
};