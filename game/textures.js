// ============================================================================
// textures.js — Procedural PBR texture factory.
// Every surface in the game gets a canvas-generated texture (wood grain,
// gelcoat, brushed aluminum, marine fabric, dashboard gauges…). No
// downloads, fully offline, deterministic seeds so validation is stable.
// ============================================================================

import * as THREE from '../libs/three.module.js';

// Small seeded RNG so textures are identical every boot (stable validation).
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Speckle noise pass over a rectangle.
function speckle(ctx, x0, y0, w, h, rnd, n, alphaLo, alphaHi, light) {
  for (let i = 0; i < n; i++) {
    const a = alphaLo + rnd() * (alphaHi - alphaLo);
    ctx.fillStyle = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x0 + rnd() * w, y0 + rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

// ---------------------------------------------------------------------------
// Teak deck planks — long grain, knots, plank gaps, worn traffic path.
// ---------------------------------------------------------------------------
export function woodDeckTex(repeat = [3, 2]) {
  const size = 512;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = mulberry(101);

  ctx.fillStyle = '#7a4e2b';
  ctx.fillRect(0, 0, size, size);

  const planks = 8;
  const pw = size / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * pw;
    // Plank base tone varies per plank.
    const shade = 0.85 + rnd() * 0.3;
    ctx.fillStyle = `rgb(${Math.floor(122 * shade)},${Math.floor(78 * shade)},${Math.floor(43 * shade)})`;
    ctx.fillRect(0, y0, size, pw);

    // Grain streaks running along the plank (x axis).
    for (let g = 0; g < 26; g++) {
      const gy = y0 + rnd() * pw;
      const dark = rnd() > 0.5;
      ctx.strokeStyle = dark ? `rgba(40,22,10,${0.05 + rnd() * 0.12})` : `rgba(210,160,100,${0.04 + rnd() * 0.08})`;
      ctx.lineWidth = 0.5 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= size; x += 32) {
        ctx.lineTo(x, gy + Math.sin(x * 0.02 + g) * 2.2 + (rnd() - 0.5) * 2);
      }
      ctx.stroke();
    }

    // Occasional knot.
    if (rnd() > 0.45) {
      const kx = rnd() * size, ky = y0 + pw * (0.3 + rnd() * 0.4);
      const kr = 3 + rnd() * 5;
      const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr * 2);
      grad.addColorStop(0, 'rgba(30,16,8,0.85)');
      grad.addColorStop(0.5, 'rgba(60,34,16,0.4)');
      grad.addColorStop(1, 'rgba(60,34,16,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(kx, ky, kr * 2, 0, Math.PI * 2); ctx.fill();
    }

    // Plank gap (dark seam) + fastener shadows.
    ctx.fillStyle = 'rgba(15,8,4,0.9)';
    ctx.fillRect(0, y0 - 1, size, 2);
    for (let fx = pw * 0.5; fx < size; fx += pw * 1.6) {
      ctx.fillStyle = 'rgba(20,12,6,0.7)';
      ctx.beginPath(); ctx.arc(fx + rnd() * 8, y0 + pw / 2, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Worn traffic path down the middle (lighter scuffing).
  const wear = ctx.createLinearGradient(0, size * 0.35, 0, size * 0.65);
  wear.addColorStop(0, 'rgba(220,190,150,0)');
  wear.addColorStop(0.5, 'rgba(220,190,150,0.14)');
  wear.addColorStop(1, 'rgba(220,190,150,0)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, size, size);

  speckle(ctx, 0, 0, size, size, rnd, 900, 0.02, 0.06, false);
  speckle(ctx, 0, 0, size, size, rnd, 500, 0.02, 0.05, true);

  return toTexture(c, { repeat });
}

// ---------------------------------------------------------------------------
// Hull gelcoat: white topsides with orange-peel + grime streaks, grey
// rubrail band, maroon anti-foul bottom. UV v: 0 = keel … 1 = sheer line
// (flipY default → canvas bottom = v=0 = keel).
// ---------------------------------------------------------------------------
export function hullPaintTex(repeat = [4, 1]) {
  const size = 512;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = mulberry(202);

  // Anti-foul bottom (v 0..0.14 → canvas bottom).
  ctx.fillStyle = '#5a1f24';
  ctx.fillRect(0, size * 0.86, size, size * 0.14);
  speckle(ctx, 0, size * 0.86, size, size * 0.14, rnd, 400, 0.03, 0.08, false);

  // Rubrail / boot stripe (v 0.14..0.24).
  ctx.fillStyle = '#3c4148';
  ctx.fillRect(0, size * 0.76, size, size * 0.10);

  // White gelcoat topsides (v 0.24..1).
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(0, 0, size, size * 0.76);

  // Orange peel: fine mottling on the topsides only.
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * size;
    const y = rnd() * size * 0.76;
    const a = 0.015 + rnd() * 0.03;
    ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(90,84,74,${a})`;
    ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }

  // Grime streaks running down from the sheer line (salt + exhaust).
  for (let i = 0; i < 46; i++) {
    const x = rnd() * size;
    const w = 1 + rnd() * 3;
    const len = size * (0.1 + rnd() * 0.5);
    const g = ctx.createLinearGradient(0, size * 0.76 - len, 0, size * 0.76);
    g.addColorStop(0, 'rgba(70,64,54,0)');
    g.addColorStop(1, `rgba(70,64,54,${0.05 + rnd() * 0.12})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, size * 0.76 - len, w, len);
  }

  // Salt line at the waterline (faint tan band on the boot stripe edge).
  ctx.fillStyle = 'rgba(190,170,130,0.35)';
  ctx.fillRect(0, size * 0.745, size, size * 0.02);

  // Sheer line accent stripe (navy pinstripe near the top).
  ctx.fillStyle = '#22384e';
  ctx.fillRect(0, size * 0.035, size, size * 0.02);

  return toTexture(c, { repeat });
}

// ---------------------------------------------------------------------------
// Brushed aluminum — horizontal brush streaks + light scratches.
// ---------------------------------------------------------------------------
export function aluminumTex(repeat = [2, 2]) {
  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = mulberry(303);

  ctx.fillStyle = '#b9bec4';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 900; i++) {
    const y = rnd() * size;
    const light = rnd() > 0.5;
    ctx.strokeStyle = light ? `rgba(255,255,255,${0.03 + rnd() * 0.07})` : `rgba(40,44,50,${0.03 + rnd() * 0.07})`;
    ctx.lineWidth = 0.6;
    const x = rnd() * size;
    const len = 20 + rnd() * 120;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo((x + len) % size, y); ctx.stroke();
  }

  // Scratches.
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.15})`;
    ctx.lineWidth = 0.7;
    const x = rnd() * size, y = rnd() * size;
    const a = rnd() * Math.PI;
    const l = 8 + rnd() * 30;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }

  return toTexture(c, { repeat });
}

// ---------------------------------------------------------------------------
// Matte plastic / vinyl (console body, cooler lids) with fine speckle.
// ---------------------------------------------------------------------------
export function plasticTex(hex, repeat = [2, 2]) {
  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = mulberry(hex & 0xffff);

  ctx.fillStyle = '#' + hex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, 0, 0, size, size, rnd, 1400, 0.02, 0.06, false);
  speckle(ctx, 0, 0, size, size, rnd, 900, 0.02, 0.05, true);

  return toTexture(c, { repeat });
}

// ---------------------------------------------------------------------------
// Non-slip deck coating — charcoal with diamond-plate emboss + speckle.
// ---------------------------------------------------------------------------
export function nonSlipTex(repeat = [4, 4]) {
  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = mulberry(404);

  ctx.fillStyle = '#2e3338';
  ctx.fillRect(0, 0, size, size);

  // Diamond plate: pairs of raised bars at ±45° in staggered cells.
  const cell = 32;
  for (let cy = 0; cy < size / cell; cy++) {
    for (let cx = 0; cx < size / cell; cx++) {
      const ox = cx * cell + (cy % 2 ? cell / 2 : 0);
      const oy = cy * cell;
      // Bar A (\)
      let g = ctx.createLinearGradient(ox - 8, oy - 8, ox + 8, oy + 8);
      g.addColorStop(0, 'rgba(96,104,112,0.9)'); g.addColorStop(1, 'rgba(30,34,38,0.9)');
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = g; ctx.fillRect(-9, -2.4, 18, 4.8); ctx.restore();
      // Bar B (/) offset half a cell diagonally.
      g = ctx.createLinearGradient(ox - 8, oy + cell / 2 + 8, ox + 8, oy + cell / 2 - 8);
      g.addColorStop(0, 'rgba(96,104,112,0.9)'); g.addColorStop(1, 'rgba(30,34,38,0.9)');
      ctx.save(); ctx.translate(ox + cell / 2, oy + cell / 2); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = g; ctx.fillRect(-9, -2.4, 18, 4.8); ctx.restore();
    }
  }

  speckle(ctx, 0, 0, size, size, rnd, 1600, 0.03, 0.08, false);
  speckle(ctx, 0, 0, size, size, rnd, 800, 0.03, 0.06, true);

  return toTexture(c, { repeat });
}

// ---------------------------------------------------------------------------
// Marine fabric (seat upholstery) — woven navy with stitch channels.
// ---------------------------------------------------------------------------
export function fabricTex(hex = 0x243447, repeat = [3, 3]) {
  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = mulberry(505);

  ctx.fillStyle = '#' + hex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, size, size);

  // Weave: alternating light/dark threads on both axes.
  const t = 4;
  for (let y = 0; y < size; y += t) {
    for (let x = 0; x < size; x += t) {
      const on = ((x / t + y / t) % 2) === 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.14)';
      ctx.fillRect(x + ((y / t) % 2 ? t / 2 : 0), y, t / 2 - 1, t - 1);
    }
  }

  // Stitch channels every third of the canvas.
  ctx.strokeStyle = 'rgba(230,235,240,0.35)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);
  for (const fx of [1 / 3, 2 / 3]) {
    ctx.beginPath(); ctx.moveTo(size * fx, 0); ctx.lineTo(size * fx, size); ctx.stroke();
  }
  ctx.setLineDash([]);

  speckle(ctx, 0, 0, size, size, rnd, 700, 0.02, 0.05, false);

  return toTexture(c, { repeat });
}

// ---------------------------------------------------------------------------
// Dashboard gauge cluster — speedo with needle, depth sounder readout,
// temperature gauge, VHF radio screen. Visible from the helm seat; doubles
// as an emissive map so the dash glows softly at night.
// ---------------------------------------------------------------------------
export function gaugeClusterTex() {
  const [c, ctx] = makeCanvas(512, 256);
  const rnd = mulberry(606);

  // Panel base with subtle vertical shading.
  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#232b34'); bg.addColorStop(1, '#12171d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);

  // --- Speedometer (left) ---
  const gx = 110, gy = 118, gr = 78;
  ctx.fillStyle = '#0c1116';
  ctx.beginPath(); ctx.arc(gx, gy, gr + 8, 0, Math.PI * 2); ctx.fill();
  const dial = ctx.createRadialGradient(gx - 14, gy - 18, 8, gx, gy, gr);
  dial.addColorStop(0, '#232c36'); dial.addColorStop(1, '#0a0e13');
  ctx.fillStyle = dial;
  ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();

  // Tick marks + numerals (kn).
  for (let kn = 0; kn <= 40; kn += 5) {
    const a = Math.PI * 0.75 + (kn / 40) * Math.PI * 1.5;
    const major = kn % 10 === 0;
    ctx.strokeStyle = major ? '#dfe8f0' : '#5a6a78';
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(gx + Math.cos(a) * (gr - (major ? 16 : 10)), gy + Math.sin(a) * (gr - (major ? 16 : 10)));
    ctx.lineTo(gx + Math.cos(a) * (gr - 4), gy + Math.sin(a) * (gr - 4));
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#cfd9e2';
      ctx.font = 'bold 15px Segoe UI';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(kn), gx + Math.cos(a) * (gr - 30), gy + Math.sin(a) * (gr - 30));
    }
  }
  ctx.fillStyle = '#7f93a3'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'center';
  ctx.fillText('KN', gx, gy + 34);

  // Needle at ~14 kn with hub + glass reflection arc.
  const na = Math.PI * 0.75 + (14 / 40) * Math.PI * 1.5;
  ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(gx - Math.cos(na) * 12, gy - Math.sin(na) * 12);
  ctx.lineTo(gx + Math.cos(na) * (gr - 22), gy + Math.sin(na) * (gr - 22)); ctx.stroke();
  ctx.fillStyle = '#dfe4ea'; ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(gx, gy, gr - 8, -Math.PI * 0.85, -Math.PI * 0.45); ctx.stroke();

  // --- Depth sounder (center) ---
  const sx = 256, sy = 64;
  ctx.fillStyle = '#0a1418';
  ctx.fillRect(sx - 78, sy - 34, 156, 96);
  ctx.strokeStyle = '#2c3a44'; ctx.lineWidth = 3;
  ctx.strokeRect(sx - 78, sy - 34, 156, 96);
  // Sonar trace line across the screen + fish blips.
  ctx.strokeStyle = 'rgba(84,255,168,0.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = -74; x <= 74; x += 4) {
    const yy = sy + Math.sin(x * 0.18) * 6 + (rnd() - 0.5) * 5;
    if (x === -74) ctx.moveTo(sx + x, yy); else ctx.lineTo(sx + x, yy);
  }
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(84,255,168,${0.35 + rnd() * 0.4})`;
    ctx.beginPath(); ctx.arc(sx - 66 + rnd() * 132, sy - 8 + rnd() * 34, 1 + rnd() * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#54ffa8'; ctx.font = 'bold 34px Consolas'; ctx.textAlign = 'center';
  ctx.fillText('12.4', sx + 34, sy + 34);
  ctx.font = '13px Consolas'; ctx.fillStyle = '#54ffa8'; ctx.textAlign = 'left';
  ctx.fillText('m', sx + 66, sy + 34);

  // --- Temperature gauge (right) ---
  const tx = 402, ty = gy;
  const tr = gr * 0.62;
  ctx.fillStyle = '#0c1116';
  ctx.beginPath(); ctx.arc(tx, ty, tr + 8, 0, Math.PI * 2); ctx.fill();
  const tdial = ctx.createRadialGradient(tx - 10, ty - 12, 6, tx, ty, tr);
  tdial.addColorStop(0, '#232c36'); tdial.addColorStop(1, '#0a0e13');
  ctx.fillStyle = tdial;
  ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
    ctx.strokeStyle = i > 6 ? '#ff8a4d' : '#8fa3b3'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(a) * (tr - 12), ty + Math.sin(a) * (tr - 12));
    ctx.lineTo(tx + Math.cos(a) * (tr - 4), ty + Math.sin(a) * (tr - 4));
    ctx.stroke();
  }
  const ta = Math.PI * 0.75 + (4 / 8) * Math.PI * 1.5;
  ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tx - Math.cos(ta) * 8, ty - Math.sin(ta) * 8);
  ctx.lineTo(tx + Math.cos(ta) * (tr - 16), ty + Math.sin(ta) * (tr - 16)); ctx.stroke();

  // --- Radio screen (bottom strip) ---
  ctx.fillStyle = '#08131a'; ctx.fillRect(24, 214, 464, 34);
  ctx.strokeStyle = '#2c3a44'; ctx.lineWidth = 2; ctx.strokeRect(24, 214, 464, 34);
  ctx.fillStyle = '#7fdcff'; ctx.font = 'bold 20px Consolas'; ctx.textAlign = 'left';
  ctx.fillText('VHF FM', 36, 237);
  ctx.fillStyle = '#54ffa8'; ctx.textAlign = 'right';
  ctx.fillText('162.425 MHz', 476, 237);

  // Button row above the radio.
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i === 3 ? '#3a4a5a' : '#232c36';
    ctx.beginPath(); ctx.arc(64 + i * 56, 196, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3c4a58'; ctx.lineWidth = 1.5; ctx.stroke();
    if (i === 3) { ctx.fillStyle = '#7fdcff'; ctx.beginPath(); ctx.arc(64 + i * 56, 196, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  return toTexture(c);
}

// ---------------------------------------------------------------------------
// Rubber fender / tire — dark with molded ribs and tread speckle.
// ---------------------------------------------------------------------------
export function rubberTex(repeat = [2, 1]) {
  const size = 128;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = mulberry(707);

  ctx.fillStyle = '#17181a';
  ctx.fillRect(0, 0, size, size);

  // Molded ribs running vertically with a shaded groove between each pair.
  for (let x = 8; x < size; x += 24) {
    const g = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
    g.addColorStop(0, 'rgba(58,60,64,0.9)'); g.addColorStop(1, 'rgba(12,13,14,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 6, 0, 12, size);
    ctx.fillStyle = 'rgba(8,9,10,0.8)';
    ctx.fillRect(x + 6, 0, 3, size);
  }

  speckle(ctx, 0, 0, size, size, rnd, 500, 0.03, 0.08, false);

  return toTexture(c, { repeat });
}