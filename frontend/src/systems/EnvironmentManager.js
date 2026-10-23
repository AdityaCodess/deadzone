import * as THREE from 'three';

export class EnvironmentManager {
  constructor(scene) {
    this.scene = scene;
    
    this.time = 8; 
    this.dayDuration = 60; 
    
    this.ambientLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.6);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffeedd, 2.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 150;
    
    const d = 60;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.skyColorDay = new THREE.Color(0x87CEEB);
    this.skyColorNight = new THREE.Color(0x05050a);
    
    this.fogColorDay = new THREE.Color(0x87CEEB);
    this.fogColorNight = new THREE.Color(0x020205);
    
    if (!this.scene.background) this.scene.background = new THREE.Color();

    // Registry of all streetlamp positions and visuals
    this.streetLamps = [];
    this.bulbMaterials = new Set();
    this.glowMaterials = new Set();

    // Fixed pool of 4 real PointLights so WebGL never runs out of shader samplers
    this.maxActiveLights = 4;
    this.lightPool = [];
    for (let i = 0; i < this.maxActiveLights; i++) {
      const light = new THREE.PointLight(0xffaa44, 0, 28, 1.5);
      light.castShadow = false; // Prevents shadow sampler mismatch crash
      this.scene.add(light);
      this.lightPool.push(light);
    }
  }

  registerStreetLamp(worldPosition, bulbMaterial, glowMaterial) {
    this.streetLamps.push({ position: worldPosition });
    this.bulbMaterials.add(bulbMaterial);
    if (glowMaterial) this.glowMaterials.add(glowMaterial);
  }

  update(delta, playerPosition) {
    this.time += (delta / this.dayDuration) * 24;
    if (this.time >= 24) this.time = 0;

    const timeAngle = ((this.time - 6) / 24) * Math.PI * 2; 
    const sunHeight = Math.sin(timeAngle);
    
    this.sunLight.position.set(
      Math.cos(timeAngle) * 100,
      sunHeight * 100,
      30
    );

    if (sunHeight > 0) {
      this.sunLight.castShadow = true;
      this.sunLight.intensity = Math.max(0, sunHeight * 2.0);
      this.ambientLight.intensity = 0.35 + (sunHeight * 0.45);
      
      this.scene.background.lerpColors(this.skyColorNight, this.skyColorDay, sunHeight);
      this.scene.fog.color.lerpColors(this.fogColorNight, this.fogColorDay, sunHeight);
    } else {
      // Disable sun shadow map sampling when sun is off to prevent WebGL sampler warnings
      this.sunLight.castShadow = false;
      this.sunLight.intensity = 0;
      this.ambientLight.intensity = 0.22; 
      this.scene.background.copy(this.skyColorNight);
      this.scene.fog.color.copy(this.fogColorNight);
    }

    // Nighttime Streetlamp Logic
    const isNight = sunHeight < 0.15;
    const targetBulbIntensity = isNight ? 3.0 : 0.0;
    const targetGlowOpacity = isNight ? 0.45 : 0.0;
    const targetLightIntensity = isNight ? 6.0 : 0.0;

    this.bulbMaterials.forEach(mat => {
      mat.emissiveIntensity += (targetBulbIntensity - mat.emissiveIntensity) * delta * 3;
    });

    this.glowMaterials.forEach(mat => {
      mat.opacity += (targetGlowOpacity - mat.opacity) * delta * 3;
    });

    // Snap the 4 pooled PointLights to the 4 closest streetlamps near the player
    if (playerPosition && this.streetLamps.length > 0) {
      const sorted = this.streetLamps
        .map(lamp => ({
          position: lamp.position,
          distSq: lamp.position.distanceToSquared(playerPosition)
        }))
        .sort((a, b) => a.distSq - b.distSq);

      for (let i = 0; i < this.maxActiveLights; i++) {
        const light = this.lightPool[i];
        if (i < sorted.length && sorted[i].distSq < 6400) { // Within 80m
          light.position.copy(sorted[i].position);
          light.intensity += (targetLightIntensity - light.intensity) * delta * 3;
        } else {
          light.intensity = 0;
        }
      }
    }
  }
}