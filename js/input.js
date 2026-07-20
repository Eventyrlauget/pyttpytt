import { clamp, dist } from './util.js';
import { ZOOM_MIN, ZOOM_MAX } from './const.js';
import { sfx, unlock } from './audio.js';

const TAP_MS = 280;
const TAP_SLOP = 10;
const HOLD_MS = 320;

export class Input {
  constructor(canvas, minimap, game) {
    this.canvas = canvas;
    this.game = game;
    this.pointers = new Map();
    this.mode = null;         // 'pan' | 'box' | 'pinch'
    this.selBox = null;       // world coords {x0,y0,x1,y1}
    this.pointerWorld = null; // last pointer pos in world coords
    this.holdTimer = null;

    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.cancel(e));
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const cam = game.cam;
      const factor = Math.exp(-e.deltaY * 0.0015);
      cam.zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      cam.clampView();
    }, { passive: false });
    canvas.addEventListener('contextmenu', e => {
      // desktop convenience: right-click = command (like the original)
      e.preventDefault();
      const w = game.cam.toWorld(e.clientX, e.clientY);
      game.world.tapCommand(w.x, w.y);
    });

    minimap.addEventListener('pointerdown', e => {
      e.preventDefault();
      const r = minimap.getBoundingClientRect();
      const cam = game.cam;
      cam.x = (e.clientX - r.left) / r.width * game.world.w;
      cam.y = (e.clientY - r.top) / r.height * game.world.h;
      cam.clampView();
    });
    minimap.addEventListener('pointermove', e => {
      if (e.buttons) {
        const r = minimap.getBoundingClientRect();
        const cam = game.cam;
        cam.x = (e.clientX - r.left) / r.width * game.world.w;
        cam.y = (e.clientY - r.top) / r.height * game.world.h;
        cam.clampView();
      }
    });
  }

  down(e) {
    unlock();
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 2) {
      this.clearHold();
      this.mode = 'pinch';
      this.selBox = null;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = dist(a.x, a.y, b.x, b.y);
      this.pinchZoom = this.game.cam.zoom;
    } else if (this.pointers.size === 1) {
      this.mode = null;
      // long-press starts box select
      this.holdTimer = setTimeout(() => {
        if (this.pointers.size === 1 && !this.mode) {
          this.mode = 'box';
          const w = this.game.cam.toWorld(e.clientX, e.clientY);
          this.selBox = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
          if (navigator.vibrate) navigator.vibrate(10);
          sfx.select();
        }
      }, HOLD_MS);
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      const w = this.game.cam.toWorld(e.clientX, e.clientY);
      this.pointerWorld = w;
      return;
    }
    const cam = this.game.cam;
    const px = p.x, py = p.y;
    p.x = e.clientX; p.y = e.clientY;
    this.pointerWorld = cam.toWorld(e.clientX, e.clientY);

    if (this.mode === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = dist(a.x, a.y, b.x, b.y);
      cam.zoom = clamp(this.pinchZoom * (d / this.pinchDist), ZOOM_MIN, ZOOM_MAX);
      cam.clampView();
      return;
    }
    if (this.mode === 'box') {
      const w = cam.toWorld(e.clientX, e.clientY);
      this.selBox.x1 = w.x; this.selBox.y1 = w.y;
      return;
    }
    if (!this.mode && dist(p.sx, p.sy, e.clientX, e.clientY) > TAP_SLOP) {
      this.clearHold();
      this.mode = 'pan';
    }
    if (this.mode === 'pan') {
      cam.x -= (e.clientX - px) / cam.zoom;
      cam.y -= (e.clientY - py) / cam.zoom;
      cam.clampView();
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.clearHold();
    if (!p) return;

    if (this.mode === 'pinch') {
      if (this.pointers.size < 2) this.mode = this.pointers.size ? 'pan' : null;
      return;
    }
    if (this.mode === 'box') {
      if (this.pointers.size === 0) {
        this.finishBox(e.shiftKey);
        this.mode = null;
      }
      return;
    }
    const wasTap = this.mode === null
      && performance.now() - p.t < TAP_MS
      && dist(p.sx, p.sy, e.clientX, e.clientY) <= TAP_SLOP;
    this.mode = null;
    if (wasTap) this.tap(e);
  }

  cancel(e) {
    this.pointers.delete(e.pointerId);
    this.clearHold();
    this.mode = null;
    this.selBox = null;
  }

  clearHold() {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
  }

  finishBox(additive) {
    const world = this.game.world;
    const b = this.selBox;
    this.selBox = null;
    if (!b) return;
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    if (!additive) world.selected.clear();
    let n = 0;
    for (const p of world.people) {
      if (!p.alive || p.inHut) continue;
      if (p.x >= x0 - 8 && p.x <= x1 + 8 && p.y >= y0 - 8 && p.y <= y1 + 8) {
        world.selected.add(p); n++;
      }
    }
    if (n) sfx.select();
    this.game.ui.refreshActions();
  }

  tap(e) {
    const game = this.game;
    const world = game.world;
    const w = game.cam.toWorld(e.clientX, e.clientY);

    if (game.ui.buildArmed) {
      game.ui.buildArmed = false;
      game.ui.refreshActions();
      world.cmdBuildAt(w.x, w.y);
      return;
    }

    const person = world.pickPerson(w.x, w.y);
    if (person && person.alive) {
      if (!e.shiftKey) world.selected.clear();
      if (world.selected.has(person)) world.selected.delete(person);
      else world.selected.add(person);
      sfx.select();
      game.ui.refreshActions();
      return;
    }
    // downed person, landmark, or ground → context command (if any selection)
    if (world.selected.size) {
      world.tapCommand(w.x, w.y);
      game.ui.refreshActions();
    } else if (person) {
      // tapped a downed person with nothing selected: helpful toast
      world.emit(person.state === 'melted'
        ? 'Select someone, then tap the puddle to revive with dirt 🟤'
        : 'Select someone, then tap the statue to revive with water 💧');
    }
  }
}
