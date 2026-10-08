// ============================================================================
// character.js — The visible fisherman. A procedurally-built humanoid
// (capsule limbs, jacket, cap, rod slung over the shoulder) with full
// third-person locomotion: walk / run / jump on deck, swimming in the
// water, and boarding the boat (E). The game routes camera + input to
// whichever mode is active (helm first-person vs on-foot third-person).
// Ports to UE as a Character + AnimBP: the state enum mirrors a
// UCharacterMovementComponent-style split (OnDeck / Swimming / Boarding).
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';
import { clamp, damp, angleLerp } from './utils.js';

export const CharState = {
  HELM: 'helm',        // seated at the wheel — no body shown
  ON_DECK: 'on_deck',  // walking the deck
  SWIMMING: 'swimming',
  BOARDING: 'boarding', // climbing back aboard (E)
};

const UP = new THREE.Vector3(0, 1, 0);

export class Character {
  constructor(scene, boat, ocean, audio) {
    this.scene = scene;
    this.boat = boat;
    this.ocean = ocean;
    this.audio = audio;

    this.mode = CharState.HELM;
    this.pos = new THREE.Vector3();      // feet position (world)
    this.vel = new THREE.Vector3();
    this.yaw = 0;                          // body facing
    this.camYaw = 0;                       // orbit camera yaw (absolute)
    this.camPitch = 0.32;
    this.onGround = true;
    this.walkCycle = 0;                    // limb swing phase
    this.boardT = 0;                       // boarding progress 0..1
    this.boardFrom = new THREE.Vector3();

    this._buildModel();
    this.group.visible = false;
  }

  _mat(color, rough = 0.75, metal = 0.05) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  // ---- Model -------------------------------------------------------------
  // Local space: +Z = facing direction, origin at the feet.
  _buildModel() {
    const g = new THREE.Group();

    const skin = this._mat(0xc99b76, 0.6);
    const jacket = this._mat(0x33566b, 0.8);
    const pants = this._mat(0x2c3432, 0.85);
    const boots = this._mat(0x1c1a17, 0.6, 0.1);
    const capMat = this._mat(0x27455c, 0.7);
    const ropeMat = this._mat(0x8a6f4d, 0.9);

    // Torso (jacket) — slightly bulky, shoulders squared.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.34, 4, 10), jacket);
    torso.position.y = 1.12;
    g.add(torso);
    // Zipper stripe.
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), this._mat(0xd8d2c4, 0.4, 0.4));
    zip.position.set(0, 1.14, 0.2);
    g.add(zip);

    // Head + cap.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
    head.position.y = 1.52;
    g.add(head);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), capMat);
    capTop.position.y = 1.545;
    g.add(capTop);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12, 1, false, -Math.PI / 2, Math.PI), capMat);
    brim.position.set(0, 1.545, 0.09);
    g.add(brim);

    // Arms: shoulder pivots so they can swing.
    const armGeo = new THREE.CapsuleGeometry(0.055, 0.42, 4, 8);
    const mkArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.28, 1.38, 0);
      const arm = new THREE.Mesh(armGeo, jacket);
      arm.position.y = -0.26;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skin);
      hand.position.y = -0.52;
      pivot.add(arm, hand);
      g.add(pivot);
      return pivot;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // Legs: hip pivots.
    const legGeo = new THREE.CapsuleGeometry(0.07, 0.52, 4, 8);
    const mkLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.11, 0.86, 0);
      const leg = new THREE.Mesh(legGeo, pants);
      leg.position.y = -0.32;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), boots);
      foot.position.set(0, -0.62, 0.05);
      pivot.add(leg, foot);
      g.add(pivot);
      return pivot;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // Fishing rod slung over the right shoulder (diagonal).
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.7, 6), this._mat(0x2a2f38, 0.4, 0.5));
    rod.position.set(0.18, 1.35, -0.18);
    rod.rotation.set(0.5, 0, -0.55);
    g.add(rod);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), this._mat(0x8888e9, 0.3, 0.8));
    reel.position.set(0.14, 1.16, -0.12);
    reel.rotation.z = Math.PI / 2;
    g.add(reel);

    // Rope coil on the back (fisherman kit).
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 6, 14), ropeMat);
    coil.position.set(0, 1.15, -0.22);
    g.add(coil);

    this.group = g;
    this.scene.add(g);
  }

  // ---- Mode transitions ----------------------------------------------------

  // Leave the helm: stand up on the foredeck.
  disembark() {
    if (this.mode !== CharState.HELM) return false;
    this.mode = CharState.ON_DECK;
    const a = this.boat.eyeAnchor.getWorldPosition(new THREE.Vector3());
    this.pos.copy(a);
    this.pos.y = this._deckWorldY(); // feet on the deck top surface
    this.vel.set(0, 0, 0);
    this.yaw = this.boat.heading;
    this.camYaw = this.yaw;
    this.onGround = true;
    this.group.visible = true;
    return true;
  }

  // Return to the helm (V while on deck).
  toHelm() {
    if (this.mode === CharState.SWIMMING) return false;
    this.mode = CharState.HELM;
    this.group.visible = false;
    return true;
  }

  // ---- Per-frame update ----------------------------------------------------

  /**
   * @param {number} dt
   * @param {number} time sim time
   * @param {{move:number, strafe:number, jump:boolean, run:boolean, swimUp:boolean}} inp
   * @returns {{mode:string, nearBoat:boolean}}
   */
  update(dt, time, inp) {
    const P = CONFIG.player;
    this._time = time;

    if (this.mode === CharState.HELM) {
      this.group.visible = false;
      return { mode: this.mode, nearBoat: false };
    }

    const bp = this.boat.pos;
    const nearBoat = Math.hypot(this.pos.x - bp.x, this.pos.z - bp.z) < P.boardDist;

    switch (this.mode) {
      case CharState.ON_DECK:
        this._updateDeck(dt, time, inp, bp);
        break;
      case CharState.SWIMMING:
        this._updateSwim(dt, time, inp, bp);
        break;
      case CharState.BOARDING:
        this._updateBoarding(dt);
        break;
    }

    this._animateLimbs(dt, time);
    return { mode: this.mode, nearBoat };
  }

  _updateDeck(dt, time, inp, bp) {
    const P = CONFIG.player;

    // Movement in the camera orbit frame (W = away from camera).
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, inp.move)
      .addScaledVector(right, inp.strafe);
    if (wish.lengthSq() > 1) wish.normalize();

    const speed = inp.run ? P.runSpeed : P.walkSpeed;
    const targetV = wish.multiplyScalar(speed);
    this.vel.x = damp(this.vel.x, targetV.x, 10, dt);
    this.vel.z = damp(this.vel.z, targetV.z, 10, dt);

    // Gravity + jump.
    this.vel.y -= P.gravity * dt;
    if (inp.jump && this.onGround) {
      this.vel.y = P.jumpVel;
      this.onGround = false;
      this.audio.splash(false); // thump reused as footstep-ish cue
    }

    this.pos.addScaledVector(this.vel, dt);

    // Ground = deck top (boat local y 1.18) while over the hull footprint,
    // else the water surface (falling off the side).
    // NOTE: group space — the hull is built along body +X then rotated π/2,
    // so in group space the ship length runs along Z (bow at -Z).
    const local = this._toBoatLocal(this.pos);
    const overDeck = Math.abs(local.z) < 4.4 && Math.abs(local.x) < 2.35 && local.y > 0.4;
    const deckY = this._deckWorldY();
    const surfY = CONFIG.world.seaLevel + this.ocean.sampleWaveHeight(this.pos.x, this.pos.z, time);
    const groundY = overDeck ? deckY : surfY;

    if (this.pos.y <= groundY) {
      this.pos.y = groundY;
      if (this.vel.y < -6) this.audio.splash(true); // splashdown off the side
      this.vel.y = 0;
      this.onGround = true;
    } else if (!overDeck) {
      this.onGround = false; // airborne over water
    }

    // Walked off the boat entirely -> swim.
    if (!overDeck && this.pos.y <= surfY + 0.05 && Math.hypot(local.x, local.z) > 4.6) {
      this.mode = CharState.SWIMMING;
      this.vel.set(0, 0, 0);
      this.audio.splash(true);
      return;
    }

    // Face movement direction (smoothed).
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.4) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      this.yaw = angleLerp(this.yaw, targetYaw, clamp(dt * 12, 0, 1));
    }

    // Boarding handled by game (E) — expose proximity via return value.
  }

  _updateSwim(dt, time, inp) {
    const P = CONFIG.player;

    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, inp.move)
      .addScaledVector(right, inp.strafe);
    if (wish.lengthSq() > 1) wish.normalize();

    this.vel.x = damp(this.vel.x, wish.x * P.swimSpeed, 6, dt);
    this.vel.z = damp(this.vel.z, wish.z * P.swimSpeed, 6, dt);

    // Vertical: sink gently, climb to surface while holding Space.
    const surfY = CONFIG.world.seaLevel + this.ocean.sampleWaveHeight(this.pos.x, this.pos.z, time);
    const maxDepth = surfY - P.swimDepth;
    if (inp.swimUp) {
      this.vel.y = damp(this.vel.y, P.swimUpSpeed, 4, dt);
    } else {
      this.vel.y = damp(this.vel.y, -P.swimSink, 2.5, dt);
    }
    this.pos.addScaledVector(this.vel, dt);

    // Clamp: can't dive deeper than swimDepth; can't rise above surface.
    if (this.pos.y < maxDepth) { this.pos.y = maxDepth; this.vel.y = Math.max(this.vel.y, 0); }
    if (this.pos.y > surfY - 0.35) { this.pos.y = surfY - 0.35; this.vel.y = Math.min(this.vel.y, 0); }

    // Face movement direction.
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.3) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      this.yaw = angleLerp(this.yaw, targetYaw, clamp(dt * 8, 0, 1));
    }

    // Gentle bobbing while treading water.
    this._bobOffset = Math.sin(time * 2.2) * 0.08;
  }

  _updateBoarding(dt) {
    // Arc from water position up onto the foredeck station.
    this.boardT = clamp(this.boardT + dt / 1.1, 0, 1);
    const t = this.boardT;
    const dest = this._deckStationWorld();
    // Lift out of the water with a parabolic arc.
    const lift = Math.sin(t * Math.PI) * 2.2;
    this.pos.lerpVectors(this.boardFrom, dest, t);
    this.pos.y += lift;
    // Face the boat while climbing.
    const toBoat = Math.atan2(this.boat.pos.x - this.pos.x, this.boat.pos.z - this.pos.z);
    this.yaw = angleLerp(this.yaw, toBoat, clamp(dt * 6, 0, 1));

    if (t >= 1) {
      // Done: standing on the foredeck, ready to walk or press V for the helm.
      this.mode = CharState.ON_DECK;
      this.onGround = true;
      this.pos.copy(dest);
      this.vel.set(0, 0, 0);
      this.audio.splash(false);
    }
  }

  // Start boarding from the water (called by game when E pressed near boat).
  startBoarding() {
    if (this.mode !== CharState.SWIMMING) return false;
    this.mode = CharState.BOARDING;
    this.boardT = 0;
    this.boardFrom.copy(this.pos);
    return true;
  }

  // ---- Helpers -------------------------------------------------------------

  _toBoatLocal(worldPos) {
    // Inverse of boat group transform (position + yaw). Body tilt ignored —
    // close enough for grounding checks.
    const dx = worldPos.x - this.boat.pos.x;
    const dz = worldPos.z - this.boat.pos.z;
    const c = Math.cos(-this.boat.heading), s = Math.sin(-this.boat.heading);
    return new THREE.Vector3(dx * c - dz * s, worldPos.y - this.boat.pos.y, dx * s + dz * c);
  }

  _deckWorldY() {
    // Deck top surface in world space (boat y + local deck offset).
    return this.boat.pos.y + 1.18;
  }

  _deckStationWorld() {
    // Foredeck standing station in world space (group space: bow at -Z).
    const local = new THREE.Vector3(0, 1.18, -3.4);
    const c = Math.cos(this.boat.heading), s = Math.sin(this.boat.heading);
    return new THREE.Vector3(
      this.boat.pos.x + local.x * c + local.z * s,
      this._deckWorldY(),
      this.boat.pos.z - local.x * s + local.z * c
    );
  }

  _animateLimbs(dt, time) {
    if (!this.group.visible) return;

    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const swimming = this.mode === CharState.SWIMMING;

    if (swimming) {
      // Dog-paddle: slow alternating arm swings, legs scissor subtly.
      const ph = time * 3.2;
      this.armL.rotation.x = Math.sin(ph) * 0.7;
      this.armR.rotation.x = -Math.sin(ph) * 0.7;
      this.armL.rotation.z = 0.5;
      this.armR.rotation.z = -0.5;
      this.legL.rotation.x = Math.sin(ph + Math.PI / 2) * 0.35;
      this.legR.rotation.x = -Math.sin(ph + Math.PI / 2) * 0.35;
      // Body pitches forward in the water.
      this.group.rotation.x = damp(this.group.rotation.x, 0.5, 4, dt);
      this.group.rotation.z = Math.sin(time * 1.4) * 0.06;
    } else {
      // Walk cycle: swing opposite limbs by speed-proportional phase.
      this.walkCycle += hSpeed * dt * 2.6;
      const amp = clamp(hSpeed / CONFIG.player.walkSpeed, 0, 1.4) * 0.6;
      const swing = Math.sin(this.walkCycle) * amp;
      const airborne = !this.onGround;
      this.legL.rotation.x = damp(this.legL.rotation.x, airborne ? -0.5 : swing, 14, dt);
      this.legR.rotation.x = damp(this.legR.rotation.x, airborne ? 0.4 : -swing, 14, dt);
      this.armL.rotation.x = damp(this.armL.rotation.x, airborne ? -2.4 : -swing * 0.8, 14, dt);
      this.armR.rotation.x = damp(this.armR.rotation.x, airborne ? -2.4 : swing * 0.8, 14, dt);
      this.armL.rotation.z = damp(this.armL.rotation.z, 0.06, 8, dt);
      this.armR.rotation.z = damp(this.armR.rotation.z, -0.06, 8, dt);
      this.group.rotation.x = damp(this.group.rotation.x, 0, 8, dt);
      this.group.rotation.z = damp(this.group.rotation.z, 0, 8, dt);
      // Idle sway when standing still.
      if (hSpeed < 0.3) {
        this.group.position.y = Math.sin(time * 1.8) * 0.012;
      } else {
        this.group.position.y = 0;
      }
    }

    // Place + face. Swim position sinks the hips below the surface line.
    this.group.position.copy(this.pos);
    if (swimming) {
      this.group.position.y += (this._bobOffset || 0) - 0.12; // chest at surface
    }
    this.group.rotation.y = this.yaw;
  }

  // ---- Third-person camera -------------------------------------------------

  /** Orbit camera behind the character. Returns true if it placed the camera. */
  placeCamera(camera, dt) {
    const P = CONFIG.player;
    const dist = 4.2;
    const cp = clamp(this.camPitch, -0.25, 1.2);

    const target = this.pos.clone(); target.y += 1.35; // look at chest

    const off = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(cp),
      Math.sin(cp),
      Math.cos(this.camYaw) * Math.cos(cp)
    ).multiplyScalar(dist);

    const desired = target.clone().add(off);

    // Keep the camera above the water surface (never under the waves).
    const surfY = CONFIG.world.seaLevel + this.ocean.sampleWaveHeight(desired.x, desired.z, this._time || 0) + 0.4;
    if (desired.y < surfY) desired.y = surfY;

    // Smooth follow (critically damped-ish).
    camera.position.lerp(desired, clamp(dt * 12, 0, 1));

    // Orientation: look at the character's chest.
    const lookTarget = target.clone();
    camera.up.copy(UP);
    camera.lookAt(lookTarget);

    return true;
  }

  // Apply raw mouse deltas to the orbit angles (call from game's look update).
  applyLook(dx, dy) {
    const sens = CONFIG.player.lookSensitivity * 0.9;
    this.camYaw -= dx * sens;
    this.camPitch = clamp(this.camPitch + dy * sens, -0.25, 1.2);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); });
  }
}

export default Character;
