// ============================================================================
// fish.js — Procedural monster fish.
// Geometry is generated from species data in config.js (no external models):
//   - Body: a spine of elliptical cross-sections lofted into a BufferGeometry.
//   - Fins: dorsal ridge, pectoral fins, caudal (tail) fin.
//   - Mouth: tooth ring (cones) for aggressive species; glowing eye spheres.
//   - Kraken: special cephalopod build (mantle dome + 8 tentacle tubes).
// Animation: CPU spine-undulation (traveling sine) deforming body vertices —
// cheap at this poly budget and easy to port to skeletal animation in UE.
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';
import { clamp, lerp, randRange, pick } from './utils.js';

const BODY_RINGS = 26;
const BODY_SEGS = 14;

// ---------------------------------------------------------------------------
// Geometry builders
// ---------------------------------------------------------------------------

function loftBody(spineFn, rings, segs) {
  // spineFn(t) -> { x, y, z, rx, rz } center + radii at normalized length t.
  const positions = [], normals = [], indices = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const s = spineFn(t);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const px = s.x + Math.cos(a) * s.rx;
      const py = s.y + Math.sin(a) * s.rz;
      const pz = s.z;
      positions.push(px, py, pz);
      normals.push(Math.cos(a), Math.sin(a), 0);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

function finGeometry(width, height, curve = 0.4) {
  // Simple curved triangular fin in the XY plane, double-sided.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width * 0.5, height * curve, width, height);
  shape.lineTo(width * 0.9, height * 0.55);
  shape.quadraticCurveTo(width * 0.45, height * 0.25, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 6);
  return geo;
}

// ---------------------------------------------------------------------------
// Fish entity
// ---------------------------------------------------------------------------

export class Fish {
  constructor(species, position) {
    this.species = species;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.heading = randRange(0, Math.PI * 2);
    this.depth = randRange(species.depthBand[0], species.depthBand[1]);
    this.phase = randRange(0, Math.PI * 2);
    this.swimSpeed = species.speed * randRange(0.8, 1.2);
    this.state = 'wander';       // wander | circle | flee | hooked
    this.stateTimer = randRange(3, 8);
    this.weightKg = randRange(species.weightKg[0], species.weightKg[1]);
    this._build();
  }

  _skinMat() {
    return new THREE.MeshStandardMaterial({
      color: this.species.hue,
      roughness: 0.55,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
  }

  _bellyMat() {
    return new THREE.MeshStandardMaterial({
      color: this.species.belly, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide,
    });
  }

  _build() {
    const sp = this.species;
    const L = sp.length;
    const skin = this._skinMat();
    const belly = this._bellyMat();

    if (sp.id === 'kraken') { this._buildKraken(L, skin, belly); return; }
    if (sp.id === 'leviathan') { this._buildRay(L, skin, belly); return; }

    // Standard / eel / whale / gulper: lofted spine.
    const isEel = sp.id === 'serpent';
    const isWhale = sp.id === 'aurora';
    const isGulper = sp.id === 'gulper';

    const spineFn = (t) => {
      // Radius profile: nose -> bulge -> taper to tail.
      let r;
      if (isEel) r = sp.girth * 0.5 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(t * 1.05, 1)));
      else if (isWhale) r = sp.girth * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8);
      else r = sp.girth * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(t * 1.08, 1)), 0.85);
      if (isGulper && t < 0.22) r *= 1.35; // huge jaw region
      const x = -L / 2 + t * L;
      return { x, y: 0, z: 0, rx: r * (isEel ? 0.8 : 1), rz: r * (isWhale ? 1.15 : 0.8) };
    };

    this.bodyGeo = loftBody(spineFn, BODY_RINGS, BODY_SEGS);
    this.body = new THREE.Mesh(this.bodyGeo, skin);
    this.group.add(this.body);

    // Belly patch (slightly inset clone, lower half tinted).
    const bellyMesh = new THREE.Mesh(this.bodyGeo, belly);
    bellyMesh.scale.set(0.985, 0.985, 0.985);
    bellyMesh.position.y = -sp.girth * 0.12;
    this.group.add(bellyMesh);

    // Dorsal fin ridge.
    const dorsal = new THREE.Mesh(finGeometry(L * (isEel ? 0.5 : 0.35), sp.girth * (isWhale ? 0.5 : 0.9), 0.5), skin);
    dorsal.position.set(isEel ? -L * 0.1 : -L * 0.05, sp.girth * 0.42, 0);
    dorsal.rotation.y = Math.PI / 2;
    this.group.add(dorsal);

    // Pectoral fins.
    if (!isEel) {
      for (const s of [-1, 1]) {
        const pec = new THREE.Mesh(finGeometry(L * 0.16, sp.girth * 0.5, 0.6), skin);
        pec.position.set(L * 0.18, -sp.girth * 0.1, s * sp.girth * 0.4);
        pec.rotation.y = s * Math.PI / 2;
        pec.rotation.z = s * -0.5;
        this.group.add(pec);
      }
    }

    // Caudal fin (animated separately).
    const tail = new THREE.Mesh(finGeometry(L * (isWhale ? 0.22 : 0.3), sp.girth * (isWhale ? 0.9 : 1.1), 0.7), skin);
    tail.position.set(-L / 2 - L * 0.02, 0, 0);
    tail.rotation.y = Math.PI / 2;
    this.tail = tail;
    this.group.add(tail);

    // Eyes: glowing spheres.
    const eyeMat = new THREE.MeshBasicMaterial({ color: sp.glowEyes });
    const eyeR = Math.max(0.12, sp.girth * 0.09);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 10, 10), eyeMat);
      eye.position.set(L * 0.42, sp.girth * 0.12, s * sp.girth * 0.32);
      this.group.add(eye);
    }

    // Teeth ring for aggressive species.
    if (sp.teeth) {
      const toothMat = new THREE.MeshStandardMaterial({ color: 0xf5f2e8, roughness: 0.3 });
      const toothCount = isGulper ? 14 : 10;
      const toothLen = sp.girth * (isGulper ? 0.28 : 0.16);
      const mouthR = sp.girth * (isGulper ? 0.55 : 0.35);
      for (let i = 0; i < toothCount; i++) {
        const a = (i / toothCount) * Math.PI * 2;
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(toothLen * 0.18, toothLen, 5), toothMat);
        tooth.position.set(L * 0.5, Math.sin(a) * mouthR * 0.6, Math.cos(a) * mouthR * 0.8);
        tooth.rotation.x = Math.PI; // point inward/down
        tooth.rotation.z = a;
        this.group.add(tooth);
      }
      // Jaw slit (dark torus hint).
      const jaw = new THREE.Mesh(
        new THREE.TorusGeometry(mouthR * 0.9, mouthR * 0.08, 6, 16),
        new THREE.MeshStandardMaterial({ color: 0x1a0d10, roughness: 0.9 })
      );
      jaw.position.set(L * 0.52, 0, 0);
      jaw.rotation.y = Math.PI / 2;
      this.group.add(jaw);
    }

    // Store base positions for undulation animation.
    this.basePositions = this.bodyGeo.attributes.position.array.slice();
    this.spineFn = spineFn;
    this.L = L;
  }

  _buildRay(L, skin, belly) {
    // Flattened diamond body: wide in Z, thin in Y.
    const spineFn = (t) => {
      const r = this.species.girth * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(t * 1.1, 1)), 0.6);
      return { x: -L / 2 + t * L, y: 0, z: 0, rx: r * 0.7, rz: r * 1.9 };
    };
    this.bodyGeo = loftBody(spineFn, BODY_RINGS, BODY_SEGS);
    this.body = new THREE.Mesh(this.bodyGeo, skin);
    this.group.add(this.body);
    this.basePositions = this.bodyGeo.attributes.position.array.slice();
    this.spineFn = spineFn;
    this.L = L;

    // Long whip tail.
    const tailPts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      tailPts.push(new THREE.Vector3(-L / 2 - t * L * 0.6, 0, Math.sin(t * 3) * L * 0.05));
    }
    const tailCurve = new THREE.CatmullRomCurve3(tailPts);
    const tailTube = new THREE.Mesh(
      new THREE.TubeGeometry(tailCurve, 12, L * 0.015, 5),
      skin
    );
    this.group.add(tailTube);

    // Eyes + mouth slits on the ventral face.
    const eyeMat = new THREE.MeshBasicMaterial({ color: this.species.glowEyes });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), eyeMat);
      eye.position.set(L * 0.35, -this.species.girth * 0.25, s * this.species.girth * 0.5);
      this.group.add(eye);
    }
  }

  _buildKraken(L, skin, belly) {
    // Mantle: teardrop dome.
    const mantleGeo = loftBody((t) => {
      const r = this.species.girth * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(t * 1.2, 1)), 0.7);
      return { x: -L * 0.3 + t * L * 0.55, y: L * 0.12, z: 0, rx: r, rz: r * 1.1 };
    }, BODY_RINGS, BODY_SEGS);
    this.body = new THREE.Mesh(mantleGeo, skin);
    this.group.add(this.body);

    // Big glowing eyes on the mantle front.
    const eyeMat = new THREE.MeshBasicMaterial({ color: this.species.glowEyes });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), eyeMat);
      eye.position.set(L * 0.28, L * 0.14, s * this.species.girth * 0.35);
      this.group.add(eye);
    }

    // Eight tentacles: curved tubes with tapering radius, animated sway.
    this.tentacles = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pts = [];
      const len = L * 0.55;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push(new THREE.Vector3(
          L * 0.25 - t * len * 0.35,
          L * 0.1 - t * len * 0.55,
          Math.cos(a) * (this.species.girth * 0.4 + t * len * 0.28) + Math.sin(t * 4 + i) * len * 0.06,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, this.species.girth * 0.11, 6), skin);
      this.group.add(tube);
      this.tentacles.push({ mesh: tube, phase: i * 0.8 });
    }
    this.L = L;
    this.spineFn = null; // kraken animated via tentacle sway only
  }

  // Per-frame swim deformation + movement. dt seconds, time absolute.
  update(dt, time, oceanHeightAt) {
    const sp = this.species;

    // State machine.
    this.stateTimer -= dt;
    if (this.state === 'wander' && this.stateTimer <= 0) {
      this.heading += randRange(-1.2, 1.2);
      this.stateTimer = randRange(4, 10);
      // Occasionally dive/climb within depth band.
      this.targetDepth = randRange(sp.depthBand[0], sp.depthBand[1]);
    }
    if (this.state === 'circle') {
      this.heading += dt * 0.8;
      if (this.stateTimer <= 0) { this.state = 'wander'; this.stateTimer = randRange(4, 8); }
    }

    // Move along heading at cruise speed (hooked fish handled by fishing sys).
    if (this.state !== 'hooked') {
      const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
      this.group.position.x += fx * this.swimSpeed * dt;
      this.group.position.z += fz * this.swimSpeed * dt;

      // Depth easing + ride waves partially (they breach!).
      if (this.targetDepth !== undefined) {
        this.depth = lerp(this.depth, this.targetDepth, dt * 0.3);
      }
      const surfY = oceanHeightAt(this.group.position.x, this.group.position.z, time);
      const targetY = surfY - this.depth;
      this.group.position.y = lerp(this.group.position.y, targetY, clamp(dt, 0, 0.1) * 2);

      // Keep inside world.
      const r = Math.hypot(this.group.position.x, this.group.position.z);
      if (r > CONFIG.world.mapRadius) {
        this.heading = Math.atan2(-this.group.position.x / r, -this.group.position.z / r) + Math.PI;
      }
    }

    // Orient group to heading (smooth).
    this.group.rotation.y = this.heading;

    // Swim animation: traveling sine along the spine.
    const freq = 1.6 + this.swimSpeed * 0.35;
    const amp = this.L * 0.035;
    if (this.spineFn) {
      const posAttr = this.body.geometry.attributes.position;
      const arr = posAttr.array;
      const base = this.basePositions;
      for (let i = 0; i <= BODY_RINGS; i++) {
        const t = i / BODY_RINGS;
        // Amplitude grows toward the tail.
        const a = amp * Math.pow(t, 1.5) * Math.sin(time * freq + this.phase - t * Math.PI * 2);
        for (let j = 0; j <= BODY_SEGS; j++) {
          const idx = (i * (BODY_SEGS + 1) + j) * 3;
          arr[idx + 1] = base[idx + 1] + a; // lateral sway in local Y (group rot maps to world)
        }
      }
      posAttr.needsUpdate = true;
      // Tail swings harder.
      if (this.tail) this.tail.rotation.x = Math.sin(time * freq + this.phase - Math.PI * 2) * 0.5;
    } else if (this.tentacles) {
      for (const tn of this.tentacles) {
        tn.mesh.rotation.y = Math.sin(time * 0.8 + tn.phase) * 0.15;
        tn.mesh.position.y = Math.sin(time * 0.6 + tn.phase) * 0.3;
      }
      this.group.rotation.z = Math.sin(time * 0.5 + this.phase) * 0.06;
    }

    // Gentle body roll while cruising.
    if (this.spineFn) {
      this.group.rotation.z = Math.sin(time * freq * 0.5 + this.phase) * 0.08;
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  get position() { return this.group.position; }
}

// ---------------------------------------------------------------------------
// Population manager
// ---------------------------------------------------------------------------

export class FishPopulation {
  constructor(scene) {
    this.scene = scene;
    this.fish = [];
    this.respawnQueue = []; // { species, timer }
    const cap = CONFIG.fish.populationCap;
    for (let i = 0; i < cap; i++) this.spawnRandom(true);
  }

  weightedSpecies() {
    const list = CONFIG.fish.species;
    const total = list.reduce((s, f) => s + f.rarity, 0);
    let r = Math.random() * total;
    for (const f of list) { r -= f.rarity; if (r <= 0) return f; }
    return list[list.length - 1];
  }

  spawnRandom(initial = false) {
    const species = this.weightedSpecies();
    const angle = randRange(0, Math.PI * 2);
    const dist = initial ? randRange(60, CONFIG.world.mapRadius * 0.8) : randRange(80, CONFIG.world.mapRadius * 0.7);
    const pos = new THREE.Vector3(Math.cos(angle) * dist, -species.depthBand[0], Math.sin(angle) * dist);
    const f = new Fish(species, pos);
    this.fish.push(f);
    this.scene.add(f.group);
    return f;
  }

  killFish(fish) {
    const i = this.fish.indexOf(fish);
    if (i >= 0) this.fish.splice(i, 1);
    fish.dispose(this.scene);
    this.respawnQueue.push({ species: fish.species, timer: randRange(CONFIG.fish.respawnDelayMin, CONFIG.fish.respawnDelayMax) });
  }

  update(dt, time, oceanHeightAt) {
    for (const f of this.fish) f.update(dt, time, oceanHeightAt);

    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const rq = this.respawnQueue[i];
      rq.timer -= dt;
      if (rq.timer <= 0 && this.fish.length < CONFIG.fish.populationCap) {
        this.respawnQueue.splice(i, 1);
        // Spawn the same species to keep the ecosystem balanced.
        const angle = randRange(0, Math.PI * 2);
        const dist = randRange(120, CONFIG.world.mapRadius * 0.7);
        const pos = new THREE.Vector3(Math.cos(angle) * dist, -rq.species.depthBand[0], Math.sin(angle) * dist);
        const f = new Fish(rq.species, pos);
        this.fish.push(f);
        this.scene.add(f.group);
      }
    }
  }

  // Nearest fish to a world point (for bite logic), excluding hooked ones.
  nearestTo(point, maxDist = Infinity) {
    let best = null, bestD = maxDist;
    for (const f of this.fish) {
      if (f.state === 'hooked') continue;
      const d = f.position.distanceTo(point);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  forEach(fn) { for (const f of this.fish) fn(f); }
}
