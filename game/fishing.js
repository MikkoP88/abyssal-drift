// ============================================================================
// fishing.js — First-person fishing: rod, line, bobber, and the full
// state machine (IDLE -> CASTING -> WAITING -> BITE -> FIGHT -> CAUGHT /
// BROKEN / ESCAPED). The fight is a tension-management duel: reel to fill the
// catch meter, ease off when the line screams, or snap it.
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';
import { clamp, lerp, damp, randRange, pick } from './utils.js';

export const FishState = {
  IDLE: 'idle',
  CASTING: 'casting',
  WAITING: 'waiting',
  BITE: 'bite',
  FIGHT: 'fight',
  CAUGHT: 'caught',
  BROKEN: 'broken',
  ESCAPED: 'escaped',
};

export class FishingSystem {
  constructor(scene, camera, boat, population, audio) {
    this.scene = scene;
    this.camera = camera;
    this.boat = boat;
    this.population = population;
    this.audio = audio;
    this.enabled = true; // false while the player is on foot (no rod)

    this.state = FishState.IDLE;
    this.stateTime = 0;
    this.charge = 0;          // cast power 0..1
    this.biteWindow = 0;      // seconds left to strike
    this.tension = 0;         // 0..1
    this.catchMeter = 0;      // 0..1
    this.currentFish = null;
    this.lastResult = null;   // { fish, outcome } for HUD toast
    this.resultTimer = 0;

    // Bobber world position (simulated).
    this.bobberPos = new THREE.Vector3();
    this.linePoints = [];

    this._buildRod();
    this._buildBobber();
    this._buildLine();
  }

  _buildRod() {
    // Rod is parented to the camera so it's always in view (first person).
    this.rodGroup = new THREE.Group();
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.4, metalness: 0.6 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });

    // Main blank: tapered cylinder pointing forward-down from hands.
    const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 1.5, 8), rodMat);
    blank.rotation.x = Math.PI / 2 - 0.5;
    blank.position.set(0.18, -0.12, -0.55);
    this.rodGroup.add(blank);

    // Grip.
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.45, 8), gripMat);
    grip.rotation.x = Math.PI / 2 - 0.5;
    grip.position.set(0.12, -0.2, -0.18);
    this.rodGroup.add(grip);

    // Reel.
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), rodMat);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0.16, -0.28, -0.3);
    this.rodGroup.add(reel);
    this.reelHandle = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), rodMat);
    this.reelHandle.position.set(0.24, -0.32, -0.3);
    this.rodGroup.add(this.reelHandle);

    // Tip marker (world anchor for the line).
    this.tipMarker = new THREE.Object3D();
    this.tipMarker.position.set(0.24, 0.05, -1.15);
    this.rodGroup.add(this.tipMarker);

    this.camera.add(this.rodGroup);
    this.rodBaseQuat = this.rodGroup.quaternion.clone();
    this.rodKick = 0; // bend amount during fight
  }

  _buildBobber() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xd43a2f, roughness: 0.4 })
    );
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.5 })
    );
    top.position.y = 0.05; bottom.position.y = -0.05;
    g.add(top, bottom);
    g.visible = false;
    this.scene.add(g);
    this.bobber = g;
  }

  _buildLine() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(64 * 3), 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xd8e8ee, transparent: true, opacity: 0.75 });
    this.line = new THREE.Line(geo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.scene.add(this.line);
  }

  // ---- Public API --------------------------------------------------------

  // Injected by the game: (x, z, time) -> wave height at that point.
  setOceanSampler(fn) { this.oceanHeightAt = fn; }

  // Called by game with input edges each frame.
  update(dt, time, input) {
    this.stateTime += dt;
    if (this.resultTimer > 0) this.resultTimer -= dt;

    const F = CONFIG.fishing;
    switch (this.state) {
      case FishState.IDLE:
        if (this.enabled && input.pressedOnce('Space')) {
          this.state = FishState.CASTING;
          this.charge = 0;
          this.stateTime = 0;
        }
        break;

      case FishState.CASTING:
        this.charge = clamp(this.charge + dt / 1.4, 0, 1);
        if (!input.key('Space')) {
          this.doCast();
        }
        break;

      case FishState.WAITING: {
        // Bobber drifts with the boat + waves.
        this._updateBobberIdle(dt, time);
        // Reel it back in.
        if (input.pressedOnce('KeyR')) { this._retract(); break; }
        // Fish approach chance grows with time; pick a candidate.
        this._biteTimer = (this._biteTimer ?? randRange(F.biteWaitMin, F.biteWaitMax)) - dt;
        if (this._biteTimer <= 0) {
          const fish = this.population.nearestTo(this.bobberPos, 60);
          if (fish) {
            this.currentFish = fish;
            fish.state = 'circle';
            fish.stateTimer = 2.5;
            this.state = FishState.BITE;
            this.biteWindow = 1.6;
            this.audio.bite();
          } else {
            this._biteTimer = randRange(2, 5); // no fish nearby; wait more
          }
        }
        break;
      }

      case FishState.BITE: {
        this.biteWindow -= dt;
        this._updateBobberBite(dt, time);
        if (input.pressedOnce('KeyF') || input.pressedOnce('Space')) {
          this._hook();
        } else if (this.biteWindow <= 0) {
          // Missed the strike.
          this._releaseFish('missed');
        }
        break;
      }

      case FishState.FIGHT:
        this._updateFight(dt, time, input);
        break;

      case FishState.CAUGHT:
      case FishState.BROKEN:
      case FishState.ESCAPED:
        if (this.stateTime > 2.2) {
          this._resetToIdle();
        }
        break;
    }

    this._updateVisuals(dt, time);
  }

  doCast() {
    const F = CONFIG.fishing;
    const power = this.charge;
    const dist = lerp(F.castDistanceMin, F.castDistanceMax, power);
    const fwd = this.boat.forward();
    const tipWorld = new THREE.Vector3();
    this.tipMarker.getWorldPosition(tipWorld);
    this.bobberPos.copy(tipWorld).addScaledVector(fwd, dist);
    this.bobberPos.y = 0.2;
    this.state = FishState.WAITING;
    this.stateTime = 0;
    this._biteTimer = randRange(F.biteWaitMin, F.biteWaitMax);
    this.audio.splash(false);
  }

  _hook() {
    const F = CONFIG.fishing;
    this.state = FishState.FIGHT;
    this.stateTime = 0;
    this.tension = 0.35;
    this.catchMeter = 0;
    const fish = this.currentFish;
    fish.state = 'hooked';
    fish.fightDuration = randRange(F.fightDurationMin, F.fightDurationMax) * (0.7 + fish.species.aggression * 0.6);
    fish.fightElapsed = 0;
    fish.pullPhase = randRange(0, Math.PI * 2);
    this.audio.splash(true);
  }

  _updateFight(dt, time, input) {
    const F = CONFIG.fishing;
    const fish = this.currentFish;
    if (!fish) { this._resetToIdle(); return; }

    fish.fightElapsed += dt;

    // Fish pull: periodic surges modulated by aggression + fatigue.
    const fatigue = clamp(fish.fightElapsed / fish.fightDuration, 0, 1); // tires out
    const surge = (Math.sin(time * (1.2 + fish.species.aggression) + fish.pullPhase) * 0.5 + 0.5);
    const pullForce = (0.35 + surge * 0.65) * (1 - fatigue * 0.7) * (0.5 + fish.species.aggression * 0.7);

    const reeling = input.mouseDown;
    // Tension dynamics.
    if (reeling) {
      this.tension += dt * F.tensionRiseReel * (0.6 + pullForce);
      // Progress only while tension is in the sweet spot.
      if (this.tension >= F.sweetSpotLow && this.tension <= F.sweetSpotHigh) {
        this.catchMeter += dt * F.catchFillRate * (1 + fish.species.aggression * 0.3);
      } else if (this.tension > F.sweetSpotHigh) {
        this.catchMeter -= dt * F.catchFillRate * 0.3; // slipping back
      }
    } else {
      this.tension -= dt * F.tensionDecayIdle;
      // Fish gains ground when you slack off.
      this.catchMeter -= dt * F.catchFillRate * 0.25 * pullForce;
    }
    this.tension = clamp(this.tension, 0, 1.15);
    this.catchMeter = clamp(this.catchMeter, 0, 1);

    // Stamina cost while reeling hard.
    if (reeling && this.tension > 0.4) {
      this.onStaminaDrain?.(dt * CONFIG.player.staminaDrainReel);
    }

    // Fish position: dragged toward boat as catchMeter rises, thrashing.
    const boatPos = this.boat.pos;
    const dirToBoat = boatPos.clone().sub(this.bobberPos).normalize();
    const thrash = Math.sin(time * 6 + fish.pullPhase) * (1 - fatigue) * 2.5;
    const perp = new THREE.Vector3(-dirToBoat.z, 0, dirToBoat.x);
    const target = this.bobberPos.clone()
      .addScaledVector(dirToBoat, dt * (1 + this.catchMeter * 4))
      .addScaledVector(perp, thrash * dt);
    this.bobberPos.lerp(target, 0.5);

    // Outcomes.
    if (this.tension >= F.lineBreakTension) {
      this._endFight('broken');
      return;
    }
    if (this.catchMeter >= 1) {
      this._endFight('caught');
      return;
    }
    if (this.catchMeter <= 0 && fish.fightElapsed > fish.fightDuration * 1.5) {
      this._endFight('escaped');
      return;
    }
  }

  _endFight(outcome) {
    const fish = this.currentFish;
    if (outcome === 'caught') {
      this.state = FishState.CAUGHT;
      this.lastResult = { fish, outcome };
      this.audio.catchFanfare(fish.species.rarity < 0.15 ? 1 : 0);
      this.population.killFish(fish);
      this.onCatch?.(fish);
    } else if (outcome === 'broken') {
      this.state = FishState.BROKEN;
      this.lastResult = { fish, outcome };
      this.audio.damage();
      this._releaseFish('broken');
    } else {
      this.state = FishState.ESCAPED;
      this.lastResult = { fish, outcome };
      this._releaseFish('escaped');
    }
    this.stateTime = 0;
  }

  _releaseFish(reason) {
    if (this.currentFish) {
      this.currentFish.state = 'flee';
      this.currentFish.stateTimer = 6;
      this.currentFish.fleeFrom = this.bobberPos.clone();
    }
    this.currentFish = null;
    void reason;
  }

  _retract() {
    this._releaseFish('retracted');
    this._resetToIdle();
  }

  _resetToIdle() {
    this.state = FishState.IDLE;
    this.stateTime = 0;
    this.tension = 0;
    this.catchMeter = 0;
    this.charge = 0;
    this.currentFish = null;
    this.bobber.visible = false;
    this.line.visible = false;
  }

  // Bobber simulation helpers --------------------------------------------

  _updateBobberIdle(dt, time) {
    // Drift slowly away from boat with current, ride waves.
    const drift = new THREE.Vector3(Math.sin(time * 0.1), 0, Math.cos(time * 0.13)).multiplyScalar(0.4 * dt);
    this.bobberPos.add(drift);
    const h = this.oceanHeightAt ? this.oceanHeightAt(this.bobberPos.x, this.bobberPos.z, time) : 0;
    this.bobberPos.y = h + 0.15 + Math.sin(time * 2) * 0.03;
  }

  _updateBobberBite(dt, time) {
    // Violent dips while a fish strikes.
    const h = this.oceanHeightAt ? this.oceanHeightAt(this.bobberPos.x, this.bobberPos.z, time) : 0;
    const dip = Math.abs(Math.sin(time * 9)) * 0.5;
    this.bobberPos.y = h + 0.15 - dip;
  }

  _updateVisuals(dt, time) {
    // The rod is a first-person prop — invisible while on foot.
    this.rodGroup.visible = this.enabled;

    // Rod kick during fight (bends toward the fish).
    const targetKick = this.state === FishState.FIGHT ? this.tension * 0.5 : 0;
    this.rodKick = damp(this.rodKick, targetKick, 8, dt);
    this.rodGroup.quaternion.copy(this.rodBaseQuat);
    if (this.rodKick > 0.001) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.rodKick);
      this.rodGroup.quaternion.multiply(q);
      // Reel spins while reeling.
      if (this.state === FishState.FIGHT && this._reelingLast) {
        this.reelHandle.position.x = 0.16 + Math.cos(time * 25) * 0.05;
        this.reelHandle.position.y = -0.32 + Math.sin(time * 25) * 0.05;
      }
    }

    // Bobber + line visibility and placement.
    const active = this.state === FishState.WAITING || this.state === FishState.BITE || this.state === FishState.FIGHT;
    this.bobber.visible = active;
    this.line.visible = active;
    if (active) {
      this.bobber.position.copy(this.bobberPos);
      this.bobber.rotation.y = time * 0.5;

      // Line: quadratic sag from rod tip to bobber.
      const tipWorld = new THREE.Vector3();
      this.tipMarker.getWorldPosition(tipWorld);
      const pts = [];
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = new THREE.Vector3().lerpVectors(tipWorld, this.bobberPos, t);
        // Sag: droops in the middle, tightens with tension.
        const sagAmt = (1 - this.tension) * Math.sin(Math.PI * t);
        p.y -= sagAmt;
        pts.push(p.x, p.y, p.z);
      }
      const attr = this.line.geometry.attributes.position;
      for (let i = 0; i < pts.length / 3 && i < attr.count; i++) {
        attr.setXYZ(i, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      }
      attr.needsUpdate = true;
      this.lineMat.opacity = this.state === FishState.FIGHT ? 0.9 : 0.6;
    }

    // Track reeling for reel-handle anim.
    this._reelingLast = this.state === FishState.FIGHT && (this._mouseDownCache ?? false);
  }

  setMouseDown(v) { this._mouseDownCache = v; }

  // HUD snapshot for the UI layer.
  hud() {
    return {
      state: this.state,
      charge: this.charge,
      tension: this.tension,
      catchMeter: this.catchMeter,
      biteWindow: this.biteWindow,
      result: this.resultTimer > 0 ? this.lastResult : null,
      fishName: this.currentFish ? this.currentFish.species.name : null,
    };
  }

  dispose() {
    this.scene.remove(this.bobber, this.line);
    this.bobber.geometry?.dispose();
    this.line.geometry.dispose();
  }
}

export default FishingSystem;
