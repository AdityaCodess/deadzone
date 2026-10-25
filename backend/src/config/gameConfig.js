export const gameConfig = {
  // Expandable map settings: Increase gridRows/gridCols anytime (e.g. 35x35 = 700m x 700m)
  mapConfig: {
    gridRows: 35,
    gridCols: 35,
    tileSize: 20,
    lootBoxCount: 18,      // Balanced density across the city (not too scarce, not overcrowded)
    minLootBoxSpacing: 45  // Minimum meters between lootboxes
  },
  characters: {
    Matt:  { name: 'Matt',  modelPath: '/deadzone-assets/Characters_Matt.gltf' },
    Lis:   { name: 'Lis',   modelPath: '/deadzone-assets/Characters_Lis.gltf' },
    Shaun: { name: 'Shaun', modelPath: '/deadzone-assets/Characters_Shaun.gltf' },
    Sam:   { name: 'Sam',   modelPath: '/deadzone-assets/Characters_Sam.gltf' }
  },
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
  // All weapons, medkits, and ammo pre-loaded for testing
  startingInventory: [
    { name: 'Pistol',       count: 1 },
    { name: 'Rifle',        count: 1 },
    { name: 'SMG',          count: 1 },
    { name: 'Shotgun',      count: 1 },
    { name: 'RPG',          count: 1 },
    { name: 'Grenade',      count: 3 },
    { name: 'Medkit',       count: 2 },
    { name: 'Axe',          count: 1 },
    { name: 'Bat',          count: 1 },
    { name: 'Guitar',       count: 1 },
    { name: 'pistol_ammo',  count: 60 },
    { name: 'assault_ammo', count: 120 },
    { name: 'smg_ammo',     count: 140 },
    { name: 'shotgun_ammo', count: 32 },
    { name: 'rpg_ammo',     count: 6 }
  ],
  weapons: {
    Pistol: {
      type: 'gun',
      meshName: 'Pistol',
      modelPath: '/deadzone-assets/Pistol.gltf',
      iconPath: '/custom-png/pistol.png',
      audio: 'pistol',
      ammoType: 'pistol_ammo',
      damage: 34,
      fireRate: 250,
      range: 60,
      maxAmmo: 12,
      reloadTime: 1.2,
      automatic: false,
      pellets: 1,
      spread: 0.01,
      maxStack: 1
    },
    Rifle: {
      type: 'gun',
      meshName: 'Rifle',
      modelPath: '/deadzone-assets/Rifle.gltf',
      iconPath: '/custom-png/rifle.png',
      audio: 'pistol',
      ammoType: 'assault_ammo',
      damage: 25,
      fireRate: 110,
      range: 90,
      maxAmmo: 30,
      reloadTime: 1.8,
      automatic: true,
      pellets: 1,
      spread: 0.035,
      maxStack: 1
    },
    SMG: {
      type: 'gun',
      meshName: 'SMG',
      modelPath: '/deadzone-assets/SMG.gltf',
      iconPath: '/custom-png/smg.png',
      audio: 'pistol',
      ammoType: 'smg_ammo',
      damage: 19,
      fireRate: 75,
      range: 55,
      maxAmmo: 35,
      reloadTime: 1.5,
      automatic: true,
      pellets: 1,
      spread: 0.055,
      maxStack: 1
    },
    Shotgun: {
      type: 'gun',
      meshName: 'Shotgun',
      modelPath: '/deadzone-assets/Shotgun.gltf',
      iconPath: '/custom-png/shotgun.png',
      audio: 'shotgun',
      ammoType: 'shotgun_ammo',
      damage: 18,
      fireRate: 850,
      range: 35,
      maxAmmo: 6,
      reloadTime: 2.2,
      automatic: false,
      pellets: 8,
      spread: 0.12,
      maxStack: 1
    },
    RPG: {
      type: 'launcher',
      meshName: 'RPG',
      modelPath: '/deadzone-assets/rpg.gltf',
      iconPath: '/custom-png/rpg.png',
      audio: 'rpg',
      blastAudio: 'blast',
      ammoType: 'rpg_ammo',
      damage: 9999,
      blastRadius: 11.0,
      projectileSpeed: 38.0,
      fireRate: 1200,
      range: 120,
      maxAmmo: 1,
      reloadTime: 2.4,
      automatic: false,
      maxStack: 1
    },
    Grenade: {
      type: 'throwable',
      meshName: 'Grenade',
      modelPath: '/deadzone-assets/Grenade.gltf',
      iconPath: '/custom-png/grenade.png',
      audio: 'grenade',
      blastAudio: 'blast',
      damage: 9999,
      blastRadius: 6.5,
      throwSpeed: 18.0,
      fuseTime: 2.0,
      fireRate: 900,
      automatic: false,
      maxStack: 3
    },
    Axe: {
      type: 'melee',
      meshName: 'Axe',
      modelPath: '/deadzone-assets/Axe.gltf',
      iconPath: '/custom-png/axe.png',
      audio: 'axe',
      damage: 65,
      fireRate: 550,
      range: 3.5,
      infiniteAmmo: true,
      swingDuration: 0.35,
      automatic: false,
      maxStack: 1
    },
    Bat: {
      type: 'melee',
      meshName: 'WoodenBat_Barbed',
      modelPath: '/deadzone-assets/WoodenBat_Barbed.gltf',
      iconPath: '/custom-png/woodenbat_barbed.png',
      audio: 'bat_barbed',
      damage: 50,
      fireRate: 450,
      range: 3.5,
      infiniteAmmo: true,
      swingDuration: 0.3,
      automatic: false,
      maxStack: 1
    },
    Guitar: {
      type: 'special_melee',
      meshName: 'Guitar',
      modelPath: '/deadzone-assets/Guitar.gltf',
      iconPath: '/custom-png/guitar.png',
      audio: 'guitar',
      damage: 9999,
      fireRate: 4000,
      range: 4.5,
      maxAmmo: 2,
      specialDuration: 4.0,
      automatic: false,
      maxStack: 1
    }
  },
  consumables: {
    Medkit: {
      type: 'heal',
      healAmount: 50,
      useTime: 2.0,
      cooldown: 1.5,
      maxStack: 2,
      targetSize: 0.45,
      handSize: 0.25,
      modelPath: '/deadzone-assets/medkit.gltf',
      iconPath: '/custom-png/medkit.png'
    }
  },
  ammoItems: {
    pistol_ammo: {
      label: 'Pistol Ammo',
      modelPath: '/deadzone-assets/pistol_ammo.gltf',
      iconPath: '/custom-png/pistol_ammo.png',
      targetSize: 0.38,
      maxStack: 60,
      defaultPickupCount: 15
    },
    assault_ammo: {
      label: 'Assault Ammo',
      modelPath: '/deadzone-assets/assault_ammo.gltf',
      iconPath: '/custom-png/assault_ammo.png',
      targetSize: 0.42,
      maxStack: 120,
      defaultPickupCount: 30
    },
    smg_ammo: {
      label: 'SMG Ammo',
      modelPath: '/deadzone-assets/pistol_ammo.gltf',
      iconPath: '/custom-png/smg_ammo.png',
      targetSize: 0.38,
      maxStack: 140,
      defaultPickupCount: 35
    },
    shotgun_ammo: {
      label: 'Shotgun Ammo',
      modelPath: '/deadzone-assets/shotgun_ammo.gltf',
      iconPath: '/custom-png/shotgun_ammo.png',
      targetSize: 0.38,
      maxStack: 32,
      defaultPickupCount: 8
    },
    rpg_ammo: {
      label: 'RPG Rockets',
      modelPath: '/deadzone-assets/rpg_ammo.gltf',
      iconPath: '/custom-png/rpg_ammo.png',
      targetSize: 0.65,
      maxStack: 6,
      defaultPickupCount: 2
    }
  },
  zombies: {
    basic: {
      health: 100,
      speed: 4.2,
      damage: 15,
      attackCooldown: 1200,
      corpseCleanupDelay: 5.0
    }
  }
};