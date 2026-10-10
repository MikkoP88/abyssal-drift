// ============================================================================
// post.js — Hand-rolled filmic post pass (the vendored Three.js is core-only,
// no EffectComposer). Renders the scene to a target, then grades it on a
// fullscreen quad: radial chromatic aberration, animated film grain, a soft
// sun halo, saturation/contrast grade, and a cinematic vignette.
// Ports to UE as a single Post Process Volume material (same stages).
// ============================================================================

import * as THREE from '../libs/three.module.js';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const GRADE_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tScene;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uGrain;
  uniform float uVignette;
  uniform float uAberration;
  uniform float uSaturation;
  uniform float uContrast;
  uniform vec2 uSunNdc;      // sun in clip space (y up); y<-1 hides the halo
  uniform float uSunStrength;
  uniform float uPassThrough; // >0.5 = blit tScene ungraded (debug bisect)
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    if (uPassThrough > 0.5) {
      vec3 raw = texture2D(tScene, vUv).rgb;
      gl_FragColor = vec4(pow(max(raw, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
      return;
    }

    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);

    // Radial chromatic aberration — imperceptible at center, gentle at edges.
    float ab = uAberration * r2;
    vec3 col;
    col.r = texture2D(tScene, uv + c * ab).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - c * ab).b;

    // Animated film grain (temporal noise, spatially hashed).
    float g = hash(uv * uResolution * 0.5 + vec2(fract(uTime * 7.13) * 61.7,
                                                 fract(uTime * 3.71) * 83.3)) - 0.5;
    col += g * uGrain;

    // Color grade: lift saturation + punch contrast slightly.
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, uSaturation);
    col = (col - 0.5) * uContrast + 0.5;

    // Sun halo: wide soft glow + tighter core, anamorphically stretched.
    if (uSunStrength > 0.001) {
      vec2 d = uv - uSunNdc;
      d.x *= 0.72; // wider than tall, like a real lens flare field
      float dd = dot(d, d);
      col += vec3(1.0, 0.93, 0.78) * uSunStrength * (exp(-dd * 26.0) * 0.55 + exp(-dd * 900.0) * 1.4);
    }

    // Cinematic vignette.
    col *= 1.0 - uVignette * smoothstep(0.18, 0.68, r2);

    // Encode linear -> sRGB. Rendering to a render target skips the
    // renderer's implicit output-color-space conversion, so do it here
    // (matches the old straight-to-canvas pipeline).
    col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

export class PostFx {
  constructor(renderer, worldScene) {
    this.renderer = renderer;
    this.worldScene = worldScene;

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
    });

    this.mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: GRADE_FRAG,
      uniforms: {
        tScene: { value: this.rt.texture },
        uResolution: { value: new THREE.Vector2(w, h) },
        uTime: { value: 0 },
        uGrain: { value: 0.035 },
        uVignette: { value: 0.34 },
        uAberration: { value: 0.0038 },
        uSaturation: { value: 1.06 },
        uContrast: { value: 1.045 },
        uSunNdc: { value: new THREE.Vector2(0, -2) },
        uSunStrength: { value: 0 },
        uPassThrough: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  resize(cssW, cssH) {
    const pr = this.renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(cssW * pr));
    const h = Math.max(1, Math.floor(cssH * pr));
    this.rt.setSize(w, h);
    this.mat.uniforms.uResolution.value.set(w, h);
  }

  /**
   * Render the world to the target, then the grade pass to the screen.
   * @param {THREE.Camera} camera
   * @param {number} time sim time (grain animation)
   * @param {[number,number]} sunNdc sun position in clip space (y up)
   * @param {number} sunStrength 0..1 halo intensity
   * @param {number} grainBoost extra grain (storms)
   */
  render(camera, time, sunNdc, sunStrength, grainBoost = 0) {
    const u = this.mat.uniforms;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.worldScene, camera);
    this.renderer.setRenderTarget(null);
    u.uTime.value = time;
    u.uGrain.value = 0.035 + grainBoost;
    u.uSunNdc.value.set(sunNdc[0], sunNdc[1]);
    u.uSunStrength.value = sunStrength;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.rt.dispose();
    this.mat.dispose();
  }
}

export default PostFx;
