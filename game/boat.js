// ============================================================================
// boat.js — Player vessel: high-detail procedural sport-fisher hull with a
// full interior cockpit (dashboard gauges, steering wheel, helm seat,
// windshield, hardtop), textured gelcoat/teak/aluminum/rubber surfaces from
// the procedural texture factory, plus physics + first-person camera rig
// that rides the ocean wave field from INSIDE the cockpit by default.
// Coordinate contract (unchanged): group at this.pos with rotation.y =
// heading; body has rotation.y = PI/2 so hull local +X maps to forward -Z;
// in GROUP space ship length runs along Z (bow at -Z); deck top surface is
// body y 1.18; body.children[0] is ALWAYS the hull mesh (validation probes
// its bounds).
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';
import { clamp, damp } from './utils.js';
import {
  hullPaintTex, woodDeckTex, aluminumTex, plasticTex, nonSlipTex,
  fabricTex, gaugeClusterTex, rubberTex,
} from './textures.js';

// ---------------------------------------------------------------------------
// Hull loft: closed cross-section rings (keel -> starboard -> sheer -> port
// -> keel) per station; flat transom fan at stern, pointed bow fan closes
// the ends. UVs: u stern->bow, v keel(0)->sheer(1) so painted bands align
// with the hull paint texture (anti-foul / boot stripe / topsides / stripe).
// ---------------------------------------------------------------------------
function buildHullGeometry() {
  const L = 9.0;
  const stations = 26;
  const segs = 16;
  const positions = [], uvs = [], indices = [];

  const halfBeam = (t) => {
    const bowTaper = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(t * 1.12, 1))), 0.75);
    return Math.max(2.55 * bowTaper * (t < 0.1 ? 0.88 : 1), t > 0.97 ? 0.06 : 0);
  };
  const depth = (t) => 0.62 + t * t * 0.3;     // deeper draft toward bow
  const sheerY = (t) => 0.56 + t * t * 0.3;    // sheer line rises to bow tip

  const rings = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;                    // 0 stern -> 1 bow
    const x = -L / 2 + t * L;
    const b = halfBeam(t);
    const d = depth(t);
    const sy = sheerY(t);
    const ring = [];
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const z = Math.sin(th) * b;
      const y = sy - d * (1 - Math.cos(th)) / 2; // keel -> sheer -> keel
      ring.push([x, y, z]);
    }
    rings.push(ring);
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const v = th <= Math.PI ? th / Math.PI : 2 - th / Math.PI;
      uvs.push(t, v);
    }
  }
  for (const ring of rings) for (const [x, y, z] of ring) positions.push(x, y, z);

  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const bIdx = a + 1;
      const c = a + segs + 1;
      const dIdx = c + 1;
      indices.push(a, c, bIdx, c, dIdx, bIdx); // outward winding
    }
  }

  // Close stern (flat transom fan) and bow (pointed fan).
  const closeFan = (ringIdx, cx, cy) => {
    const base = positions.length / 3;
    positions.push(cx, cy, 0); uvs.push(ringIdx === rings.length - 1 ? 1 : 0, 0);
    const rb = ringIdx * (segs + 1);
    for (let j = 0; j < segs; j++) {
      const a = rb + j, bIdx = rb + j + 1;
      indices.push(base, bIdx, a); // outward winding at both ends
    }
  };
  closeFan(0, -L / 2 - 0.02, sheerY(0) - depth(0) * 0.45);
  closeFan(rings.length - 1, L / 2 + 0.18, sheerY(1) - depth(1) * 0.3);

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
    this.heading = 0;              // radians; forward() == -(sin h, 0, cos h)
    this.speed = 0;
    this.throttle = 0;             // smoothed -1..1
    this.rudder = 0;               // smoothed -1..1
    this.fuel = CONFIG.boat.fuelCapacity;

    this._buildModel();

    // Camera rig
    this.cameraPitch = 0;
    this.cameraYawOffset = 0;
    this.bobPhase = 0;

    // Wake spray: pooled Points (stern + bow foam).
    const WN = 220;
    this.wakePos = new Float32Array(WN * 3);
    this.wakeVel = new Float32Array(WN * 3);
    this.wakeLife = new Float32Array(WN);
    for (let i = 0; i < WN; i++) this.wakePos[i * 3 + 1] = -9999;
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3));
    this.wake = new THREE.Points(wg, new THREE.PointsMaterial({
      color: 0xeaf6ff, size: 0.16, transparent: true, opacity: 0.75,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.wake.frustumCulled = false;
    this.wake.visible = false;
    scene.add(this.wake);
    this._wakeCursor = 0;
    this._wakeAccum = 0;
  }

  _buildModel() {
    const b = this.body;

    // ---- Materials (procedural textures) ---------------------------------
    const matHull = new THREE.MeshPhysicalMaterial({
      map: hullPaintTex([4, 1]), roughness: 0.38, metalness: 0.05,
      clearcoat: 0.55, clearcoatRoughness: 0.3,
    });
    const matDeck = new THREE.MeshStandardMaterial({ map: woodDeckTex([3, 2]), roughness: 0.8 });
    const matTrim = new THREE.MeshStandardMaterial({ map: plasticTex(0xe8e6df, [2, 2]), roughness: 0.4 });
    const matMetal = new THREE.MeshStandardMaterial({ map: aluminumTex([2, 2]), metalness: 0.85, roughness: 0.35 });
    const matChrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.95, roughness: 0.18 });
    const matGlass = new THREE.MeshStandardMaterial({
      color: 0xbfd8e8, roughness: 0.05, metalness: 0,
      transparent: true, opacity: 0.15, side: THREE.DoubleSide,
    });
    const matFabric = new THREE.MeshStandardMaterial({ map: fabricTex(), roughness: 0.9 });
    const matPlasticDark = new THREE.MeshStandardMaterial({ map: plasticTex(0x2a2f36, [2, 2]), roughness: 0.6 });
    const matNonSlip = new THREE.MeshStandardMaterial({ map: nonSlipTex([4, 4]), roughness: 0.95 });
    const matRubber = new THREE.MeshStandardMaterial({ map: rubberTex([3, 1]), roughness: 0.9 });
    const gaugeTex = gaugeClusterTex();
    const matGauge = new THREE.MeshStandardMaterial({
      map: gaugeTex, emissiveMap: gaugeTex, emissive: 0xffffff,
      emissiveIntensity: 0.5, roughness: 0.55,
    });

    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); b.add(m); return m;
    };

    // ---- Hull (MUST stay body.children[0]) --------------------------------
    const hull = new THREE.Mesh(buildHullGeometry(), matHull);
    hull.position.y = 0.62; // keel at body y=0, sheer line at y=1.18
    b.add(hull);

    // ---- Deck + trim -------------------------------------------------------
    box(8.4, 0.12, 4.6, matDeck, -0.1, 1.12, 0);        // teak deck slab (top y=1.18)
    box(8.6, 0.07, 0.12, matTrim, -0.5, 1.21, -2.3);    // sheer trim strips
    box(8.6, 0.07, 0.12, matTrim, -0.5, 1.21, 2.3);
    box(2.4, 0.04, 3.6, matNonSlip, 3.1, 1.205, 0);     // bow non-slip pad
    box(3.6, 0.035, 3.5, matDeck, -0.7, 1.197, 0);      // teak cockpit sole
    // ---- Cockpit console + gauges -----------------------------------------
    // Gauge cluster on the driver-facing (-X) face of the console box:
    // BoxGeometry material order is [+x, -x, +y, -y, +z, -z].
    // Console sits AFT of the eye anchor so the downward view over it opens
    // onto teak deck (front face at x≈1.0 clears the cockpit-floor sightline).
    // Teak-faced dash (classic sport-fisher look) — the driver-facing face
    // reads as warm wood from the helm seat; gauges sit on a mounted pod.
    // Driver-facing face at x≈0.9 (0.76 m ahead of the eye) — teak veneer
    // with a mounted gauge pod; the face clears the cockpit-floor sightline.
    const consoleBody = box(1.0, 0.5, 2.3, matDeck, 1.4, 1.43, 0);
    const gaugePod = box(0.07, 0.42, 1.7, matPlasticDark, 0.955, 1.38, 0);
    gaugePod.material = [matPlasticDark, matGauge, matPlasticDark, matPlasticDark, matPlasticDark, matPlasticDark];
    const dashSlant = box(1.06, 0.06, 2.34, matPlasticDark, 1.36, 1.56, 0);
    dashSlant.rotation.z = -0.3; // raked dash top

    // ---- Steering wheel ----------------------------------------------------
    // Sized/placed like a real helm wheel: ~0.7 m ahead of the eye so it
    // frames the view without swallowing it (angular radius ~19 deg).
    const wheelG = new THREE.Group(); wheelG.position.set(0.85, 1.68, 0); b.add(wheelG);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.024, 10, 28), matPlasticDark);
    rim.rotation.y = Math.PI / 2; wheelG.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 12), matMetal);
    hub.rotation.z = Math.PI / 2; wheelG.add(hub);
    for (let i = 0; i < 3; i++) {
      const phi = i * (Math.PI * 2 / 3);
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.40, 8), matMetal);
      spoke.rotation.x = phi; // lies in the YZ wheel plane
      wheelG.add(spoke);
    }

    // ---- Helm seat ---------------------------------------------------------
    box(0.42, 0.26, 0.44, matPlasticDark, 0.12, 1.31, 0); // pedestal
    box(0.56, 0.16, 0.52, matFabric, 0.14, 1.49, 0);      // cushion
    const backRest = box(0.14, 0.56, 0.52, matFabric, -0.16, 1.78, 0);
    backRest.rotation.z = 0.16; // reclined
    // ---- Windshield + frame -------------------------------------------------
    // Group faces the driver (-X): rotate -PI/2 so local +Z points to -X.
    const wsG = new THREE.Group(); wsG.position.set(2.7, 1.955, 0); b.add(wsG);
    wsG.rotation.y = -Math.PI / 2;
    // Shorter pane: top edge sits ~12 deg above eye level so the sky band
    // stays clear of glass even when the boat pitches nose-down on a swell.
    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.72), matGlass);
    glassPane.rotation.z = 0.3; // rake back
    wsG.add(glassPane);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.045, 0.045), matMetal);
    frameTop.position.set(0, 0.36, -0.1); frameTop.rotation.z = 0.3; wsG.add(frameTop);
    const frameBot = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.045, 0.045), matMetal);
    frameBot.position.set(0, -0.36, 0.1); frameBot.rotation.z = 0.3; wsG.add(frameBot);
    for (const s of [-1, 1]) {
      const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), matMetal);
      stanchion.position.set(s * 1.58, -0.1, 0); stanchion.rotation.z = 0.3; wsG.add(stanchion);
    }

    // ---- Hardtop roof over the cockpit -------------------------------------
    // Raised high enough that the sky band clears the roof edge from the
    // helm eye (keeps the open-cockpit feel of a sport-fisher).
    const roof = box(3.4, 0.1, 3.9, matTrim, 0.4, 3.0, 0);
    roof.castShadow = true;
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.78, 10), matMetal);
      pillar.position.set(1.95, 2.14, s * 1.85); b.add(pillar);
      const pillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.68, 10), matMetal);
      pillar2.position.set(-1.0, 2.09, s * 1.85); b.add(pillar2);
    }
    // Roof antenna + GPS dome (silhouette detail).
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.9, 6), matMetal);
    mast.position.set(-0.6, 3.48, 1.2); b.add(mast);
    const gpsDome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), matTrim);
    gpsDome.position.set(-0.6, 3.05, 1.2); b.add(gpsDome);
    // ---- Foredeck hardware ---------------------------------------------------
    // Railings: posts + top rail along both sides of the bow area.
    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8);
    for (let i = 0; i < 5; i++) {
      const x = 1.6 + i * 1.35;
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, matMetal);
        post.position.set(x, 1.55, s * 2.15); b.add(post);
      }
    }
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 6.6, 8), matMetal);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(4.35, 1.9, s * 2.15); b.add(rail);
    }
    // Cleats (mooring) on the foredeck.
    for (const [cx, cz] of [[3.4, -1.5], [3.4, 1.5]]) {
      const cleat = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8, 8), matChrome);
      cleat.rotation.z = Math.PI / 2;
      cleat.position.set(cx, 1.24, cz); b.add(cleat);
    }
    // Rod holders (chrome tubes angled up from the bow rail).
    for (const s of [-1, 1]) {
      const rh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.85, 10), matChrome);
      rh.position.set(4.3, 1.62, s * 1.7);
      rh.rotation.z = -0.25; rh.rotation.x = s * 0.15; b.add(rh);
    }
    // Anchor locker hatch on the bow.
    const hatch = box(0.9, 0.06, 0.7, matNonSlip, 4.1, 1.21, 0);
    const hatchLid = box(0.86, 0.05, 0.66, matTrim, 4.1, 1.26, 0);
    hatchLid.rotation.z = 0.08; void hatchLid;
    // Rubber fenders hanging off the sides.
    for (const [fx, fz, s] of [[2.6, -2.35, -1], [0.6, -2.4, -1], [2.6, 2.35, 1], [0.6, 2.4, 1]]) {
      const fender = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 10), matRubber);
      fender.position.set(fx, 0.95, fz); b.add(fender);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), matRubber);
      rope.position.set(fx, 1.45, fz * 0.98); b.add(rope);
    }

    // ---- Stern: outboard motor + prop --------------------------------------
    const transomPlate = box(0.1, 0.5, 2.2, matPlasticDark, -4.42, 0.95, 0);
    const motorCowling = box(0.85, 0.95, 1.3, matPlasticDark, -4.85, 1.05, 0);
    const cowlingStripe = box(0.87, 0.12, 1.32, matTrim, -4.85, 1.35, 0);
    const lowerUnit = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.85, 10), matMetal);
    lowerUnit.position.set(-4.95, 0.35, 0); b.add(lowerUnit);
    const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10), matChrome);
    propHub.rotation.x = Math.PI / 2; propHub.position.set(-4.95, -0.05, 0); b.add(propHub);
    this.propeller = new THREE.Group();
    this.propeller.position.set(-4.95, -0.05, 0);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.16), matChrome);
      blade.position.y = 0.2;
      const holder = new THREE.Group();
      holder.rotation.x = (i / 3) * Math.PI * 2;
      holder.add(blade);
      this.propeller.add(holder);
    }
    b.add(this.propeller);

    // ---- Navigation lights + headlight -------------------------------------
    const navGreen = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x22ff55, emissiveIntensity: 1.4 })
    );
    navGreen.position.set(4.9, 1.35, -2.2); b.add(navGreen);
    const navRed = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xff3333, emissiveIntensity: 1.4 })
    );
    navRed.position.set(4.9, 1.35, 2.2); b.add(navRed);
    const mastLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2cc, emissiveIntensity: 1.2 })
    );
    mastLight.position.set(-0.6, 3.62, 1.2); b.add(mastLight);

    this.headlight = new THREE.SpotLight(0xfff2cc, 0, 60, Math.PI / 5, 0.4, 1.2);
    this.headlight.position.set(4.9, 1.6, 0);
    this.headlight.target.position.set(30, -2, 0);
    b.add(this.headlight);

    // ---- Contact shadow: soft darkening the hull casts on the water -------
    // Multiply-blended radial gradient disc riding just under the keel.
    const csCanvas = document.createElement('canvas');
    csCanvas.width = csCanvas.height = 256;
    const csCtx = csCanvas.getContext('2d');
    const csGrad = csCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
    csGrad.addColorStop(0, 'rgba(0,0,0,0.7)');
    csGrad.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    csGrad.addColorStop(1, 'rgba(0,0,0,0)');
    csCtx.fillStyle = csGrad;
    csCtx.fillRect(0, 0, 256, 256);
    const csTex = new THREE.CanvasTexture(csCanvas);
    // Normal blending (NOT MultiplyBlending — that ignores alpha and
    // paints the whole disc solid black).
    this.contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 40),
      new THREE.MeshBasicMaterial({
        map: csTex, transparent: true, depthWrite: false, opacity: 0.6,
      })
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.scale.set(1, 1.2, 1); // elongate along ship length
    this.contactShadow.renderOrder = 2;
    this.scene.add(this.contactShadow);

    // ---- Eye anchor: INSIDE the cockpit at the helm seat ---------------------
    this.eyeAnchor = new THREE.Object3D();
    this.eyeAnchor.position.set(0.14, 1.80, 0); // seated eye height at the wheel
    b.add(this.eyeAnchor);

    // Warm cabin light: keeps the cockpit readable at night (gauges + deck
    // glow) so the helm view never drops to pure black.
    this.cabinLight = new THREE.PointLight(0xffd9a0, 0, 7, 2); // physical decay
    this.cabinLight.position.set(0.2, 2.55, 0);
    b.add(this.cabinLight);

    // Align the model: hull bow is local +X; ship forward is -Z.
    b.rotation.y = Math.PI / 2;
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

    // Contact shadow hugs the water surface under the hull.
    this.contactShadow.position.set(this.pos.x, CONFIG.world.seaLevel + wh * 0.5 + 0.03, this.pos.z);
    this.contactShadow.rotation.y = this.heading;
    this.body.rotation.z = damp(this.body.rotation.z, targetRoll, 3, dt);
    this.body.rotation.x = damp(this.body.rotation.x, targetPitch, 3, dt);

    // Propeller spin with throttle.
    this.propeller.rotation.x += this.throttle * dt * 40;

    // Contact shadow rides the wave field just under the keel.
    this.contactShadow.position.set(
      this.pos.x,
      CONFIG.world.seaLevel + wh * 0.5 + 0.06,
      this.pos.z
    );
    this.contactShadow.rotation.y = this.heading;

    // Wake: spray sheds from stern/bow while moving.
    this._updateWake(dt, fwd);

    return { speed: this.speed, throttle: this.throttle };
  }

  // Spray particles shed from stern (prop wash) and bow (bow wave) while
  // moving. Cheap pooled Points — no allocation per frame.
  _updateWake(dt, fwd) {
    const spd = Math.abs(this.speed);
    const N = this.wakeLife.length;
    const pos = this.wakePos, vel = this.wakeVel, life = this.wakeLife;

    // Emit proportional to speed (nothing below ~1 m/s).
    if (spd > 1.0) {
      this._wakeAccum += dt * (14 + spd * 6);
      while (this._wakeAccum >= 1) {
        this._wakeAccum -= 1;
        const i = this._wakeCursor; this._wakeCursor = (this._wakeCursor + 1) % N;
        const stern = i % 2 === 0;
        // Ship-local emit point: stern (behind) or bow (ahead).
        const lx = stern ? -4.9 : 4.6;
        const lz = (Math.random() - 0.5) * (stern ? 1.4 : 2.2);
        const c = Math.cos(this.heading), s = Math.sin(this.heading);
        // Ship-local (lx bow+, lz lateral) → world: body rot PI/2 sends
        // body-X(bow) to group -Z, then group rot heading rotates that.
        const wx = this.pos.x + lz * c - lx * s;
        const wz = this.pos.z - lz * s - lx * c;
        pos[i * 3] = wx;
        pos[i * 3 + 1] = CONFIG.world.seaLevel + 0.15;
        pos[i * 3 + 2] = wz;
        // Velocity: backward relative to motion + upward pop + lateral spread.
        const bx = -fwd.x, bz = -fwd.z;
        vel[i * 3] = bx * spd * 0.5 + (Math.random() - 0.5) * 1.6;
        vel[i * 3 + 1] = 1.2 + Math.random() * 1.8;
        vel[i * 3 + 2] = bz * spd * 0.5 + (Math.random() - 0.5) * 1.6;
        life[i] = 0.7 + Math.random() * 0.5;
      }
    }

    // Integrate + kill dead particles (sink below water).
    let anyAlive = false;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      vel[i * 3 + 1] -= 9.8 * dt; // gravity
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (life[i] <= 0 || pos[i * 3 + 1] < CONFIG.world.seaLevel - 0.05) {
        life[i] = 0;
        pos[i * 3 + 1] = -9999;
      } else {
        anyAlive = true;
      }
    }
    this.wake.visible = anyAlive;
    if (anyAlive) this.wake.geometry.attributes.position.needsUpdate = true;
  }

  // Place the first-person camera at the helm seat (inside the cockpit)
  // facing heading + look offsets.
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
    this.cabinLight.intensity = (1 - dayFactor) * 6; // soft warm glow, not a flood
  }
}

export default Boat;
