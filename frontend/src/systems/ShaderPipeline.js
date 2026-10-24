import * as THREE from 'three';

THREE.Cache.enabled = true;

export class ShaderPipeline {
  constructor() {
    this.materialCache = new Map();
    this.textureCache = new Map();
    
    this.nightUniforms = {
      uNightFactor: { value: 0.0 },
      uGlowColor: { value: new THREE.Color(0xffaa44) }
    };

    this.lampGlowMaterial = this._createLampGlowShader();
  }

  _createLampGlowShader() {
    return new THREE.ShaderMaterial({
      uniforms: this.nightUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING
            vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          #else
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          #endif
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform float uNightFactor;
        uniform vec3 uGlowColor;
        varying vec2 vUv;
        void main() {
          float dist = distance(vUv, vec2(0.5));
          float alpha = smoothstep(0.5, 0.0, dist);
          alpha = pow(alpha, 2.0) * uNightFactor * 0.35;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(uGlowColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
  }

  _compressTexture(tex) {
    if (!tex || !tex.image) return tex;
    const img = tex.image;
    const srcKey = img.src || `${img.width}x${img.height}`;

    if (this.textureCache.has(srcKey)) {
      const cached = this.textureCache.get(srcKey);
      if (cached !== tex) tex.dispose();
      return cached;
    }

    const maxDim = 512;
    if (img.width > maxDim || img.height > maxDim) {
      const scale = maxDim / Math.max(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(img.width * scale);
      canvas.height = Math.floor(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      tex.image = canvas;
      tex.needsUpdate = true;
    }

    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    this.textureCache.set(srcKey, tex);
    return tex;
  }

  optimizeModel(root, castShadow = true, receiveShadow = true) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;

      if (child.geometry) {
        child.geometry.deleteAttribute('tangent');
        child.geometry.deleteAttribute('uv2');
      }

      if (child.material && !Array.isArray(child.material)) {
        const mat = child.material;

        if (mat.map) mat.map = this._compressTexture(mat.map);
        if (mat.normalMap) { mat.normalMap.dispose(); mat.normalMap = null; }
        if (mat.roughnessMap) { mat.roughnessMap.dispose(); mat.roughnessMap = null; }
        if (mat.metalnessMap) { mat.metalnessMap.dispose(); mat.metalnessMap = null; }
        if (mat.aoMap) { mat.aoMap.dispose(); mat.aoMap = null; }

        const key = `${mat.color ? mat.color.getHexString() : 'no'}_${mat.map ? mat.map.uuid : 'nomap'}`;
        if (this.materialCache.has(key)) {
          const sharedMat = this.materialCache.get(key);
          if (sharedMat !== mat) mat.dispose();
          child.material = sharedMat;
        } else {
          // Keep mediump so PointLights don't quantize into stepped cartoon rings
          mat.precision = 'mediump';
          this.materialCache.set(key, mat);
        }
      }
    });
  }

  updateNightFactor(factor) {
    this.nightUniforms.uNightFactor.value = factor;
  }

  dispose() {
    this.materialCache.forEach(mat => mat.dispose());
    this.materialCache.clear();
    this.textureCache.forEach(tex => tex.dispose());
    this.textureCache.clear();
    this.lampGlowMaterial.dispose();
  }
}

export const shaderPipeline = new ShaderPipeline();