import { SPAWN_COST, HUT_COST } from './const.js';
import { sfx, isMuted, setMuted, unlock } from './audio.js';

const $ = id => document.getElementById(id);

const SAVE_KEY = 'pyttpytt.save';

export function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}
export function store(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export class UI {
  constructor(game) {
    this.game = game;
    this.buildArmed = false;
    this.toastTimer = 0;
    this.hintIndex = 0;
    this.pointerWorld = null;
    this.selBox = null;

    document.querySelectorAll('#actionbar button').forEach(btn => {
      btn.addEventListener('click', () => { unlock(); this.action(btn.dataset.act); });
    });
    $('btn-pause').addEventListener('click', () => { unlock(); this.showPause(); });
    $('chip-goal').addEventListener('click', () => {
      const c = this.game.cam, m = this.game.world.mudpit;
      c.x = m.x; c.y = m.y; c.clampView();
    });
    $('chip-pop').addEventListener('click', () => {
      const p = this.game.world.selectIdle();
      if (p) { const c = this.game.cam; c.x = p.x; c.y = p.y; c.clampView(); }
      this.refreshActions();
    });
  }

  action(act) {
    const w = this.game.world;
    if (this.buildArmed && act !== 'build') { this.buildArmed = false; }
    switch (act) {
      case 'idle': {
        const p = w.selectIdle();
        if (p) { const c = this.game.cam; c.x = p.x; c.y = p.y; c.clampView(); }
        break;
      }
      case 'all': w.selectAll(); break;
      case 'exithuts': w.cmdExitAll(); break;
      case 'dirt': w.cmdGather('dirt'); break;
      case 'water': w.cmdGather('water'); break;
      case 'both': w.cmdGather('both'); break;
      case 'revive': w.cmdRevive(); break;
      case 'stop': w.cmdStop(); break;
      case 'enter': w.cmdEnter(); break;
      case 'build':
        this.buildArmed = !this.buildArmed;
        if (this.buildArmed) {
          if (w.stock.dirt < HUT_COST || w.stock.water < HUT_COST) {
            w.emit(`A hut needs ${HUT_COST} 🟤 + ${HUT_COST} 💧 stocked at the mud pit`, 'warn');
            sfx.deny();
            this.buildArmed = false;
          } else {
            w.emit('Tap open ground to place the hut ⛺');
          }
        }
        break;
    }
    this.refreshActions();
  }

  refreshActions() {
    const w = this.game.world;
    const buildBtn = document.querySelector('[data-act="build"]');
    buildBtn.classList.toggle('armed', this.buildArmed);
    document.querySelector('[data-act="enter"]').disabled = w.completedHuts.length === 0;
    document.querySelector('[data-act="revive"]').disabled = w.downed.length === 0;
    document.querySelector('[data-act="exithuts"]').disabled =
      !w.huts.some(h => h.occupants.length > 0);
  }

  update(dt) {
    const w = this.game.world;
    $('dirt-count').textContent = `${w.stock.dirt}/${SPAWN_COST}`;
    $('water-count').textContent = `${w.stock.water}/${SPAWN_COST}`;
    $('pop-count').textContent = w.population;
    $('hut-count').textContent = w.completedHuts.length;

    const goal = [`🧑 ${w.population}/${w.params.popTarget}`];
    if (w.params.hutTarget) goal.push(`⛺ ${w.completedHuts.length}/${w.params.hutTarget}`);
    $('chip-goal').textContent = `Level ${w.level} · ` + goal.join(' ');

    const W = w.weather;
    const ico = $('weather-ico');
    const chip = $('chip-weather');
    chip.classList.toggle('warn', W.state === 'warning');
    ico.textContent =
      W.state === 'rain' ? '🌧' :
      W.state === 'sun' ? '🔥' :
      W.state === 'warning' ? (W.next === 'rain' ? '🌧⚠️' : '☀️⚠️') : '🌤';

    // toasts from world events
    if (w.events.length) {
      const ev = w.events.shift();
      this.toast(ev.text);
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) $('toast').classList.add('hidden');
    }

    this.updateHints();
    // keep action bar in sync with selection deaths etc. (cheap)
    if ((this._sync = (this._sync || 0) + dt) > 0.5) { this._sync = 0; this.refreshActions(); }
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    this.toastTimer = 3.2;
  }

  // ---------- tutorial hints (level 1) ----------
  hints() {
    const g = this.game;
    return [
      { text: '👋 Welcome! Drag to look around. Tap a mud person to select it.', done: w => w.selected.size > 0 },
      { text: 'Now tap a pond 💧 or a dirt hole 🟤 — your mud person will start gathering.', done: w => w.people.some(p => p.task?.type === 'gather') },
      { text: `Gathering fills the mud pit. ${SPAWN_COST} dirt + ${SPAWN_COST} water makes a NEW mud person!`, done: w => w.spawnedCount > 0 },
      { text: 'Tip: long-press and drag to select a whole group. ♻️ Both = gather dirt & water.', done: w => w.weather.state !== 'clear' },
      { text: '⚠️ Weather! Rain MELTS mud people, sun DRIES them. Build a hut ⛺ or revive fallen friends ✨.', done: w => w.time > 60 && w.weather.state === 'clear' },
    ];
  }

  updateHints() {
    const bar = $('hintbar');
    if (this.game.world.level !== 1 || this.game.world.status !== 'playing') {
      bar.classList.add('hidden');
      return;
    }
    const hints = this.hints();
    while (this.hintIndex < hints.length && hints[this.hintIndex].done(this.game.world)) this.hintIndex++;
    if (this.hintIndex >= hints.length) { bar.classList.add('hidden'); return; }
    const h = hints[this.hintIndex];
    if (bar.textContent !== h.text) bar.textContent = h.text;
    bar.classList.remove('hidden');
  }

  // ---------- screens ----------
  screen(html) {
    $('screen-panel').innerHTML = html;
    $('screen').classList.remove('hidden');
    this.game.paused = true;
  }
  hideScreen() {
    $('screen').classList.add('hidden');
    this.game.paused = false;
  }

  bind(id, fn) { $(id).addEventListener('click', () => { unlock(); fn(); }); }

  showTitle() {
    const save = loadSave();
    const lvl = save.level || 1;
    this.screen(`
      <h1>🟤 Pyttpytt</h1>
      <p class="sub">A cozy mud-people strategy game.<br>Grow your mud community — and keep it out of the weather.</p>
      ${lvl > 1 ? `<button id="b-continue">▶️ Continue — Level ${lvl}</button>` : ''}
      <button id="b-new" ${lvl > 1 ? 'class="secondary"' : ''}>🌱 ${lvl > 1 ? 'Start over' : 'Play'}</button>
      <button id="b-howto" class="secondary">📖 How to play</button>
      <p class="sub">Inspired by Mudcraft (The LlamaPad, 2008). Original art &amp; code.</p>
    `);
    if (lvl > 1) this.bind('b-continue', () => this.game.startLevel(lvl));
    this.bind('b-new', () => {
      if ((loadSave().level || 1) > 1 && !confirm('Start over from level 1?')) return;
      store({ ...loadSave(), level: 1 });
      this.game.startLevel(1);
    });
    this.bind('b-howto', () => this.showHowto(() => this.showTitle()));
  }

  showHowto(back) {
    this.screen(`
      <h2>📖 How to play</h2>
      <ul class="howto">
        <li><b>Tap</b> a mud person to select. <b>Long-press &amp; drag</b> for a group. <b>Drag</b> ground to pan, <b>pinch</b> to zoom.</li>
        <li>With a selection, <b>tap a pond/dirt hole</b> (or use 💧🟤♻️ buttons) to gather. Loads go to the <b>mud pit</b>.</li>
        <li><b>${SPAWN_COST} dirt + ${SPAWN_COST} water</b> at the pit auto-creates a new mud person.</li>
        <li>🌧 <b>Rain melts</b> mud people → revive the puddle with <b>dirt</b>. ☀️ <b>Sun dries</b> them → revive with <b>water</b>. Tap a fallen friend or use ✨.</li>
        <li>⛺ <b>Huts</b> (cost ${HUT_COST}+${HUT_COST}) shelter 5 each. Rain damages unfinished huts. 🏠 In / 🚪 Out to shelter &amp; release.</li>
        <li>Watch the <b>forecast</b> (top right) — the warning flash gives you a head start.</li>
        <li>Reach each level's population (and hut) goal to advance. Endless procedurally generated levels!</li>
      </ul>
      <p class="sub">Coming later: frogs &amp; turtles, torches to steer the weather, sticks, flowers &amp; beauty score, drying ponds.</p>
      <button id="b-back">← Back</button>
    `);
    this.bind('b-back', back);
  }

  showPause() {
    const muted = isMuted();
    this.screen(`
      <h2>⏸ Paused</h2>
      <button id="b-resume">▶️ Resume</button>
      <button id="b-restart" class="secondary">🔁 Restart level</button>
      <button id="b-howto2" class="secondary">📖 How to play</button>
      <button id="b-mute" class="secondary">${muted ? '🔊 Unmute' : '🔇 Mute'} sound</button>
      <button id="b-quit" class="secondary">🏠 Main menu</button>
    `);
    this.bind('b-resume', () => this.hideScreen());
    this.bind('b-restart', () => this.game.startLevel(this.game.world.level));
    this.bind('b-howto2', () => this.showHowto(() => this.showPause()));
    this.bind('b-mute', () => { setMuted(!isMuted()); this.showPause(); });
    this.bind('b-quit', () => this.showTitle());
  }

  showWin() {
    const w = this.game.world;
    const mins = Math.floor(w.time / 60), secs = Math.floor(w.time % 60);
    const next = w.level + 1;
    store({ ...loadSave(), level: next });
    this.screen(`
      <h2>🎉 Level ${w.level} complete!</h2>
      <div class="stats">
        <span>⏱ ${mins}:${String(secs).padStart(2, '0')}</span>
        <span>🧑 ${w.population}</span>
        <span>🌱 +${w.spawnedCount}</span>
        <span>😢 ${w.lostCount}</span>
      </div>
      <p class="sub">${w.lostCount === 0 ? 'Nobody melted — perfectly tended mud! 🌟' : 'Your mud people thank you.'}</p>
      <button id="b-next">➡️ Level ${next}</button>
      <button id="b-menu" class="secondary">🏠 Main menu</button>
    `);
    this.bind('b-next', () => this.game.startLevel(next));
    this.bind('b-menu', () => this.showTitle());
  }

  showLose() {
    const w = this.game.world;
    this.screen(`
      <h2>😢 Everyone melted away…</h2>
      <p class="sub">The pit lies still. But mud always finds a way.</p>
      <button id="b-retry">🔁 Try level ${w.level} again</button>
      <button id="b-menu2" class="secondary">🏠 Main menu</button>
    `);
    this.bind('b-retry', () => this.game.startLevel(w.level));
    this.bind('b-menu2', () => this.showTitle());
  }
}
