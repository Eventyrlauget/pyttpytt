import { World } from './world.js';
import { Camera, Renderer } from './render.js';
import { Input } from './input.js';
import { UI, loadSave, store } from './ui.js';

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');

const game = {
  world: null,
  cam: null,
  paused: true,
  ui: null,
  startLevel(n) {
    this.world = new World(n);
    this.cam = new Camera(this.world, canvas.clientWidth, canvas.clientHeight);
    this.ui.hintIndex = 0;
    this.ui.buildArmed = false;
    this.ui.hideScreen();
    this.ui.refreshActions();
    store({ ...loadSave(), level: Math.max(loadSave().level || 1, n) });
  },
};

const renderer = new Renderer(canvas, minimap);
game.ui = new UI(game);
const input = new Input(canvas, minimap, game);

function resize() {
  renderer.resize();
  if (game.cam) game.cam.resize(canvas.clientWidth, canvas.clientHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

// boot world so something pretty is behind the title screen
game.world = new World(loadSave().level || 1);
game.cam = new Camera(game.world, canvas.clientWidth, canvas.clientHeight);
game.ui.showTitle();

let last = performance.now();
let ended = false;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const w = game.world;

  if (!game.paused && w.status === 'playing') {
    w.update(dt);
    ended = false;
  }
  if (w.status !== 'playing' && !game.paused && !ended) {
    ended = true;
    setTimeout(() => {
      if (w.status === 'won') game.ui.showWin();
      else if (w.status === 'lost') game.ui.showLose();
    }, 900);
  }

  game.ui.pointerWorld = input.pointerWorld;
  game.ui.selBox = input.selBox;
  renderer.draw(w, game.cam, dt, game.ui);
  game.ui.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// pause when backgrounded (also keeps the sim honest on iOS)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.world?.status === 'playing' && !game.paused) {
    game.ui.showPause();
  }
  last = performance.now();
});

// keyboard shortcuts (desktop nicety, mirrors the original where sensible)
window.addEventListener('keydown', e => {
  if (game.paused) return;
  const w = game.world;
  const k = e.key.toLowerCase();
  if (k === 's') w.cmdStop();
  else if (k === 'd') w.cmdGather('dirt');
  else if (k === 'w') w.cmdGather('water');
  else if (k === 'g') w.cmdGather('both');
  else if (k === 'r') w.cmdRevive();
  else if (k === 'h') w.cmdEnter();
  else if (k === 'x') w.cmdExitAll();
  else if (k === 'f') game.ui.action('build');
  else if (k === 'i') game.ui.action('idle');
  else if (k === 'a') w.selectAll();
  else if (k === 'enter') { game.cam.x = w.mudpit.x; game.cam.y = w.mudpit.y; game.cam.clampView(); }
  else if (k === ' ' && w.lastEventPos) { game.cam.x = w.lastEventPos.x; game.cam.y = w.lastEventPos.y; game.cam.clampView(); e.preventDefault(); }
  else return;
  game.ui.refreshActions();
});

window.__game = game; // debug/testing handle

// PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
