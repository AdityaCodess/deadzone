const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const gameConfig = {
  player: { 
    maxHealth: 100, 
    baseSpeed: 15.0,
    sprintMultiplier: 1.6,
    gravity: 35.0,
    jumpForce: 12.0,
    maxStamina: 100,
    staminaDrain: 25.0, 
    staminaRegen: 6.0, 
    jumpCost: 20.0      
  },
  zombies: {
    basic: { health: 100, damage: 15, speed: 3.0, attackCooldown: 1000 }
  },
  weapons: {
    'Pistol': { damage: 34, maxAmmo: 12, reloadTime: 1.0, fireRate: 250, range: 40, automatic: false, pellets: 1, spread: 0.01 },
    'Rifle':  { damage: 25, maxAmmo: 30, reloadTime: 1.5, fireRate: 100, range: 100, automatic: true, pellets: 1, spread: 0.02 },
    'Shotgun':{ damage: 12, maxAmmo: 8,  reloadTime: 2.0, fireRate: 800, range: 25, automatic: false, pellets: 8, spread: 0.12 }
  },
  startingInventory: ['Pistol', 'Rifle'] 
};

app.get('/api/config', (req, res) => {
  res.json(gameConfig);
});

app.listen(3001, () => {
  console.log('Deadzone backend running on http://localhost:3001');
});