// ============================================================================
// hud.js — DOM overlay UI. Deliberately framework-free: a template string +
// cached element refs, updated imperatively each frame. Styling lives in
// styles.css.
// ============================================================================

import { FishState } from './fishing.js';
import { formatClock } from './utils.js';

const TEMPLATE = /* html */`
<div id="hud-root">
  <!-- Top-left: vitals -->
  <div class="panel vitals">
    <div class="bar-row"><span class="bar-label">HEALTH</span><div class="bar"><div class="bar-fill health" id="hud-health"></div></div></div>
    <div class="bar-row"><span class="bar-label">STAMINA</span><div class="bar"><div class="bar-fill stamina" id="hud-stamina"></div></div></div>
    <div class="bar-row"><span class="bar-label">FUEL</span><div class="bar"><div class="bar-fill fuel" id="hud-fuel"></div></div></div>
  </div>

  <!-- Top-center: compass strip -->
  <div class="compass-strip" id="hud-compass"></div>

  <!-- Top-right: clock + weather + mode -->
  <div class="panel clockbox">
    <div id="hud-clock">07:30</div>
    <div id="hud-weather">CLEAR</div>
    <div id="hud-mode">HELM</div>
  </div>

  <!-- Bottom-center: fishing UI -->
  <div class="fishing-ui" id="hud-fishing">
    <div class="alert" id="hud-alert"></div>
    <div class="meter-block" id="hud-charge-block" hidden>
      <span class="meter-label">CAST POWER</span>
      <div class="bar wide"><div class="bar-fill charge" id="hud-charge"></div></div>
    </div>
    <div class="meter-block" id="hud-tension-block" hidden>
      <span class="meter-label">LINE TENSION</span>
      <div class="bar wide tension-bar">
        <div class="sweet-spot" id="hud-sweetspot"></div>
        <div class="bar-fill tension" id="hud-tension"></div>
      </div>
    </div>
    <div class="meter-block" id="hud-catch-block" hidden>
      <span class="meter-label" id="hud-fishname">FISH</span>
      <div class="bar wide"><div class="bar-fill catch" id="hud-catch"></div></div>
    </div>
  </div>

  <!-- Contextual prompt (center-bottom, above fishing UI) -->
  <div class="prompt" id="hud-prompt" hidden></div>

  <!-- Bottom-left: controls hint -->
  <div class="controls-hint" id="hud-controls">
    <div><b>V</b> helm ⇄ on foot &nbsp;<b>E</b> board (in water)</div>
    <div><b>WASD</b> drive / move &nbsp;<b>Shift</b> boost / run &nbsp;<b>SPACE</b> cast / jump</div>
    <div><b>LMB</b> reel &nbsp;<b>R</b> retrieve &nbsp;<b>ESC</b> pause</div>
  </div>

  <!-- Toast (catch results) -->
  <div class="toast" id="hud-toast"></div>

  <!-- Crosshair -->
  <div class="crosshair" id="hud-crosshair"></div>

  <!-- Damage vignette -->
  <div class="damage-vignette" id="hud-damage"></div>

  <!-- Low-fuel warning flash -->
  <div class="warn-flash" id="hud-warn"></div>
</div>
`;

export class Hud {
  constructor(container) {
    container.insertAdjacentHTML('beforeend', TEMPLATE);
    const $ = (id) => document.getElementById(id);
    this.el = {
      health: $('hud-health'), stamina: $('hud-stamina'), fuel: $('hud-fuel'),
      clock: $('hud-clock'), weather: $('hud-weather'), mode: $('hud-mode'),
      compass: $('hud-compass'), prompt: $('hud-prompt'),
      alert: $('hud-alert'),
      chargeBlock: $('hud-charge-block'), charge: $('hud-charge'),
      tensionBlock: $('hud-tension-block'), tension: $('hud-tension'), sweetspot: $('hud-sweetspot'),
      catchBlock: $('hud-catch-block'), catchBar: $('hud-catch'), fishname: $('hud-fishname'),
      toast: $('hud-toast'), crosshair: $('hud-crosshair'),
      damage: $('hud-damage'), warn: $('hud-warn'), controls: $('hud-controls'),
    };
    this._toastTimer = 0;
  }

  // Per-frame update.
  update(state) {
    const e = this.el;
    e.health.style.width = `${state.health}%`;
    e.stamina.style.width = `${state.stamina}%`;
    e.fuel.style.width = `${state.fuel}%`;
    e.clock.textContent = formatClock(state.hour);
    e.weather.textContent = state.storm ? '⛈ STORM' : '☀ CLEAR';

    // Mode badge + contextual prompt.
    const mode = state.mode || 'helm';
    e.mode.textContent = mode === 'helm' ? 'HELM' : mode === 'swimming' ? 'SWIMMING' : mode === 'boarding' ? 'BOARDING' : 'ON FOOT';
    let prompt = '';
    if (mode === 'swimming' && state.nearBoat) prompt = 'Press <b>E</b> to board the boat';
    else if (mode === 'on_deck') prompt = '<b>V</b> — back to the helm';
    else if (mode === 'helm') prompt = '<b>V</b> — get on foot';
    if (prompt) { e.prompt.innerHTML = prompt; e.prompt.hidden = false; }
    else e.prompt.hidden = true;

    // Compass: heading 0 faces north (-Z). Marks slide so the bearing under the
    // center notch equals current heading; triple-render for seamless wrap.
    // Throttled: only rebuild when heading moves > 0.5deg (DOM churn saver).
    if (Math.abs(state.headingDeg - (this._lastHeading ?? -999)) > 0.5) {
      this._lastHeading = state.headingDeg;
      const shift = (180 - state.headingDeg + 360) % 360;
      let html = '';
      for (let deg = 0; deg < 360; deg += 15) {
        for (const off of [-360, 0, 360]) {
          const dd = (((deg + shift + off) % 360) + 360) % 360;
          if (dd < 0 || dd > 360) continue;
          const label = deg % 90 === 0 ? ['N', 'E', 'S', 'W'][deg / 90] : '';
          html += `<span class="cmark${label ? ' major' : ''}" style="left:${(dd / 360) * 100}%">${label}</span>`;
        }
      }
      e.compass.innerHTML = html;
    }

    // Fishing UI visibility.
    const f = state.fishing;
    e.chargeBlock.hidden = f.state !== FishState.CASTING;
    e.tensionBlock.hidden = f.state !== FishState.FIGHT;
    e.catchBlock.hidden = f.state !== FishState.FIGHT;
    e.crosshair.classList.toggle('hidden', f.state === FishState.FIGHT);

    e.charge.style.width = `${f.charge * 100}%`;
    e.tension.style.width = `${Math.min(f.tension, 1) * 100}%`;
    e.tension.parentElement.classList.toggle('danger', f.tension > 0.85);
    e.catchBar.style.width = `${f.catchMeter * 100}%`;
    e.fishname.textContent = f.fishName ? `HOOKED: ${f.fishName.toUpperCase()}` : 'FISH';

    // Alerts.
    let alertText = '', alertClass = '';
    if (f.state === FishState.WAITING) { alertText = 'Waiting for a bite…'; }
    if (f.state === FishState.BITE) { alertText = '!! STRIKE NOW — SPACE !!'; alertClass = 'strike'; }
    if (f.state === FishState.FIGHT && f.tension > 0.85) { alertText = 'EASE OFF THE REEL!'; alertClass = 'danger'; }
    if (f.state === FishState.FIGHT && f.tension < 0.3) { alertText = 'REEL IT IN (hold LMB)'; alertClass = 'hint'; }
    e.alert.textContent = alertText;
    e.alert.className = `alert ${alertClass}`;

    // Result toast.
    if (f.result) {
      const r = f.result;
      if (r.outcome === 'caught') {
        this.toast(`${r.fish.species.name} — ${Math.round(r.fish.weightKg)} kg`, 'good');
      } else if (r.outcome === 'broken') {
        this.toast('The line snapped!', 'bad');
      } else if (r.outcome === 'escaped') {
        this.toast('It got away…', 'bad');
      }
    }

    // Damage vignette pulse.
    e.damage.style.opacity = state.damageFlash > 0 ? String(Math.min(state.damageFlash, 1)) : '0';
    e.warn.style.opacity = state.lowFuelPulse > 0 ? String(0.5 + Math.sin(Date.now() * 0.01) * 0.3) : '0';
  }

  toast(text, kind) {
    const e = this.el.toast;
    e.textContent = text;
    e.className = `toast show ${kind}`;
    clearTimeout(this._toastTO);
    this._toastTO = setTimeout(() => { e.className = 'toast'; }, 3200);
  }

  // ---- Screens -----------------------------------------------------------

  showScreen(kind) {
    // kind: 'start' | 'dead' | null
    this.hideScreens();
    if (!kind) return;
    const root = document.querySelector('#hud-root');
    const div = document.createElement('div');
    div.className = 'screen';
    div.id = 'screen-' + kind;
    if (kind === 'start') {
      div.innerHTML = `
        <h1>ABYSSAL DRIFT</h1>
        <p class="subtitle">First-person deep-water monster fishing</p>
        <div class="screen-body">
          <p>The waters off the Shattered Reach hide creatures that should not exist.
          You have one boat, one rod, and the night ahead. Cast, fight, survive.</p>
          <ul class="instructions">
            <li><b>W / S</b> — throttle forward / reverse</li>
            <li><b>A / D</b> — steer &nbsp;&nbsp; <b>SHIFT</b> — boost</li>
            <li><b>MOUSE</b> — look</li>
            <li><b>HOLD SPACE</b> — charge cast, release to throw</li>
            <li><b>SPACE</b> — strike when the bobber dives</li>
            <li><b>HOLD LMB</b> — reel during the fight</li>
            <li><b>R</b> — retrieve line</li>
            <li><b>V</b> — leave the helm, walk the deck (third person)</li>
            <li><b>SPACE</b> — jump &nbsp;·&nbsp; walk overboard to swim, <b>E</b> to board</li>
          </ul>
          <p class="tip">Keep line tension in the amber zone to land the fish.<br/>
          Red zone snaps the line. Watch your fuel — the shore is far.</p>
        </div>
        <button class="btn" id="btn-start">SET OUT TO SEA</button>`;
    } else if (kind === 'dead') {
      div.innerHTML = `
        <h1 class="death-title">THE DEEP KEEPS YOU</h1>
        <p class="subtitle">Your boat drifted into darkness.</p>
        <div class="screen-body">
          <p id="death-stats"></p>
        </div>
        <button class="btn" id="btn-restart">TRY AGAIN</button>`;
    }
    root.appendChild(div);

    if (kind === 'start') {
      document.getElementById('btn-start').onclick = () => this.onStart?.();
    } else {
      document.getElementById('btn-restart').onclick = () => this.onRestart?.();
    }
  }

  setDeathStats(html) {
    const el = document.getElementById('death-stats');
    if (el) el.innerHTML = html;
  }

  hideScreens() {
    document.querySelectorAll('.screen').forEach((s) => s.remove());
  }

  setCallbacks({ onStart, onRestart }) {
    this.onStart = onStart;
    this.onRestart = onRestart;
  }
}

export default Hud;
