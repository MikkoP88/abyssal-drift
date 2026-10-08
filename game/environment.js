// ============================================================================
// environment.js — World dressing: rocky outcrops, distant island silhouettes,
// circling gulls, and a GPU-friendly rain particle system for storms.
// All geometry is procedural (displaced icosahedra / cones) — no assets.
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';
import { randRange, hash2, fbm2 } from './utils.js';

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.rocks = [];
    this.islands = [];
    this.gulls = [];
    this._buildRocks();
    this._buildIslands();
    this._buildGulls();
    this._buildRain();
  }

  _rockMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0x4a4f55, roughness: 0.95, metalness: 0.02, flatShading: true,
    });
  }

  _buildRocks() {
    const mat = this._rockMaterial();
    const count = 42;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + hash2(i, 7) * 0.5;
      const dist = randRange(90, CONFIG.world.mapRadius * 0.9);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      // Displaced icosahedron = craggy rock.
      const geo = new THREE.IcosahedronGeometry(randRange(2.5, 9), 2);
      const pos = geo.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v), vy = pos.getY(v), vz = pos.getZ(v);
        const n = fbm2(vx * 0.6 + i, vz * 0.6 + i * 3.1, 3) - 0.5;
        const s = 1 + n * 0.9;
        pos.setXYZ(v, vx * s, vy * s * 0.7, vz * s);
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(x, randRange(-2.5, 0.5), z);
      rock.rotation.set(hash2(i, 1) * 3, hash2(i, 2) * 3, hash2(i, 3) * 3);
      this.scene.add(rock);
      this.rocks.push(rock);
    }
  }

  _buildIslands() {
    // Far silhouette islands: layered cones with a green-grey top.
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 1, flatShading: true });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f5a42, roughness: 1, flatShading: true });
    const count = 7;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.4;
      const dist = CONFIG.world.mapRadius * (0.95 + hash2(i, 9) * 0.35);
      const g = new THREE.Group();
      const tiers = 3;
      for (let t = 0; t < tiers; t++) {
        const r = randRange(25, 60) * (1 - t * 0.28);
        const h = randRange(18, 40) * (1 - t * 0.2);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), t === tiers - 1 ? grassMat : rockMat);
        cone.position.y = h / 2 - t * h * 0.35;
        cone.rotation.y = hash2(i, t) * Math.PI;
        g.add(cone);
      }
      g.position.set(Math.cos(angle) * dist, -3, Math.sin(angle) * dist);
      this.scene.add(g);
      this.islands.push(g);
    }
  }

  _buildGulls() {
    // Simple gulls: two triangle wings that flap. They orbit the player area.
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.8, side: THREE.DoubleSide });
    const count = 9;
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 5), mat);
      body.rotation.x = Math.PI / 2;
      g.add(body);
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0, 1.4, 0.15, -0.3, 0, 0, -0.5,
      ], 3));
      wingGeo.computeVertexNormals();
      const wl = new THREE.Mesh(wingGeo, mat);
      const wr = new THREE.Mesh(wingGeo.clone(), mat);
      wr.scale.x = -1;
      g.add(wl, wr);
      this.scene.add(g);
      this.gulls.push({
        group: g, wl, wr,
        radius: randRange(40, 120),
        height: randRange(25, 60),
        speed: randRange(0.15, 0.35),
        phase: randRange(0, Math.PI * 2),
        flapSpeed: randRange(6, 9),
      });
    }
  }

  _buildRain() {
    // Points-based rain: a box of streaks recycled around the camera.
    const COUNT = 2600;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = randRange(-80, 80);
      positions[i * 3 + 1] = randRange(0, 80);
      positions[i * 3 + 2] = randRange(-80, 80);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9fb8cc, size: 0.12, transparent: true, opacity: 0.55,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    this.rainBox = 80;
  }

  update(dt, time, camPos, storm) {
    // Gulls orbit + flap.
    for (const gu of this.gulls) {
      const a = time * gu.speed + gu.phase;
      gu.group.position.set(
        camPos.x + Math.cos(a) * gu.radius,
        gu.height + Math.sin(time * 0.7 + gu.phase) * 4,
        camPos.z + Math.sin(a) * gu.radius
      );
      gu.group.rotation.y = -a - Math.PI / 2;
      const flap = Math.sin(time * gu.flapSpeed + gu.phase) * 0.7;
      gu.wl.rotation.z = flap;
      gu.wr.rotation.z = -flap;
    }

    // Rain follows camera and falls.
    this.rain.visible = !!storm;
    if (storm) {
      this.rain.position.set(camPos.x, camPos.y + 30, camPos.z);
      const pos = this.rain.geometry.attributes.position;
      const fall = dt * 55;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - fall;
        if (y < -50) y = 80;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      this.rain.material.opacity = 0.35 + Math.sin(time * 2) * 0.1;
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}

export default Environment;
