// ============================================================================
// main.js — Entry point. Boots the Game on the page's canvas.
// Serve this folder over http(s) (module scripts require it):
//   python -m http.server 8000   (or any static server)
// ============================================================================

import Game from './game/game.js';

const canvas = document.getElementById('game-canvas');
const uiLayer = document.getElementById('ui-layer');

try {
  const game = new Game(canvas, uiLayer);
  window.__abyssalGame = game; // dev handle
} catch (err) {
  console.error('Failed to initialize game:', err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      background:#04080d;color:#ff6b6b;font-family:monospace;z-index:99;padding:2rem;text-align:center">
      Failed to start the game.<br/><small>${String(err)}</small><br/><br/>
      Make sure your browser supports WebGL2 and that you opened this page
      over http(s), not file://.</div>`
  );
}
