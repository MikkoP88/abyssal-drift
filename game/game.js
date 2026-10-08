// ============================================================================
// game.js — Orchestrator. Owns the renderer, the fixed-order frame loop,
// player survival state, weather, and stats. Systems are constructed here
// and updated in a stable order; each is independently portable to Unreal.
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';
import { clamp, damp, randRange } from './utils.js';
import InputManager from './input.js';
import AudioManager from './audio.js';
import OceanSystem from './ocean.js';
import SkySystem from './sky.js';
import Boat from './boat.js';
import Character, { CharState } from './character.js';
import { FishPopulation } from './fish.js';
import FishingSystem, { FishState } from './fishing.js';
import Environment from './environment.js';
import Hud from './hud.js';

export class Game {
  constructor(canvas, uiContainer) {
    this.canvas = canvas;
    this.ui = uiContainer;

    // Renderer (?preserve enables drawing-buffer readback for validation)
    const preserve = typeof location !== 'undefined' && location.search.includes('preserve');
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: CONFIG.render.antialias, powerPreference: 'high-performance',
      preserveDrawingBuffer: preserve,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.render.toneMappingExposure;

    // Scene + camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.render.fov, window.innerWidth / window.innerHeight, CONFIG.render.near, CONFIG.render.far
    );

    // Systems
    this.input = new InputManager(canvas);
    this.audio = new AudioManager();
    this.ocean = new OceanSystem(this.scene);
    this.sky = new SkySystem(this.scene);
    this.boat = new Boat(this.scene, this.ocean);
    this.character = new Character(this.scene, this.boat, this.ocean, this.audio);
    this.population = new FishPopulation(this.scene);
    this.environment = new Environment(this.scene);
    this.fishing = new FishingSystem(this.scene, this.camera, this.boat, this.population, this.audio);
    this.fishing.setOceanSampler((x, z, t) => this.ocean.sampleWaveHeight(x, z, t));
    this.hud = new Hud(this.ui);

    // Player state
    this.player = {
      health: CONFIG.player.maxHealth,
      stamina: CONFIG.player.maxStamina,
      damageFlash: 0,
    };

    // World state
    this.hour = CONFIG.time.startHour;
    this.simTime = 0;
    this.storm = false;
    this.stormTimer = randRange(60, 180);

    // Stats
    this.stats = { caught: 0, totalWeight: 0, best: null, distance: 0, time: 0 };

    // Loop state
    this.running = false;
    this.paused = false;
    this.dead = false;
    this.lastTs = 0;
    this._clock = new THREE.Clock();

    this._wireEvents();
    this._wireFishingHooks();
    this.hud.setCallbacks({
      onStart: () => this.start(),
      onRestart: () => location.reload(),
    });
    this.hud.showScreen('start');
  }

  _wireEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _wireFishingHooks() {
    this.fishing.onCatch = (fish) => {
      this.stats.caught++;
      this.stats.totalWeight += fish.weightKg;
      if (!this.stats.best || fish.weightKg > this.stats.best.weightKg) this.stats.best = fish;
      // Landing a big fish restores a bit of health (the thrill).
      this.player.health = clamp(this.player.health + 8, 0, CONFIG.player.maxHealth);
    };
    this.fishing.onStaminaDrain = (amt) => {
      this.player.stamina = clamp(this.player.stamina - amt, 0, CONFIG.player.maxStamina);
    };
  }

  start() {
    this.audio.init();
    this.hud.hideScreens();
    this.input.requestLock();
    this.running = true;
    this.lastTs = performance.now();
    requestAnimationFrame((ts) => this._frame(ts));
  }

  _frame(ts) {
    if (!this.running) return;
    const dtRaw = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const dt = clamp(dtRaw, 0, 0.05); // clamp hiccups

    // Pause toggle (Escape releases pointer lock natively; we freeze sim).
    if (this.input.pressedOnce('Escape') && !this.dead) {
      this.paused = !this.paused;
      this.hud.toast(this.paused ? 'PAUSED' : 'RESUMED', '');
    }
    if (this.paused) {
      this._render();
      this.input.endFrame();
      requestAnimationFrame((nextTs) => this._frame(nextTs));
      return;
    }

    this.tickOnce(dt);
    requestAnimationFrame((nextTs) => this._frame(nextTs));
  }

  // One deterministic simulation + render step. Exposed publicly so the
  // validation harness can drive the game frame-by-frame without rAF.
  tickOnce(dt) {
    this.simTime += dt;
    this._updateTimeWeather(dt);
    this._updatePlayer(dt);
    this._updateBoat(dt);
    this._updateCharacter(dt);
    this._updateLook(dt);
    this._updateSystems(dt);
    this._render();
    this.input.endFrame();
  }

  _updateTimeWeather(dt) {
    this.hour = (this.hour + dt / CONFIG.time.dayLengthSec * 24) % 24;

    // Weather state machine.
    this.stormTimer -= dt;
    if (this.stormTimer <= 0) {
      this.storm = !this.storm;
      this.stormTimer = this.storm
        ? randRange(CONFIG.weather.stormDurationMin, CONFIG.weather.stormDurationMax)
        : randRange(90, 240);
    }

    // Storms are harsher: drain health slowly if caught in one (cold spray).
    if (this.storm) {
      this.player.health = clamp(this.player.health - dt * 0.35, 0, CONFIG.player.maxHealth);
    } else {
      // Safe regen when not fighting.
      const fighting = this.fishing.state === FishState.FIGHT;
      if (!fighting) {
        this.player.health = clamp(this.player.health + dt * CONFIG.player.healthRegen, 0, CONFIG.player.maxHealth);
        this.player.stamina = clamp(this.player.stamina + dt * CONFIG.player.staminaRegen, 0, CONFIG.player.maxStamina);
      }
    }

    this.atmo = this.sky.update(this.hour, this.simTime, this.storm);
    this.boat.setHeadlight(this.atmo.dayFactor);
  }

  _updateBoat(dt) {
    // Helm controls only apply while the player is at the wheel.
    const atHelm = this.character.mode === CharState.HELM;
    const throttleAxis = atHelm ? this.input.axis('KeyW', 'KeyS') : 0;
    const steerAxis = atHelm ? this.input.axis('KeyD', 'KeyA') : 0; // D = turn right
    const boosting = atHelm && (this.input.key('ShiftLeft') || this.input.key('ShiftRight'));
    this.boat.setInput({ throttleAxis, steerAxis, boosting });
    const boatState = this.boat.update(dt, this.simTime);
    this.lastBoatState = boatState;
    this.stats.distance += Math.abs(boatState.speed) * dt;
  }

  _updateLook(dt) {
    const { dx, dy } = this.input.consumeMouse();
    if (this.character.mode === CharState.HELM) {
      const sens = CONFIG.player.lookSensitivity;
      this.lookYaw = (this.lookYaw ?? 0) - dx * sens;
      this.lookPitch = clamp((this.lookPitch ?? 0) - dy * sens, -1.35, 1.35);
    } else {
      // Third-person orbit camera.
      this.character.applyLook(dx, dy);
    }
  }

  _updateCharacter(dt) {
    const C = this.character;
    const inp = {
      move: this.input.axis('KeyW', 'KeyS'),
      strafe: this.input.axis('KeyD', 'KeyA'),
      jump: this.input.pressedOnce('Space'),
      swimUp: this.input.key('Space'), // held — treading water needs the sustain
      run: this.input.key('ShiftLeft') || this.input.key('ShiftRight'),
    };

    // Mode switching.
    if (this.input.pressedOnce('KeyV')) {
      if (C.mode === CharState.HELM) {
        C.disembark();
        this.hud.toast('ON FOOT — V for the helm, E to board', '');
      } else if (C.mode === CharState.ON_DECK) {
        C.toHelm();
        this.hud.toast('AT THE HELM', '');
      }
    }
    if (this.input.pressedOnce('KeyE') && C.mode === CharState.SWIMMING) {
      if (C.startBoarding()) this.hud.toast('BOARDING…', '');
    }

    const res = C.update(dt, this.simTime, inp);
    this.nearBoat = res.nearBoat;
  }

  _updatePlayer(dt) {
    this.player.damageFlash = Math.max(0, this.player.damageFlash - dt * 2);

    // Death check.
    if (this.player.health <= 0 && !this.dead) {
      this.dead = true;
      this.running = false;
      document.exitPointerLock?.();
      const s = this.stats;
      this.hud.setDeathStats(
        `Fish landed: <b>${s.caught}</b> &nbsp;·&nbsp; Total weight: <b>${Math.round(s.totalWeight)} kg</b>` +
        (s.best ? ` &nbsp;·&nbsp; Best: <b>${s.best.species.name} (${Math.round(s.best.weightKg)} kg)</b>` : '') +
        `<br/><span style="color:var(--text-dim)">Distance traveled: ${Math.round(s.distance)} m · Survived ${Math.round(this.simTime)}s</span>`
      );
      this.hud.showScreen('dead');
      return;
    }

    // Low fuel warning pulse.
    this.lowFuelPulse = this.boat.fuel < 20 ? 1 : 0;
  }

  _updateSystems(dt) {
    const camPos = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);

    // Order matters: sky -> ocean (needs sky colors) -> boat -> fish -> fishing -> env.
    this.ocean.update(
      this.simTime, camPos, this.atmo.sunDir, this.atmo.skyTop, this.atmo.skyHorizon,
      this.atmo.fogColor, this.atmo.fogDensity
    );

    this.population.update(dt, this.simTime, (x, z, t) => this.ocean.sampleWaveHeight(x, z, t));

    // Fishing only works from the helm (the rod is a first-person prop).
    const atHelm = this.character.mode === CharState.HELM;
    this.fishing.enabled = atHelm;
    this.fishing.setMouseDown(atHelm && this.input.mouseDown);
    this.fishing.update(dt, this.simTime, this.input);

    this.environment.update(dt, this.simTime, camPos, this.storm);

    // Camera placement (after boat + character moved).
    if (atHelm) {
      this.boat.placeCamera(this.camera, this.lookYaw ?? 0, this.lookPitch ?? 0);
    } else {
      this.character.placeCamera(this.camera, dt);
    }

    // Audio.
    this.audio.update(dt, {
      throttle: Math.abs(this.lastBoatState?.throttle ?? 0),
      storm: this.storm,
      tension: this.fishing.tension,
      reeling: this.input.mouseDown && this.fishing.state === FishState.FIGHT,
    });

    // HUD.
    this.hud.update({
      health: (this.player.health / CONFIG.player.maxHealth) * 100,
      stamina: (this.player.stamina / CONFIG.player.maxStamina) * 100,
      fuel: (this.boat.fuel / CONFIG.boat.fuelCapacity) * 100,
      hour: this.hour,
      storm: this.storm,
      mode: this.character.mode,
      nearBoat: this.nearBoat,
      headingDeg: (this.boat.heading * 180 / Math.PI + 360) % 360,
      fishing: this.fishing.hud(),
      damageFlash: this.player.damageFlash,
      lowFuelPulse: this.lowFuelPulse,
    });
  }

  _render() {
    this.renderer.render(this.scene, this.camera);
  }

  // Validation aid: sample average RGB of horizontal bands of the last
  // rendered frame (requires ?preserve). Bands: sky (top), sea (mid),
  // deck (bottom). Returns { sky:[r,g,b], sea:[...], deck:[...] }.
  probePixels() {
    const canvas = this.renderer.domElement;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;
    const w = canvas.width, h = canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // GL readPixels origin is bottom-left, so buffer row y maps directly to
    // screen row y (row 0 = bottom of screen = deck; row h-1 = top = sky).
    const band = (y0, y1) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const i = (y * w + x) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
        }
      }
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    };
    return {
      sky: band(Math.floor(h * 0.75), h),
      horizon: band(Math.floor(h * 0.68), Math.floor(h * 0.75)),
      sea: band(Math.floor(h * 0.45), Math.floor(h * 0.65)),
      deck: band(0, Math.floor(h * 0.2)),
    };
  }

  dispose() {
    this.running = false;
    this.audio.dispose();
    this.renderer.dispose();
  }
}

export default Game;
