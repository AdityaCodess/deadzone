export class AudioManager {
  constructor() {
    this.isDisposed = false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'interactive' });

    // Master Limiter / Compressor: Prevents waveform clipping & tearing when sounds overlap
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.buffers = {};
    this.activeShotNodes = [];
    this.maxConcurrentShots = 6;

    this.entityLoops = new Map();
    this.isUnlocked = false;

    this._bindUnlockEvents();
  }

  _bindUnlockEvents() {
    this._unlockHandler = () => {
      if (this.isUnlocked || this.isDisposed || this.ctx.state === 'closed') return;
      
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      try {
        const silentBuffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(this.ctx.destination);
        source.start(0);
      } catch (e) {}

      this.isUnlocked = true;
      window.removeEventListener('mousedown', this._unlockHandler);
      window.removeEventListener('keydown', this._unlockHandler);
    };

    window.addEventListener('mousedown', this._unlockHandler, { passive: true });
    window.addEventListener('keydown', this._unlockHandler, { passive: true });
  }

  async loadSounds() {
    if (this.isDisposed) return;

    const loadAudio = async (name, url) => {
      try {
        const res = await fetch(url);
        if (this.isDisposed || this.ctx.state === 'closed') return;
        const arrayBuf = await res.arrayBuffer();
        if (this.isDisposed || this.ctx.state === 'closed') return;
        this.buffers[name] = await this.ctx.decodeAudioData(arrayBuf);
      } catch (err) {
        if (!this.isDisposed) {
          console.error(`Failed to load audio: ${url}`, err);
        }
      }
    };

    await Promise.all([
      loadAudio('pistol', '/audio/pistol.mp3'),
      loadAudio('shotgun', '/audio/shotgun.mp3'),
      loadAudio('zombie', '/audio/zombie.mp3'),
      loadAudio('zombie_death', '/audio/zombie-death.mp3')
    ]);
  }

  playShot(name, volume = 0.25) {
    if (this.isDisposed || this.ctx.state === 'closed') return;
    const buffer = this.buffers[name];
    if (!buffer) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (this.activeShotNodes.length >= this.maxConcurrentShots) {
      const oldest = this.activeShotNodes.shift();
      try {
        oldest.source.stop();
        oldest.source.disconnect();
        oldest.gainNode.disconnect();
      } catch (e) {}
    }

    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(0.97 + Math.random() * 0.06, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(volume, now);

    source.connect(gainNode);
    gainNode.connect(this.compressor);

    const nodeRecord = { source, gainNode };
    this.activeShotNodes.push(nodeRecord);

    source.onended = () => {
      const idx = this.activeShotNodes.indexOf(nodeRecord);
      if (idx !== -1) this.activeShotNodes.splice(idx, 1);
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch (e) {}
    };

    source.start(now);
  }

  updateEntityLoop(entityId, soundName, distance, maxDistance = 25, maxVolume = 0.35) {
    if (this.isDisposed || this.ctx.state === 'closed') return;
    const buffer = this.buffers[soundName];
    if (!buffer) return;

    if (distance > maxDistance) {
      this.stopEntityLoop(entityId);
      return;
    }

    const falloff = Math.max(0, 1 - (distance / maxDistance));
    const targetVolume = falloff * falloff * maxVolume;

    let loopData = this.entityLoops.get(entityId);

    if (!loopData) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(targetVolume, this.ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(this.compressor);
      source.start(0);

      loopData = { source, gainNode };
      this.entityLoops.set(entityId, loopData);
    } else {
      loopData.gainNode.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.05);
    }
  }

  stopEntityLoop(entityId) {
    const loopData = this.entityLoops.get(entityId);
    if (loopData) {
      try {
        loopData.source.stop();
        loopData.source.disconnect();
        loopData.gainNode.disconnect();
      } catch (e) {}
      this.entityLoops.delete(entityId);
    }
  }

  cleanup() {
    this.isDisposed = true;
    if (this._unlockHandler) {
      window.removeEventListener('mousedown', this._unlockHandler);
      window.removeEventListener('keydown', this._unlockHandler);
    }
    this.entityLoops.forEach((_, id) => this.stopEntityLoop(id));
    this.activeShotNodes.forEach(n => {
      try { n.source.stop(); n.source.disconnect(); } catch (e) {}
    });
    this.activeShotNodes = [];
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
  }
}