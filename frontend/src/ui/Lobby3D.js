import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ApiClient } from '../services/apiClient.js';
import { networkManager } from '../systems/NetworkManager.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';

const CHARACTERS = [
  { id: 'Matt',  label: 'MATT',  path: '/deadzone-assets/Characters_Matt.gltf' },
  { id: 'Lis',   label: 'LIS',   path: '/deadzone-assets/Characters_Lis.gltf' },
  { id: 'Shaun', label: 'SHAUN', path: '/deadzone-assets/Characters_Shaun.gltf' },
  { id: 'Sam',   label: 'SAM',   path: '/deadzone-assets/Characters_Sam.gltf' }
];

export class Lobby3D {
  constructor(canvas, onStartGame) {
    this.canvas = canvas;
    this.onStartGame = onStartGame; 
    this.isDisposed = false;

    this.selectedCharacter = 'Matt';
    this.user = ApiClient.getSavedUser();
    this.currentRoom = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0e12);
    this.scene.fog = new THREE.FogExp2(0x0c0e12, 0.055);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 60);
    this.camera.position.set(0, 1.55, 3.6);
    this.camera.lookAt(0, 1.0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1);

    this.loader = new GLTFLoader();
    this.characterCache = {};
    this.activeCharModel = null;
    this.activeMixer = null;
    this.prevTime = performance.now();

    this._setup3DStage();
    this._buildOverlayUI();
    this._loadCharacterPreview(this.selectedCharacter);
    this._bindNetworkCallbacks();

    this._onResize = () => {
      if (this.isDisposed) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);

    this.renderer.setAnimationLoop((t) => this._animate(t));
  }

  _setup3DStage() {
    const hemi = new THREE.HemisphereLight(0x88aaff, 0x222233, 0.8);
    this.scene.add(hemi);

    const spot = new THREE.PointLight(0xffaa44, 7, 12, 1.5);
    spot.position.set(1.2, 3.5, 2.0);
    this.scene.add(spot);

    const rim = new THREE.DirectionalLight(0x00ddff, 1.5);
    rim.position.set(-3, 3, -3);
    this.scene.add(rim);

    const padGeo = new THREE.CylinderGeometry(1.15, 1.3, 0.14, 24);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.6 });
    this.pedestal = new THREE.Mesh(padGeo, padMat);
    this.pedestal.position.y = -0.07;
    this.scene.add(this.pedestal);
  }

  _loadCharacterPreview(charId) {
    if (this.activeCharModel) {
      this.scene.remove(this.activeCharModel);
      this.activeCharModel = null;
      this.activeMixer = null;
    }

    const charCfg = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];

    const attachModel = (gltf) => {
      if (this.isDisposed || this.selectedCharacter !== charId) return;
      const model = gltf.scene;
      shaderPipeline.optimizeModel(model, false, true);

      const box = new THREE.Box3().setFromObject(model);
      model.position.set(0, -box.min.y, 0);

      const weapons = ['Axe', 'Guitar', 'Knife', 'Pistol', 'Rifle', 'Shotgun', 'SMG', 'Spear', 'WoodenBat_Barbed', 'WoodenBat_Saw'];
      weapons.forEach(w => {
        const m = model.getObjectByName(w);
        if (m) m.visible = (w === 'Rifle');
      });

      this.activeMixer = new THREE.AnimationMixer(model);
      const idleClip = gltf.animations.find(a => a.name === 'Idle_Gun' || a.name === 'Idle') || gltf.animations[0];
      if (idleClip) {
        this.activeMixer.clipAction(idleClip).play();
      }

      this.activeCharModel = model;
      this.scene.add(model);
    };

    if (this.characterCache[charId]) {
      attachModel(this.characterCache[charId]);
      return;
    }

    this.loader.load(charCfg.path, (gltf) => {
      this.characterCache[charId] = gltf;
      attachModel(gltf);
    });
  }

  _bindNetworkCallbacks() {
    networkManager.onLobbyUpdated = (room) => {
      this.currentRoom = room;
      this._refreshUIState();
    };

    networkManager.onMatchStart = ({ room, worldState }) => {
      this._showLoadingScreenAndStart('multi', room, worldState);
    };
  }

  _buildOverlayUI() {
    document.querySelectorAll('#deadzone-lobby-ui, #deadzone-loading-screen').forEach(el => el.remove());

    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes titleGlow {
        0%, 100% { text-shadow: 0 0 20px rgba(255,170,68,0.3), 0 0 40px rgba(255,170,68,0.1); }
        50% { text-shadow: 0 0 35px rgba(255,170,68,0.7), 0 0 70px rgba(255,170,68,0.3); }
      }
      .dz-title {
        animation: titleGlow 4s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);

    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'deadzone-lobby-ui';
    this.uiRoot.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 500;
      font-family: monospace; color: #fff; display: flex; flex-direction: column; justify-content: space-between; padding: 32px;
    `;

    // TOP BAR
    const topBar = document.createElement('div');
    topBar.style.cssText = `display: flex; justify-content: space-between; align-items: center; pointer-events: auto;`;
    topBar.innerHTML = `
      <div>
        <h1 class="dz-title" style="margin: 0; font-size: 2.8rem; color: #ffaa44; letter-spacing: 6px; font-weight: 900;">DEADZONE</h1>
      </div>
    `;

    this.authArea = document.createElement('div');
    this.authArea.style.cssText = `display: flex; align-items: center; gap: 14px;`;
    topBar.appendChild(this.authArea);
    this.uiRoot.appendChild(topBar);

    // MIDDLE SECTION
    const midSection = document.createElement('div');
    midSection.style.cssText = `display: flex; justify-content: space-between; align-items: center; flex: 1;`;

    this.leftPanel = document.createElement('div');
    this.leftPanel.style.cssText = `
      width: 320px; background: rgba(18, 20, 24, 0.92); border: 1px solid #333;
      border-radius: 12px; padding: 22px; pointer-events: auto; display: flex; flex-direction: column; gap: 14px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.8);
    `;
    midSection.appendChild(this.leftPanel);

    this.rightPanel = document.createElement('div');
    this.rightPanel.style.cssText = `
      width: 320px; background: rgba(18, 20, 24, 0.92); border: 1px solid #333;
      border-radius: 12px; padding: 22px; pointer-events: auto; display: none; flex-direction: column; gap: 12px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.8);
    `;
    midSection.appendChild(this.rightPanel);
    this.uiRoot.appendChild(midSection);

    // BOTTOM BAR: Character selector
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = `display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: auto;`;
    const charTitle = document.createElement('div');
    charTitle.innerText = 'OPERATIVE';
    charTitle.style.cssText = `color: #666; font-size: 0.8rem; letter-spacing: 3px;`;
    bottomBar.appendChild(charTitle);

    this.charBtnContainer = document.createElement('div');
    this.charBtnContainer.style.cssText = `display: flex; gap: 10px;`;
    bottomBar.appendChild(this.charBtnContainer);
    this.uiRoot.appendChild(bottomBar);

    // AUTH MODAL
    this.authModal = document.createElement('div');
    this.authModal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 380px; background: #16181c; border: 2px solid #ffaa44; border-radius: 12px;
      padding: 24px; display: none; flex-direction: column; gap: 12px; pointer-events: auto; z-index: 1000;
      box-shadow: 0 20px 50px rgba(0,0,0,0.9);
    `;
    this.uiRoot.appendChild(this.authModal);

    // LOADING SCREEN OVERLAY (For Multiplayer Match Sync)
    this.loadingScreen = document.createElement('div');
    this.loadingScreen.id = 'deadzone-loading-screen';
    this.loadingScreen.style.cssText = `
      position: fixed; inset: 0; background: #0c0e12; z-index: 2000;
      display: none; flex-direction: column; align-items: center; justify-content: center;
      font-family: monospace; color: #fff; gap: 16px;
    `;
    this.loadingScreen.innerHTML = `
      <h2 style="color: #ffaa44; letter-spacing: 4px; margin: 0;">LOADING SECTOR...</h2>
      <div style="color: #888; font-size: 0.9rem;">Waiting for squad synchronization</div>
      <div style="width: 240px; height: 6px; background: #222; border-radius: 3px; overflow: hidden;">
        <div id="dz-load-bar" style="width: 100%; height: 100%; background: #ffaa44; transition: width 0.3s;"></div>
      </div>
    `;
    document.body.appendChild(this.loadingScreen);
    document.body.appendChild(this.uiRoot);

    this._refreshUIState();
  }

  _refreshUIState() {
    this.authArea.innerHTML = '';
    if (this.user) {
      const badge = document.createElement('span');
      badge.style.cssText = `color: #33ff66; font-size: 0.95rem; font-weight: bold;`;
      badge.innerText = this.user.username.toUpperCase();
      this.authArea.appendChild(badge);

      const signOutBtn = document.createElement('button');
      signOutBtn.innerText = 'SIGN OUT';
      signOutBtn.style.cssText = `background: #2a1515; color: #ff5555; border: 1px solid #552222; padding: 8px 14px; border-radius: 6px; font-family: monospace; font-weight: bold; cursor: pointer;`;
      signOutBtn.onclick = () => {
        ApiClient.clearAuth();
        networkManager.disconnect();
        this.user = null;
        this.currentRoom = null;
        this._refreshUIState();
      };
      this.authArea.appendChild(signOutBtn);
    } else {
      const loginBtn = document.createElement('button');
      loginBtn.innerText = 'SIGN IN';
      loginBtn.style.cssText = `background: #ffaa44; color: #111; border: none; padding: 9px 18px; border-radius: 6px; font-family: monospace; font-weight: bold; cursor: pointer;`;
      loginBtn.onclick = () => this._openAuthModal();
      this.authArea.appendChild(loginBtn);
    }

    this.charBtnContainer.innerHTML = '';
    CHARACTERS.forEach(c => {
      const active = this.selectedCharacter === c.id;
      const btn = document.createElement('button');
      btn.innerText = c.label;
      btn.style.cssText = `
        padding: 8px 18px; font-family: monospace; font-size: 0.9rem; font-weight: bold;
        border-radius: 6px; cursor: pointer;
        background: ${active ? '#ffaa44' : '#1c1f24'};
        color: ${active ? '#111' : '#888'};
        border: 1px solid ${active ? '#ffaa44' : '#333'};
      `;
      btn.onclick = () => {
        this.selectedCharacter = c.id;
        this._loadCharacterPreview(c.id);
        networkManager.selectCharacter(c.id);
        this._refreshUIState();
      };
      this.charBtnContainer.appendChild(btn);
    });

    this.leftPanel.innerHTML = '';
    const spBtn = document.createElement('button');
    spBtn.innerText = 'SOLO DEPLOY';
    spBtn.style.cssText = `
      background: #22262b; color: #fff; border: 1px solid #444; padding: 12px; border-radius: 6px;
      font-family: monospace; font-size: 0.95rem; font-weight: bold; cursor: pointer; transition: background 0.2s;
    `;
    spBtn.onmouseenter = () => spBtn.style.background = '#2e8b57';
    spBtn.onmouseleave = () => spBtn.style.background = '#22262b';
    spBtn.onclick = () => this._showLoadingScreenAndStart('single', null, null);
    this.leftPanel.appendChild(spBtn);

    const divider = document.createElement('div');
    divider.style.cssText = `border-top: 1px solid #2a2e33; margin: 6px 0; padding-top: 8px; color: #666; font-size: 0.75rem; letter-spacing: 1px;`;
    divider.innerText = this.user ? 'SQUAD LOBBY (2-4 PLAYERS)' : 'SIGN IN FOR SQUAD MODE';
    this.leftPanel.appendChild(divider);

    const createBtn = document.createElement('button');
    createBtn.innerText = 'CREATE SQUAD';
    createBtn.disabled = !this.user;
    createBtn.style.cssText = `
      background: ${this.user ? '#1e2228' : '#141619'}; color: ${this.user ? '#fff' : '#555'};
      border: 1px solid ${this.user ? '#555' : '#222'}; padding: 11px; border-radius: 6px; font-family: monospace; font-weight: bold;
      cursor: ${this.user ? 'pointer' : 'not-allowed'};
    `;
    createBtn.onclick = async () => {
      try {
        this.currentRoom = await networkManager.createRoom(this.selectedCharacter);
        this._refreshUIState();
      } catch (err) {
        alert(err.message);
      }
    };
    this.leftPanel.appendChild(createBtn);

    const joinRow = document.createElement('div');
    joinRow.style.cssText = `display: flex; gap: 8px;`;
    const codeInput = document.createElement('input');
    codeInput.placeholder = 'CODE';
    codeInput.disabled = !this.user;
    codeInput.style.cssText = `
      flex: 1; background: #121418; border: 1px solid #333; color: #fff; padding: 10px;
      border-radius: 6px; font-family: monospace; text-transform: uppercase;
    `;
    const joinBtn = document.createElement('button');
    joinBtn.innerText = 'JOIN';
    joinBtn.disabled = !this.user;
    joinBtn.style.cssText = `
      background: ${this.user ? '#ffaa44' : '#141619'}; color: ${this.user ? '#111' : '#555'};
      border: none; padding: 10px 16px; border-radius: 6px; font-family: monospace; font-weight: bold;
      cursor: ${this.user ? 'pointer' : 'not-allowed'};
    `;
    joinBtn.onclick = async () => {
      try {
        this.currentRoom = await networkManager.joinRoom(codeInput.value, this.selectedCharacter);
        this._refreshUIState();
      } catch (err) {
        alert(err.message);
      }
    };
    joinRow.appendChild(codeInput);
    joinRow.appendChild(joinBtn);
    this.leftPanel.appendChild(joinRow);

    if (this.currentRoom) {
      this.rightPanel.style.display = 'flex';
      this.rightPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2a2e33; padding-bottom: 8px;">
          <span style="color: #ffaa44; font-weight: bold; font-size: 0.95rem;">ROOM: ${this.currentRoom.code}</span>
          <span style="color: #33ff66;">${this.currentRoom.players.length} / 4</span>
        </div>
      `;

      this.currentRoom.players.forEach(p => {
        const isHost = p.socketId === this.currentRoom.hostSocketId;
        const row = document.createElement('div');
        row.style.cssText = `display: flex; justify-content: space-between; background: #141619; padding: 8px 10px; border-radius: 6px; font-size: 0.9rem;`;
        row.innerHTML = `
          <span>${p.username} ${isHost ? '👑' : ''}</span>
          <span style="color: #00ddff;">[${p.character}]</span>
        `;
        this.rightPanel.appendChild(row);
      });

      const isLocalHost = networkManager.socket?.id === this.currentRoom.hostSocketId;
      const canStart = this.currentRoom.players.length >= 2 && this.currentRoom.players.length <= 4;

      if (isLocalHost) {
        const startBtn = document.createElement('button');
        startBtn.innerText = canStart ? 'DEPLOY SQUAD (2-4)' : 'WAITING FOR SQUAD (MIN 2)...';
        startBtn.disabled = !canStart;
        startBtn.style.cssText = `
          margin-top: 6px; padding: 12px; border: none; border-radius: 6px;
          background: ${canStart ? '#33cc33' : '#222'}; color: ${canStart ? '#111' : '#666'};
          font-family: monospace; font-weight: bold; cursor: ${canStart ? 'pointer' : 'not-allowed'};
        `;
        startBtn.onclick = async () => {
          try {
            await networkManager.startMatch();
          } catch (err) {
            alert(err.message);
          }
        };
        this.rightPanel.appendChild(startBtn);
      } else {
        const waitTxt = document.createElement('div');
        waitTxt.style.cssText = `color: #666; text-align: center; padding-top: 6px; font-size: 0.85rem;`;
        waitTxt.innerText = 'Waiting for Host to deploy...';
        this.rightPanel.appendChild(waitTxt);
      }
    } else {
      this.rightPanel.style.display = 'none';
    }
  }

  _openAuthModal() {
    this.authModal.style.display = 'flex';
    this.authModal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; color: #ffaa44; font-size: 1.1rem;">AUTHENTICATION</h3>
        <button id="auth-close-btn" style="background: none; border: none; color: #888; font-size: 1.2rem; cursor: pointer;">X</button>
      </div>
      <input id="auth-user" placeholder="Username (New Account)" style="padding: 10px; background: #121418; border: 1px solid #333; color: #fff; border-radius: 6px; font-family: monospace;" />
      <input id="auth-email" type="email" placeholder="Email Address" style="padding: 10px; background: #121418; border: 1px solid #333; color: #fff; border-radius: 6px; font-family: monospace;" />
      <input id="auth-pass" type="password" placeholder="Password" style="padding: 10px; background: #121418; border: 1px solid #333; color: #fff; border-radius: 6px; font-family: monospace;" />
      <button id="auth-send-otp" style="padding: 11px; background: #1e2228; border: 1px solid #444; color: #fff; border-radius: 6px; font-family: monospace; font-weight: bold; cursor: pointer;">REQUEST OTP</button>

      <div id="otp-verify-section" style="display: none; flex-direction: column; gap: 8px; border-top: 1px solid #2a2e33; padding-top: 10px;">
        <input id="auth-otp" placeholder="6-Digit OTP" style="padding: 10px; background: #121418; border: 1px solid #33ff66; color: #33ff66; border-radius: 6px; font-family: monospace; text-align: center; letter-spacing: 4px;" />
        <button id="auth-verify-btn" style="padding: 11px; background: #2e8b57; color: #fff; border: none; border-radius: 6px; font-family: monospace; font-weight: bold; cursor: pointer;">VERIFY & SIGN IN</button>
      </div>

      <div style="border-top: 1px solid #2a2e33; padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
        <button id="auth-google-btn" style="
          padding: 11px; background: #ffffff; color: #1f1f1f; border: none;
          border-radius: 6px; font-family: sans-serif; font-weight: 600; font-size: 0.9rem;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
        ">
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>Sign in with Google</span>
        </button>
      </div>
      <div id="auth-msg" style="color: #ffaa44; font-size: 0.8rem; min-height: 16px;"></div>
    `;

    this.authModal.querySelector('#auth-close-btn').onclick = () => {
      this.authModal.style.display = 'none';
    };

    const msgEl = this.authModal.querySelector('#auth-msg');

    this.authModal.querySelector('#auth-send-otp').onclick = async () => {
      const username = this.authModal.querySelector('#auth-user').value;
      const email = this.authModal.querySelector('#auth-email').value;
      const password = this.authModal.querySelector('#auth-pass').value;
      try {
        msgEl.innerText = 'Sending OTP...';
        const res = await ApiClient.requestOTP(username, email, password);
        msgEl.innerText = res.message;
        this.authModal.querySelector('#otp-verify-section').style.display = 'flex';
      } catch (err) {
        msgEl.innerText = err.message;
      }
    };

    this.authModal.querySelector('#auth-verify-btn').onclick = async () => {
      const email = this.authModal.querySelector('#auth-email').value;
      const otp = this.authModal.querySelector('#auth-otp').value;
      try {
        const data = await ApiClient.verifyOTP(email, otp);
        this.user = data.user;
        this.authModal.style.display = 'none';
        this._refreshUIState();
      } catch (err) {
        msgEl.innerText = err.message;
      }
    };

    this.authModal.querySelector('#auth-google-btn').onclick = async () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        msgEl.innerText = 'Missing VITE_GOOGLE_CLIENT_ID in frontend .env!';
        return;
      }

      try {
        msgEl.innerText = 'Opening Google Sign-In...';
        const google = await this._ensureGoogleGsiLoaded();

        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          prompt: 'select_account',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              msgEl.innerText = `Google Error: ${tokenResponse.error}`;
              return;
            }
            try {
              msgEl.innerText = 'Verifying Google account...';
              const data = await ApiClient.googleLogin({ accessToken: tokenResponse.access_token });
              this.user = data.user;
              this.authModal.style.display = 'none';
              this._refreshUIState();
            } catch (err) {
              msgEl.innerText = err.message;
            }
          }
        });
        tokenClient.requestAccessToken();
      } catch (err) {
        msgEl.innerText = err.message;
      }
    };
  }

  _ensureGoogleGsiLoaded() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve(window.google);
      let script = document.getElementById('google-gsi-script');
      if (!script) {
        script = document.createElement('script');
        script.id = 'google-gsi-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.onload = () => resolve(window.google);
      script.onerror = () => reject(new Error('Failed to load Google script'));
    });
  }

  _showLoadingScreenAndStart(mode, room, worldState) {
    this.loadingScreen.style.display = 'flex';
    const bar = document.getElementById('dz-load-bar');
    if (bar) bar.style.width = '100%';

    setTimeout(() => {
      this.cleanup();
      this.onStartGame({ mode, character: this.selectedCharacter, room, worldState });
    }, 800);
  }

  _animate(time) {
    if (this.isDisposed) return;
    const delta = Math.min((time - this.prevTime) / 1000, 0.1);
    this.prevTime = time;

    if (this.activeMixer) this.activeMixer.update(delta);
    if (this.activeCharModel) {
      this.activeCharModel.rotation.y += delta * 0.4;
    }

    this.renderer.render(this.scene, this.camera);
  }

  cleanup() {
    this.isDisposed = true;
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    if (this.uiRoot) this.uiRoot.remove();
    if (this.loadingScreen) this.loadingScreen.remove();
    this.renderer.dispose();
  }
}