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
      type: 'gun',
      meshName: 'Pistol',
      iconPath: '/custom-png/pistol.png',
      audio: 'pistol',
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
      type: 'gun',
      meshName: 'Rifle',
      iconPath: '/custom-png/rifle.png',
      audio: 'pistol',
      damage: 25,
      fireRate: 110,
      range: 90,
      maxAmmo: 30,
      reloadTime: 1.8,
      automatic: true,
      pellets: 1,
      spread: 0.035
    },
    SMG: {
      type: 'gun',
      meshName: 'SMG',
      iconPath: '/custom-png/smg.png',
      audio: 'pistol',
      damage: 19,
      fireRate: 75, // Fast submachine gun rate of fire (single tap or hold for auto)
      range: 55,
      maxAmmo: 35,
      reloadTime: 1.5,
      automatic: true,
      pellets: 1,
      spread: 0.055
    },
    Shotgun: {
      type: 'gun',
      meshName: 'Shotgun',
      iconPath: '/custom-png/shotgun.png',
      audio: 'shotgun',
      damage: 18,
      fireRate: 850,
      range: 35,
      maxAmmo: 6,
      reloadTime: 2.2,
      automatic: false,
      pellets: 8,
      spread: 0.12
    },
    Axe: {
      type: 'melee',
      meshName: 'Axe',
      iconPath: '/custom-png/axe.png',
      audio: 'axe',
      damage: 65,
      fireRate: 550,
      range: 3.5,
      infiniteAmmo: true,
      swingDuration: 0.35,
      automatic: false
    },
    Bat: {
      type: 'melee',
      meshName: 'WoodenBat_Barbed',
      iconPath: '/custom-png/woodenbat_barbed.png',
      audio: 'bat_barbed',
      damage: 50,
      fireRate: 450,
      range: 3.5,
      infiniteAmmo: true,
      swingDuration: 0.3,
      automatic: false
    },
    Guitar: {
      type: 'special_melee',
      meshName: 'Guitar',
      iconPath: '/custom-png/guitar.png',
      audio: 'guitar',
      damage: 9999, // Instant kill
      fireRate: 4000,
      range: 4.5,
      maxAmmo: 2, // Can be used twice before breaking/consuming
      specialDuration: 4.0, // 4-second riff animation
      automatic: false
    }
  },
  consumables: {
    Medkit: {
      type: 'heal',
      healAmount: 50,
      useTime: 2.0,
      cooldown: 1.5,
      targetSize: 0.45,
      handSize: 0.25,
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
    {
      itemName: 'Axe',
      modelPath: '/deadzone-assets/Axe.gltf',
      position: [-5.0, 0.1, -4],
      rotationY: 0,
      targetSize: 0.85
    },
    {
      itemName: 'SMG',
      modelPath: '/deadzone-assets/SMG.gltf',
      position: [-3.0, 0.1, -4],
      rotationY: Math.PI / 2,
      targetSize: 0.75
    },
    {
      itemName: 'Shotgun',
      modelPath: '/deadzone-assets/Shotgun.gltf',
      position: [-1.0, 0.1, -4],
      rotationY: Math.PI / 2,
      targetSize: 0.95
    },
    {
      itemName: 'Medkit',
      modelPath: '/deadzone-assets/medkit.gltf',
      position: [1.0, 0.1, -4],
      rotationY: 0,
      targetSize: 0.45
    },
    {
      itemName: 'Bat',
      modelPath: '/deadzone-assets/WoodenBat_Barbed.gltf',
      position: [3.0, 0.1, -4],
      rotationY: 0,
      targetSize: 0.90
    },
    {
      itemName: 'Guitar',
      modelPath: '/deadzone-assets/Guitar.gltf',
      position: [5.0, 0.1, -4],
      rotationY: 0,
      targetSize: 1.05
    }
  ]
};