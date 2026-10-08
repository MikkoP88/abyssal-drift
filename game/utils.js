// ============================================================================
// utils.js — Math, RNG, and noise primitives shared across systems.
// Pure functions only; trivially portable to C++.
// ============================================================================

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, inA, inB, outA, outB) =>
  lerp(outA, outB, clamp(invLerp(inA, inB, v), 0, 1));
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));
export const randRange = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(randRange(lo, hi + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// Deterministic hash -> [0,1). Stable across runs for a given seed.
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in 2D (bilinear-interpolated hashed lattice).
export function valueNoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// Fractal Brownian motion — layered value noise for organic surfaces.
export function fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// Signed distance helpers for collision-ish checks.
export const dist2D = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return Math.hypot(dx, dz);
};

// Angle lerp that takes the shortest arc. Angles in radians.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Convert a clock hour [0..24) to a sun elevation angle. Noon = zenith.
export function hourToSunAngle(hour) {
  // Sun rises ~6h, sets ~18h. Map hour to [-PI/2 .. PI/2].
  const t = (hour - 6) / 12; // 0 at sunrise, 1 at sunset
  return t * Math.PI; // radians above horizon at noon = PI/2
}

export function formatClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
