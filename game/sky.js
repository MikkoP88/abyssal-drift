// ============================================================================
// sky.js — Atmosphere & day/night cycle.
// A large inverted sphere with a procedural gradient sky, sun disc, moon,
// stars (fade in at night), and drifting procedural clouds. Also owns the
// scene's directional (sun) + hemisphere lights and computes the fog/sky
// colors passed to the ocean and scene fog each frame.
// ============================================================================

import * as THREE from '../libs/three.module.js';
import CONFIG from './config.js';
import { clamp, lerp, smoothstep } from './utils.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // pin to far plane
}
`;

const SKY_FRAG = /* glsl */`
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenithDay;
uniform vec3 uHorizonDay;
uniform vec3 uZenithNight;
uniform vec3 uHorizonNight;
uniform vec3 uSunColor;
uniform float uDayFactor;   // 0 = midnight, 1 = noon
uniform float uTime;
uniform float uCloudCover;  // 0..1
varying vec3 vDir;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float s=0.0, a=0.5;
  for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.0; a*=0.5; }
  return s;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, -0.1, 1.0);

  // Day / night palettes blended by day factor.
  vec3 zen = mix(uZenithNight, uZenithDay, uDayFactor);
  vec3 hor = mix(uHorizonNight, uHorizonDay, uDayFactor);
  vec3 col = mix(hor, zen, pow(clamp(h,0.0,1.0), 0.55));

  // Warm tint near the horizon at low sun (golden hour).
  float sunAlt = clamp(uSunDir.y, -1.0, 1.0);
  float golden = smoothstep(0.25, 0.0, abs(sunAlt)) * uDayFactor;
  col = mix(col, vec3(1.0, 0.55, 0.25), golden * 0.35 * (1.0 - pow(clamp(h,0.0,1.0), 2.0)));

  // Sun disc + halo.
  float sd = max(dot(dir, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 1200.0) * 3.0 + pow(sd, 12.0) * 0.25) * uDayFactor;

  // Moon (visible at night).
  float md = max(dot(dir, normalize(uMoonDir)), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (pow(md, 2500.0) * 1.4 + pow(md, 40.0) * 0.08) * (1.0 -uDayFactor);

  // Stars: static hash field, twinkle, fade in at night, hidden near horizon.
  float starField = step(0.9985, hash(floor(dir.xz / max(dir.y, 0.02) * 400.0)));
  float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(dir.xz * 400.0)) * 40.0);
  col += vec3(starField * twinkle) * (1.0 - uDayFactor) * smoothstep(0.05, 0.3, dir.y) * 0.9;

  // Clouds: fbm projected onto a plane, drift over time.
  if (dir.y > 0.02) {
    vec2 cuv = dir.xz / (dir.y + 0.15) * 1.4 + vec2(uTime * 0.006, uTime * 0.003);
    float c = fbm(cuv);
    float mask = smoothstep(0.55 - uCloudCover * 0.35, 0.85, c) * uCloudCover;
    float lit = 0.4 + 0.6 * uDayFactor;
    vec3 cloudCol = mix(vec3(0.15, 0.17, 0.22), vec3(1.0, 0.98, 0.95), lit);
    // Golden-hour clouds catch warm light.
    cloudCol = mix(cloudCol, vec3(1.0, 0.6, 0.35), golden * 0.5);
    col = mix(col, cloudCol, mask * smoothstep(0.02, 0.15, dir.y) * 0.85);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export class SkySystem {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uZenithDay: { value: new THREE.Color(0x2f7fd6) },
      uHorizonDay: { value: new THREE.Color(0xcfe6f2) },
      uZenithNight: { value: new THREE.Color(0x050a18) },
      uHorizonNight: { value: new THREE.Color(0x101a2e) },
      uSunColor: { value: new THREE.Color(0xfff2cc) },
      uDayFactor: { value: 1 },
      uTime: { value: 0 },
      uCloudCover: { value: 0.35 },
    };

    const geo = new THREE.SphereGeometry(3000, 32, 16);
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, this.mat);
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Lights owned by the sky so day/night drives them coherently.
    this.sunLight = new THREE.DirectionalLight(0xffffff, CONFIG.time.sunIntensityDay);
    this.sunLight.castShadow = false; // shadows off for perf; AO baked in materials
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.hemi = new THREE.HemisphereLight(0xbcd6e6, 0x0a2a33, CONFIG.time.ambientDay);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x404855, 0.25);
    scene.add(this.ambient);

    // Scratch vectors reused each frame (avoid GC).
    this._sun = new THREE.Vector3();
    this._moon = new THREE.Vector3();
    this._fogColor = new THREE.Color();
    this._skyTop = new THREE.Color();
    this._skyHorizon = new THREE.Color();
    this._zenithDay = new THREE.Color(0x2f7fd6);
    this._horizonDay = new THREE.Color(0xcfe6f2);
    this._zenithNight = new THREE.Color(0x050a18);
    this._horizonNight = new THREE.Color(0x101a2e);
    this._fogDay = new THREE.Color(CONFIG.world.fogColorDay);
    this._fogNight = new THREE.Color(CONFIG.world.fogColorNight);
    this._fogStorm = new THREE.Color(CONFIG.world.fogColorStorm);
  }

  // hour in [0..24). Returns derived atmosphere state.
  update(hour, timeSec, storm) {
    const t = CONFIG.time;
    // Sun elevation: peaks at noon (12h), below horizon at night.
    const ang = ((hour - 6) / 12) * Math.PI; // 0 at 6h, PI/2 at 12h, PI at 18h
    const elev = Math.sin(ang);
    const azimuth = (hour / 24) * Math.PI * 2;
    this._sun.set(Math.cos(azimuth) * Math.cos(ang), elev, Math.sin(azimuth) * Math.cos(ang)).normalize();

    // Moon opposite the sun, slightly raised.
    this._moon.copy(this._sun).multiplyScalar(-1);
    this._moon.y = Math.abs(this._moon.y) * 0.6 + 0.25;
    this._moon.normalize();

    // Day factor: smooth ramp around sunrise/sunset.
    const dayFactor = smoothstep(-0.12, 0.18, elev);

    this.uniforms.uSunDir.value.copy(this._sun);
    this.uniforms.uMoonDir.value.copy(this._moon);
    this.uniforms.uDayFactor.value = dayFactor;
    this.uniforms.uTime.value = timeSec;
    this.uniforms.uCloudCover.value = storm ? 0.85 : 0.35;

    // Drive lights.
    const sunI = lerp(t.sunIntensityNight, t.sunIntensityDay, dayFactor);
    this.sunLight.intensity = sunI;
    this.sunLight.color.setRGB(
      lerp(0.5, 1.0, dayFactor),
      lerp(0.6, 0.97, dayFactor),
      lerp(0.8, 0.88, dayFactor)
    );
    this.sunLight.position.copy(this._sun).multiplyScalar(500);
    this.sunLight.target.position.set(0, 0, 0);
    this.hemi.intensity = lerp(t.ambientNight, t.ambientDay, dayFactor);
    this.hemi.color.lerpColors(new THREE.Color(0x1a2a4a), new THREE.Color(0xbcd6e6), dayFactor);
    this.ambient.intensity = lerp(0.12, 0.28, dayFactor);

    // Fog + sky colors handed to ocean/scene.
    const stormMix = storm ? 0.6 : 0;
    this._fogColor.lerpColors(this._fogNight, this._fogDay, dayFactor);
    if (storm) this._fogColor.lerp(this._fogStorm, stormMix);
    this._skyTop.lerpColors(this._zenithNight, this._zenithDay, dayFactor);
    this._skyHorizon.lerpColors(this._horizonNight, this._horizonDay, dayFactor);
    if (storm) {
      this._skyTop.multiplyScalar(0.5);
      this._skyHorizon.multiplyScalar(0.6);
    }

    // Scene fog (exp2 to match ocean shader).
    const density = lerp(CONFIG.world.fogDensityNight, CONFIG.world.fogDensityDay, dayFactor) * (storm ? 1.7 : 1);
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(0xbfd4dd, density);
    this.scene.fog.color.copy(this._fogColor);
    this.scene.fog.density = density;

    return {
      sunDir: this._sun.clone(),
      dayFactor,
      fogColor: this._fogColor.clone(),
      skyTop: this._skyTop.clone(),
      skyHorizon: this._skyHorizon.clone(),
      fogDensity: density,
    };
  }
}

export default SkySystem;
