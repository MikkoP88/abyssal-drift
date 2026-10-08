// ============================================================================
// input.js — Keyboard + mouse state with pointer-lock.
// Exposes polled booleans and delta accumulators consumed each frame.
// ============================================================================

import { clamp } from './utils.js';

export class InputManager {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = Object.create(null);
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseRightDown = false;
    this.wheelDelta = 0;
    this.locked = false;
    this._boundLockChange = this._onLockChange.bind(this);
    document.addEventListener('pointerlockchange', this._boundLockChange);
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    });
    window.addEventListener('wheel', (e) => {
      this.wheelDelta += e.deltaY;
    }, { passive: true });
    window.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
  }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.dom;
    if (!this.locked) {
      // Clear held state on unlock to avoid stuck keys.
      for (const k in this.keys) this.keys[k] = false;
      this.mouseDown = false;
      this.mouseRightDown = false;
    }
  }

  requestLock() {
    if (!this.locked) {
      try {
        const p = this.dom.requestPointerLock();
        p?.catch?.(() => {}); // headless / denied: non-fatal
      } catch (_) { /* non-fatal */ }
    }
  }

  // Poll a key by code (e.g. 'KeyW').
  key(code) { return !!this.keys[code]; }

  // Axis from a pair of codes, in [-1, 1].
  axis(posCode, negCode) {
    return (this.key(posCode) ? 1 : 0) - (this.key(negCode) ? 1 : 0);
  }

  // Consume accumulated mouse deltas (resets to zero).
  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  consumeWheel() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  // Edge-triggered: true only on the frame the key transitioned to pressed.
  pressedOnce(code) {
    if (this.keys[code]) {
      if (this._prevPressed && this._prevPressed.has(code)) return false;
      return true;
    }
    return false;
  }

  endFrame() {
    this._prevPressed = new Set(Object.keys(this.keys).filter(k => this.keys[k]));
  }
}

export default InputManager;
