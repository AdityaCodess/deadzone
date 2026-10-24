import * as THREE from 'three';
import { shaderPipeline } from './ShaderPipeline.js';

export class EnvironmentManager {
  constructor(scene) {
    this.scene = scene;
    
    this.time = 8; 
    this.dayDuration = 60; 
    
    this.ambientLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.6);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffeedd, 2.0);
    // CRITICAL FIX: Never toggle castShadow at runtime; keep it true to prevent WebGL shadow sampler crashes
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 1.0;
    this.sunLight.shadow.camera.far = 130;
    
    const d = 45;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.skyColorDay = new THREE.Color(0x87CEEB);
    this.skyColorNight = new THREE.Color(0x05050a);
    
    this.fogColorDay = new THREE.Color(0x87CEEB);
    this.fogColorNight = new THREE.Color(0x020205);
    
    if (!this.scene.background) this.scene.background = new THREE.Color();

    this.streetLamps = [];
    this.bulbMaterials = new Set();
    this.nightFactor = 0;

    // 2 pooled PointLights is plenty alongside the custom GLSL ground shader and saves half the fragment cost
    this.maxActiveLights = 2;
    this.lightPool = [];
    for (let i = 0; i < this.maxActiveLights; i++) {
      const light = new THREE.PointLight(0xffaa44, 0, 26, 1.5);
      light.castShadow = false;
      this.scene.add(light);
      this.lightPool.push(light);
    }

    this._lampSortTimer = 0;
  }

  registerStreetLamp(worldPosition, bulbMaterial) {
    this.streetLamps.push({ position: worldPosition, distSq: Infinity });
    if (bulbMaterial) this.bulbMaterials.add(bulbMaterial);
  }

  update(delta, playerPosition) {
    this.time += (delta / this.dayDuration) * 24;
    if (this.time >= 24) this.time = 0;

    const timeAngle = ((this.time - 6) / 24) * Math.PI * 2; 
    const sunHeight = Math.sin(timeAngle);
    
    const px = playerPosition ? playerPosition.x : 0;
    const pz = playerPosition ? playerPosition.z : 0;

    // Keep shadow frustum centered on player for crisp shadows with a smaller 1024 map
    this.sunLight.position.set(
      px + Math.cos(timeAngle) * 60,
      Math.max(5, sunHeight * 70),
      pz + 20
    );
    this.sunLight.target.position.set(px, 0, pz);

    if (sunHeight > 0) {
      this.sunLight.intensity = sunHeight * 2.0;
      this.ambientLight.intensity = 0.35 + (sunHeight * 0.45);
      
      this.scene.background.lerpColors(this.skyColorNight, this.skyColorDay, sunHeight);
      this.scene.fog.color.lerpColors(this.fogColorNight, this.fogColorDay, sunHeight);
    } else {
      this.sunLight.intensity = 0.0;
      this.ambientLight.intensity = 0.25; 
      this.scene.background.copy(this.skyColorNight);
      this.scene.fog.color.copy(this.fogColorNight);
    }

    const isNight = sunHeight < 0.15;
    const targetNightFactor = isNight ? 1.0 : 0.0;
    this.nightFactor += (targetNightFactor - this.nightFactor) * Math.min(1, delta * 3);

    // Update custom GLSL shader uniform & emissive bulbs
    shaderPipeline.updateNightFactor(this.nightFactor);
    this.bulbMaterials.forEach(mat => {
      mat.emissiveIntensity = this.nightFactor * 3.0;
    });

    // Throttle lamp distance sorting to 5 times per second instead of 60 FPS
    this._lampSortTimer += delta;
    if (playerPosition && this.streetLamps.length > 0 && this._lampSortTimer > 0.2) {
      this._lampSortTimer = 0;
      for (let i = 0; i < this.streetLamps.length; i++) {
        this.streetLamps[i].distSq = this.streetLamps[i].position.distanceToSquared(playerPosition);
      }
      this.streetLamps.sort((a, b) => a.distSq - b.distSq);
    }

    const targetLightIntensity = this.nightFactor * 5.0;
    for (let i = 0; i < this.maxActiveLights; i++) {
      const light = this.lightPool[i];
      const lamp = this.streetLamps[i];
      if (lamp && lamp.distSq < 4900 && this.nightFactor > 0.01) {
        light.position.copy(lamp.position);
        light.intensity = targetLightIntensity;
      } else {
        light.intensity = 0;
      }
    }
  }
}