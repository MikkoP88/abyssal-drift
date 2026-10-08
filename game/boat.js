// ============================================================================
// boat.js — Player vessel: procedural hull/cabin/railings + physics +
// first-person camera rig that rides the ocean wave field.
// The hull is built from a lofted shape (THREE.Shape extruded + tapered bow)
// so it reads as a real craft, not a box.
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';
import { clamp, damp, angleLerp } from './utils.js';

function buildHullGeometry() {
  // Side profile of the hull (x = length, y = height above keel).
  const pts = [];
  const L = 9.0; // total length
  const prof = [
    [0.00, 0.00], [0.10, 0.10], [0.30, 0.34], [0.55, 0.52],
    [0.80, 0.60], [1.00, 0.62], [1.00, 0.00],
  ];
  // Loft: width varies along length (beam widest amidships, pointed bow).
  const stations = 14;
  const positions = [], uvs = [], indices = [];
  const rings = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;                 // 0 stern -> 1 bow
    const x = -L / 2 + t * L;
    // Beam envelope: narrow at both ends, wide midship.
    const beam = 2.6 * Math.pow(Math.sin(Math.PI * Math.min(t * 1.15, 1)), 0.7);
    const b = Math.max(beam, 0.15);
    // Height profile sampled by nearest control point (simple piecewise).
    let h = 0.62;
    for (let k = 0; k < prof.length - 1; k++) {
      if (t >= prof[k][0] && t <= prof[k + 1][0]) {
        const lt = (t - prof[k][0]) / (prof[k + 1][0] - prof[k][0] || 1);
        h = prof[k][1] + (prof[k + 1][1] - prof[k][1]) * lt;
        break;
      }
    }
    const ring = [];
    const segs = 8;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI; // 0..PI across the hull underside
      const y = -Math.cos(a) * h * 0.5 + h * 0.5; // bottom (-h/2) to top (+h/2)
      const z = Math.sin(a) * b;
      ring.push([x, y, z]);
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length; i++) {
    for (let j = 0; j < rings[i].length; j++) {
      const [x, y, z] = rings[i][j];
      positions.push(x, y, z);
      uvs.push(i / (rings.length - 1), j / 8);
    }
  }
  const segs = 8;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class Boat {
  constructor(scene, ocean) {
    this.scene = scene;
    this.ocean = ocean;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // tilts with waves
    this.group.add(this.body);
    scene.add(this.group);

    // State
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;           // radians, 0 = +Z? we use -Z forward convention
    this.speed = 0;
    this.throttle = 0;          // smoothed -1..1
    this.rudder = 0;            // smoothed -1..1
    this.fuel = CONFIG.boat.fuelCapacity;
    this.vel = new THREE.Vector3();

    this._buildModel();

    // Camera rig
    this.cameraPitch = 0;
    this.cameraYawOffset = 0;
    this.bobPhase = 0;
  }

  _mat(color, rough = 0.6, metal = 0.2) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  _buildModel() {
    const b = this.body;

    // Hull
    const hullGeo = buildHullGeometry();
    const hullMat = this._mat(0x8a2f2a, 0.55, 0.15);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.55;
    b.add(hull);

    // Deck planking (flat slab on top of hull).
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.12, 4.6),
      this._mat(0x6b4a2f, 0.85, 0.05)
    );
    deck.position.set(-0.1, 1.12, 0);
    b.add(deck);

    // Gunwales (trim strips).
    const trimMat = this._mat(0xd8cfc0, 0.5, 0.3);
    for (const s of [-1, 1]) {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.16, 0.14), trimMat);
      gun.position.set(-0.1, 1.22, s * 2.3);
      b.add(gun);
    }

    // Cabin aft.
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.5, 3.6),
      this._mat(0xcfc8ba, 0.6, 0.1)
    );
    cabin.position.set(-2.6, 1.95, 0);
    b.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 3.9), this._mat(0x3a3f45, 0.5, 0.4));
    roof.position.set(-2.6, 2.75, 0);
    b.add(roof);

    // Cabin windows (dark glass).
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0a1a24, roughness: 0.1, metalness: 0.9,
    });
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 2.6), glassMat);
      win.position.set(-2.6 + s * 1.63, 2.1, 0);
      b.add(win);
    }

    // Railings foredeck: posts + top rail.
    const railMat = this._mat(0x9aa0a6, 0.35, 0.8);
    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6);
    for (let i = 0; i < 6; i++) {
      const x = 1.2 + i * 1.2;
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.set(x, 1.55, s * 2.2);
        b.add(post);
      }
    }
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 7.4, 6), railMat);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(4.4, 1.9, s * 2.2);
      b.add(rail);
    }

    // Bow casting platform + rod holder.
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 3.4), this._mat(0x5a4632, 0.8, 0.05));
    platform.position.set(3.6, 1.2, 0);
    b.add(platform);
    const rodHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 8), railMat);
    rodHolder.position.set(4.2, 1.7, 1.4);
    b.add(rodHolder);

    // Outboard motor (aft).
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 1.4), this._mat(0x22262b, 0.4, 0.6));
    motor.position.set(-4.7, 0.7, 0);
    b.add(motor);
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12), this._mat(0x888e94, 0.3, 0.9));
    prop.rotation.x = Math.PI / 2;
    prop.position.set(-5.15, 0.35, 0);
    b.add(prop);
    this.propeller = prop;

    // Nav lights (small emissive spheres).
    const navGreen = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x33ff66 })
    );
    navGreen.position.set(4.9, 1.35, -2.2);
    b.add(navGreen);
    const navRed = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3333 })
    );
    navRed.position.set(4.9, 1.35, 2.2);
    b.add(navRed);

    // Headlight cone (visible at night).
    this.headlight = new THREE.SpotLight(0xfff2cc, 0, 60, Math.PI / 5, 0.4, 1.2);
    this.headlight.position.set(4.9, 1.6, 0);
    this.headlight.target.position.set(30, -2, 0);
    b.add(this.headlight);

    // Align the model: hull bow is local +X; ship forward is -Z.
    b.rotation.y = Math.PI / 2;

    // Eye anchor for the first-person camera (foredeck station).
    this.eyeAnchor = new THREE.Object3D();
    this.eyeAnchor.position.set(3.4, 1.55, 0);
    b.add(this.eyeAnchor);
  }

  // Forward vector from heading (heading 0 faces -Z, increasing rotates CW seen from above).
  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).negate();
  }

  setInput({ throttleAxis, steerAxis, boosting }) {
    const bt = CONFIG.boat;
    this.throttle = damp(this.throttle, clamp(throttleAxis, -1, 1), 3, 1 / 60);
    this.rudder = damp(this.rudder, clamp(steerAxis, -1, 1), 4, 1 / 60);
    this.boosting = boosting && this.throttle > 0;
    void bt;
  }

  update(dt, time) {
    const bt = CONFIG.boat;

    // Fuel gate: no thrust without fuel.
    const hasFuel = this.fuel > 0;
    if (hasFuel) {
      this.fuel = Math.max(0, this.fuel - dt * (bt.fuelBurnBase + Math.abs(this.throttle) * bt.fuelBurnThrottle));
    }

    // Thrust along heading.
    const fwd = this.forward();
    const maxSpd = bt.maxSpeed * (this.boosting ? bt.boostMultiplier : 1) * (hasFuel ? 1 : 0.15);
    const targetSpeed = this.throttle * maxSpd;
    this.speed = damp(this.speed, targetSpeed, hasFuel ? bt.accel / bt.maxSpeed : 2.5, dt);

    // Turn rate scales with speed (can't spin in place).
    const speedFactor = clamp(Math.abs(this.speed) / (bt.maxSpeed * 0.4), 0, 1);
    this.heading += this.rudder * bt.turnRate * speedFactor * dt * Math.sign(this.speed || 1);

    // Integrate position.
    this.pos.addScaledVector(fwd, this.speed * dt);

    // Soft boundary: push back toward center past mapRadius.
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > CONFIG.world.mapRadius) {
      const push = (r - CONFIG.world.mapRadius) * 0.5 * dt;
      this.pos.x -= (this.pos.x / r) * push;
      this.pos.z -= (this.pos.z / r) * push;
      this.speed *= 0.98;
    }

    // Ride the waves: heave + roll/pitch from surface normal.
    const wh = this.ocean.sampleWaveHeight(this.pos.x, this.pos.z, time);
    this.pos.y = CONFIG.world.seaLevel + wh * bt.bobAmplitude + 0.35;

    const n = this.ocean.sampleNormal(this.pos.x, this.pos.z, time);
    // Tilt body toward wave normal (partial follow for stability).
    const targetRoll = Math.atan2(n.x, n.y) * bt.rollFactor;
    const targetPitch = Math.atan2(n.z, n.y) * bt.pitchFactor;

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.body.rotation.z = damp(this.body.rotation.z, targetRoll, 3, dt);
    this.body.rotation.x = damp(this.body.rotation.x, targetPitch, 3, dt);

    // Propeller spin with throttle.
    this.propeller.rotation.x += this.throttle * dt * 40;

    // Night headlight.
    return { speed: this.speed, throttle: this.throttle };
  }

  // Place the first-person camera on the foredeck facing heading + look offsets.
  placeCamera(camera, yaw, pitch) {
    this.eyeAnchor.getWorldPosition(camera.position);

    // Compose orientation: boat heading (group) + player look (YXZ euler).
    const euler = new THREE.Euler(pitch, yaw, this.body.rotation.z * 0.35, 'YXZ');
    const qLook = new THREE.Quaternion().setFromEuler(euler);
    camera.quaternion.copy(this.group.quaternion).multiply(qLook);
  }

  // Called by the game with the current day factor (0 night .. 1 day).
  setHeadlight(dayFactor) {
    this.headlight.intensity = (1 - dayFactor) * 60;
  }
}

export default Boat;
