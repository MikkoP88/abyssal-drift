// ============================================================================
// ocean.js — Dynamic ocean surface.
// A tiled water quad driven by a custom ShaderMaterial. The vertex shader
// sums a fixed bank of directional waves to displace the surface and derives
// normals analytically. The fragment shader layers fresnel, a sky-gradient
// reflection, sun glints, crest foam, and distance fog.
//
// CRITICAL: sampleWaveHeight() below mirrors the SAME wave bank in JS so the
// boat, fish, and camera ride the identical surface the GPU renders. Keep the
// two in sync if you tune WAVES.
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';

// Fixed wave bank. dir is a unit 2D direction (x,z), freq is spatial
// frequency (rad/m), amp is amplitude (m), speed is phase velocity (rad/s).
const WAVES = [
  { dir: [0.86, 0.51], amp: 1.00, freq: 0.055, speed: 1.05 },
  { dir: [-0.62, 0.79], amp: 0.55, freq: 0.11, speed: 1.5 },
  { dir: [0.30, -0.95], amp: 0.35, freq: 0.21, speed: 2.1 },
  { dir: [-0.90, -0.43], amp: 0.22, freq: 0.42, speed: 3.0 },
  { dir: [0.15, 0.99], amp: 0.12, freq: 0.85, speed: 4.2 },
];
for (const w of WAVES) {
  const l = Math.hypot(w.dir[0], w.dir[1]);
  w.dir[0] /= l; w.dir[1] /= l;
}

// Build the summed-wave displacement + gradient statements once.
function waveDisplacementLines(prefix) {
  return WAVES.map((w) =>
    `${prefix} += ${w.amp.toFixed(3)} * uAmpScale * sin(dot(vec2(${w.dir[0].toFixed(4)}, ${w.dir[1].toFixed(4)}), p) * ${w.freq.toFixed(4)} + uTime * ${w.speed.toFixed(3)});`
  ).join('\n  ');
}
function waveGradientLines() {
  return WAVES.map((w) =>
    `grad += ${w.amp.toFixed(3)} * uAmpScale * ${w.freq.toFixed(4)} * cos(dot(vec2(${w.dir[0].toFixed(4)}, ${w.dir[1].toFixed(4)}), p) * ${w.freq.toFixed(4)} + uTime * ${w.speed.toFixed(3)}) * vec2(${w.dir[0].toFixed(4)}, ${w.dir[1].toFixed(4)});`
  ).join('\n  ');
}

const VERT = /* glsl */`
uniform float uTime;
uniform float uAmpScale;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;

void main() {
  vec2 p = position.xy; // plane authored flat in XY; mesh rotated -90deg about X
  float h = 0.0;
  vec2 grad = vec2(0.0);
${waveDisplacementLines('h')}
${waveGradientLines()}

  // Under Rx(-90deg): world(x,y,z) <- object(x, -z_world?, ...) i.e.
  // w_x=o_x, w_y=o_z, w_z=-o_y. So height goes in object Z, plane Y flips.
  vec3 displaced = vec3(p.x, -p.y, h);
  // World normal (-gx, 1, -gz) mapped back to object space: (nx, -nz, ny).
  vec3 nrm = normalize(vec3(-grad.x, grad.y, 1.0));

  vec4 wp = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * nrm);
  vHeight = h;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
precision highp float;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFoamThreshold;
uniform float uReflectionStrength;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i);
  float b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0));
  float d = hash(i + vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 R = reflect(-V, N);

  // Sky gradient reflection by reflected-ray elevation.
  float ry = clamp(R.y, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyTop, pow(ry, 0.6));

  // Fresnel: grazing angles mirror the sky more.
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  fres = mix(0.04, 1.0, fres) * uReflectionStrength;

  // Base water color: deeper overall, brighter on crests.
  float crest = smoothstep(-0.2, 1.2, vHeight);
  vec3 waterCol = mix(uDeepColor, uShallowColor, crest * 0.5);

  vec3 col = mix(waterCol, sky, fres);

  // Sun glint (Blinn-Phong).
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(N, H), 0.0), 220.0);
  col += vec3(1.0, 0.95, 0.85) * spec * 1.6;

  // Crest foam: thin film where height exceeds threshold, broken by noise.
  float foamMask = smoothstep(uFoamThreshold, uFoamThreshold + 0.35, vHeight);
  foamMask *= 0.55 + 0.45 * vnoise(vWorldPos.xz * 1.7);
  col = mix(col, vec3(0.92, 0.96, 0.98), foamMask * 0.7);

  // Distance fog (exponential squared).
  float dist = length(uCamPos - vWorldPos);
  float fogF = 1.0 - exp(-dist * dist * uFogDensity * uFogDensity);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

  gl_FragColor = vec4(col, 0.94);
}
`;

export class OceanSystem {
  constructor(scene) {
    this.scene = scene;
    const o = CONFIG.ocean;
    this.uniforms = {
      uTime: { value: 0 },
      uAmpScale: { value: o.waveHeight },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uDeepColor: { value: new THREE.Color(o.deepColor) },
      uShallowColor: { value: new THREE.Color(o.shallowColor) },
      uSkyTop: { value: new THREE.Color(0x2a6db0) },
      uSkyHorizon: { value: new THREE.Color(0xbcd6e6) },
      uFogColor: { value: new THREE.Color(CONFIG.world.fogColorDay) },
      uFogDensity: { value: CONFIG.world.fogDensityDay },
      uFoamThreshold: { value: o.foamThreshold },
      uReflectionStrength: { value: o.reflectionStrength },
    };

    const geo = new THREE.PlaneGeometry(o.tileSize, o.tileSize, o.segments, o.segments);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2; // lay flat: local XY -> world XZ
    this.mesh.position.y = CONFIG.world.seaLevel;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  // CPU mirror of the GPU wave field. Returns height (m) at world (x,z).
  sampleWaveHeight(x, z, time) {
    const s = CONFIG.ocean.waveHeight;
    let h = 0;
    for (const w of WAVES) {
      h += w.amp * s * Math.sin((w.dir[0] * x + w.dir[1] * z) * w.freq + time * w.speed);
    }
    return h;
  }

  // Approximate surface normal via central differences (for boat tilt).
  sampleNormal(x, z, time) {
    const e = 0.6;
    const hx = this.sampleWaveHeight(x + e, z, time) - this.sampleWaveHeight(x - e, z, time);
    const hz = this.sampleWaveHeight(x, z + e, time) - this.sampleWaveHeight(x, z - e, time);
    return new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
  }

  update(time, camPos, sunDir, skyTop, skyHorizon, fogColor, fogDensity) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCamPos.value.copy(camPos);
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSkyTop.value.copy(skyTop);
    this.uniforms.uSkyHorizon.value.copy(skyHorizon);
    this.uniforms.uFogColor.value.copy(fogColor);
    this.uniforms.uFogDensity.value = fogDensity;
    // Keep the tile snapped near the camera so tessellation stays dense nearby.
    this.mesh.position.x = Math.round(camPos.x / 10) * 10;
    this.mesh.position.z = Math.round(camPos.z / 10) * 10;
  }
}

export default OceanSystem;
