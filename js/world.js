import {
  WORLD_W, WORLD_H, SPAWN_COST, HUT_COST, HUT_BUILD_WORK, HUT_CAPACITY,
  HUT_RAIN_DAMAGE, PERSON_R, levelParams,
} from './const.js';
import { mulberry32, randIn, dist, nearest, clamp } from './util.js';
import { Person } from './person.js';
import { sfx } from './audio.js';

let nextHutId = 1;

export class World {
  constructor(level) {
    this.params = levelParams(level);
    this.level = level;
    const rng = mulberry32(this.params.seed);
    this.rng = rng;

    this.w = WORLD_W; this.h = WORLD_H;
    this.time = 0;
    this.people = [];
    this.huts = [];
    this.selected = new Set();
    this.stock = { dirt: this.params.startStock, water: this.params.startStock };
    this.spawnedCount = 0;
    this.lostCount = 0;       // melt/dry events (Life metric)
    this.status = 'playing';  // 'playing' | 'won' | 'lost'
    this.events = [];         // transient messages for UI {text, kind}
    this.lastEventPos = null;

    // --- landmarks ---
    const cx = this.w / 2 + randIn(rng, -80, 80);
    const cy = this.h / 2 + randIn(rng, -60, 60);
    this.mudpit = { kind: 'mudpit', x: cx, y: cy, r: 58, slotX: 0, slotY: 66 };

    const placed = [this.mudpit];
    const place = (kind, r, dMin, dMax) => {
      for (let tries = 0; tries < 60; tries++) {
        const a = rng() * Math.PI * 2;
        const d = randIn(rng, dMin, dMax);
        const x = clamp(cx + Math.cos(a) * d, 90, this.w - 90);
        const y = clamp(cy + Math.sin(a) * d * 0.75, 90, this.h - 90);
        if (placed.every(p => dist(x, y, p.x, p.y) > p.r + r + 55)) {
          const lm = { kind, x, y, r, slotX: 0, slotY: r + 10, phase: rng() * 6.28 };
          placed.push(lm);
          return lm;
        }
      }
      return null;
    };
    this.dirtholes = [];
    this.ponds = [];
    for (let i = 0; i < this.params.dirtholes; i++) {
      const lm = place('dirthole', 30, 170, 430);
      if (lm) this.dirtholes.push(lm);
    }
    for (let i = 0; i < this.params.ponds; i++) {
      const lm = place('pond', 42, 170, 480);
      if (lm) this.ponds.push(lm);
    }

    // decorative scatter (grass, pebbles, sprouts)
    this.deco = [];
    for (let i = 0; i < 90; i++) {
      const x = randIn(rng, 20, this.w - 20), y = randIn(rng, 20, this.h - 20);
      if (placed.some(p => dist(x, y, p.x, p.y) < p.r + 26)) continue;
      this.deco.push({ x, y, t: rng() < 0.62 ? 'grass' : rng() < 0.5 ? 'pebble' : 'flower', v: rng() });
    }

    // starting people around the pit
    for (let i = 0; i < this.params.startPeople; i++) {
      const a = (i / this.params.startPeople) * Math.PI * 2 + 0.6;
      this.people.push(new Person(cx + Math.cos(a) * 95, cy + Math.sin(a) * 75));
    }

    // --- weather ---
    this.weather = { state: 'clear', timer: randIn(rng, this.params.clearMin, this.params.clearMax) + 6, next: null };
    this.wrng = mulberry32(this.params.seed ^ 0xbeef);
  }

  personById(id) { return this.people.find(p => p.id === id); }
  get population() { return this.people.filter(p => p.alive).length; }
  get downed() { return this.people.filter(p => !p.alive); }
  get completedHuts() { return this.huts.filter(h => h.complete && !h.dead); }

  emit(text, kind = 'info') { this.events.push({ text, kind }); }

  deposit(res, amt) {
    if (res) this.stock[res] += amt;
  }

  onRevived(person) {
    this.lastEventPos = { x: person.x, y: person.y };
    sfx.revive();
    this.emit('✨ A mud friend is back on their feet!');
  }

  // ---------- commands (from input/UI) ----------
  sel() { return [...this.selected].filter(p => p.alive && !p.inHut); }

  cmdMove(x, y) {
    const ps = this.sel();
    ps.forEach((p, i) => {
      const a = (i / Math.max(1, ps.length)) * Math.PI * 2;
      const r = i === 0 ? 0 : 14 + 8 * Math.floor(i / 6);
      p.moveTo(clamp(x + Math.cos(a) * r, 15, this.w - 15), clamp(y + Math.sin(a) * r, 15, this.h - 15));
    });
    if (ps.length) sfx.command();
  }

  cmdGather(res) {
    const ps = this.sel();
    ps.forEach(p => p.gather(res));
    if (ps.length) sfx.command();
  }

  cmdStop() { this.sel().forEach(p => p.stop()); }

  cmdRevive(target = null) {
    const ps = this.sel();
    if (!ps.length) return;
    const downed = this.downed;
    if (!downed.length) { this.emit('No one needs reviving 🙂'); return; }
    let ok = false;
    ps.forEach(p => {
      const t = target || nearest(p.x, p.y, downed);
      if (t) { p.revive(t); ok = true; }
    });
    if (ok) sfx.command();
  }

  cmdBuildAt(x, y) {
    if (this.stock.dirt < HUT_COST || this.stock.water < HUT_COST) {
      this.emit(`Needs ${HUT_COST} 🟤 + ${HUT_COST} 💧 at the mud pit`, 'warn');
      sfx.deny();
      return false;
    }
    const blockers = [this.mudpit, ...this.dirtholes, ...this.ponds, ...this.huts];
    if (blockers.some(b => dist(x, y, b.x, b.y) < (b.r || 34) + 40)) {
      this.emit('Too close to something — pick open ground', 'warn');
      sfx.deny();
      return false;
    }
    this.stock.dirt -= HUT_COST;
    this.stock.water -= HUT_COST;
    const hut = {
      id: nextHutId++, kind: 'hut', x, y, r: 34,
      progress: 0, complete: false, dead: false,
      workThisFrame: 0, occupants: [], capacity: HUT_CAPACITY,
    };
    this.huts.push(hut);
    this.sel().forEach(p => p.build(hut));
    sfx.command();
    return true;
  }

  cmdEnter(hut = null) {
    const ps = this.sel();
    if (!ps.length) return;
    let assigned = 0;
    const space = h => h.complete && !h.dead && (h.occupants.length + h.pending) < h.capacity;
    this.huts.forEach(h => h.pending = 0);
    ps.forEach(p => {
      let h = hut && (hut.occupants.length + hut.pending) < hut.capacity && hut.complete ? hut
        : nearest(p.x, p.y, this.huts, space);
      if (h) { h.pending++; p.enter(h); assigned++; }
    });
    if (!assigned) { this.emit('No hut space — build more huts ⛺', 'warn'); sfx.deny(); }
    else sfx.command();
  }

  cmdExitAll() {
    let n = 0;
    this.huts.forEach(h => {
      h.occupants.forEach(p => {
        p.inHut = null;
        p.x = h.x + randIn(Math.random, -1, 1) * 24;
        p.y = h.y + 30 + Math.random() * 14;
        n++;
      });
      h.occupants = [];
    });
    if (n) sfx.command();
  }

  selectIdle() {
    const idle = this.people.find(p => p.alive && !p.inHut && !p.busy);
    this.selected.clear();
    if (idle) { this.selected.add(idle); sfx.select(); return idle; }
    this.emit('Nobody is idle — good work!');
    return null;
  }

  selectAll() {
    this.selected.clear();
    this.people.forEach(p => { if (p.alive && !p.inHut) this.selected.add(p); });
    if (this.selected.size) sfx.select();
  }

  pickPerson(x, y) {
    let best = null, bd = 26;
    for (const p of this.people) {
      if (p.inHut) continue;
      const d = dist(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  pickLandmark(x, y) {
    for (const h of this.huts) if (!h.dead && dist(x, y, h.x, h.y) < h.r + 14) return h;
    for (const p of this.ponds) if (dist(x, y, p.x, p.y) < p.r + 14) return p;
    for (const d of this.dirtholes) if (dist(x, y, d.x, d.y) < d.r + 14) return d;
    if (dist(x, y, this.mudpit.x, this.mudpit.y) < this.mudpit.r + 16) return this.mudpit;
    return null;
  }

  // Context command: selection + tapped point
  tapCommand(x, y) {
    const ps = this.sel();
    if (!ps.length) return false;
    const person = this.pickPerson(x, y);
    if (person && !person.alive) { this.cmdRevive(person); return true; }
    const lm = this.pickLandmark(x, y);
    if (lm) {
      if (lm.kind === 'pond') { ps.forEach(p => p.gather('water')); sfx.command(); return true; }
      if (lm.kind === 'dirthole') { ps.forEach(p => p.gather('dirt')); sfx.command(); return true; }
      if (lm.kind === 'mudpit') { ps.forEach(p => p.gather('both')); sfx.command(); return true; }
      if (lm.kind === 'hut') {
        if (lm.complete) this.cmdEnter(lm);
        else { ps.forEach(p => p.build(lm)); sfx.command(); }
        return true;
      }
    }
    this.cmdMove(x, y);
    return true;
  }

  // ---------- simulation ----------
  update(dt) {
    if (this.status !== 'playing') return;
    this.time += dt;

    // weather machine
    const W = this.weather, P = this.params;
    W.timer -= dt;
    if (W.timer <= 0) {
      if (W.state === 'clear') {
        W.state = 'warning';
        W.next = this.wrng() < 0.5 ? 'rain' : 'sun';
        W.timer = P.warnTime;
        sfx.warn();
      } else if (W.state === 'warning') {
        W.state = W.next;
        W.timer = randIn(this.wrng, P.eventMin, P.eventMax);
        if (W.state === 'rain') {
          sfx.rain();
          this.emit('🌧 Rain! Get inside or get melted!', 'warn');
          this.huts.forEach(h => {
            if (!h.complete && !h.dead) h.progress = Math.max(0, h.progress - HUT_RAIN_DAMAGE);
          });
        } else {
          sfx.sun();
          this.emit('☀️ Scorching sun! Mud dries out!', 'warn');
        }
      } else {
        W.state = 'clear';
        W.timer = randIn(this.wrng, P.clearMin, P.clearMax);
      }
    }

    // exposure — carrying the opposite resource shields you:
    // water keeps you cool in the sun, a load of dirt keeps you from melting in rain.
    for (const p of this.people) {
      if (!p.alive || p.inHut) continue;
      if (W.state === 'rain') {
        if (p.carrying === 'dirt') {
          p.wet = Math.max(0, p.wet - dt);
          continue;
        }
        p.wet += dt;
        p.dry = Math.max(0, p.dry - dt * 2);
        if (p.wet >= P.exposureTol) {
          p.melt('melted');
          this.selected.delete(p);
          this.lostCount++;
          this.lastEventPos = { x: p.x, y: p.y };
          sfx.melt();
          this.emit('😢 A mud person melted! Revive with dirt ✨', 'bad');
        }
      } else if (W.state === 'sun') {
        if (p.carrying === 'water') {
          p.dry = Math.max(0, p.dry - dt);
          continue;
        }
        p.dry += dt;
        p.wet = Math.max(0, p.wet - dt * 2);
        if (p.dry >= P.exposureTol) {
          p.melt('dried');
          this.selected.delete(p);
          this.lostCount++;
          this.lastEventPos = { x: p.x, y: p.y };
          sfx.melt();
          this.emit('😢 A mud person dried out! Revive with water ✨', 'bad');
        }
      } else {
        p.wet = Math.max(0, p.wet - dt * 1.5);
        p.dry = Math.max(0, p.dry - dt * 1.5);
      }
    }

    // people
    for (const p of this.people) p.update(dt, this);

    // huts
    for (const h of this.huts) {
      if (h.workThisFrame > 0 && !h.complete) {
        h.progress += h.workThisFrame / HUT_BUILD_WORK;
        h.workThisFrame = 0;
        if (h.progress >= 1) {
          h.progress = 1; h.complete = true;
          sfx.hutDone();
          this.emit('⛺ Hut complete! It shelters 5 mud people.');
          this.people.forEach(p => { if (p.task?.type === 'build' && p.task.hut === h) p.task = null; });
        }
      }
      h.workThisFrame = 0;
    }

    // spawn
    if (this.stock.dirt >= SPAWN_COST && this.stock.water >= SPAWN_COST) {
      this.stock.dirt -= SPAWN_COST;
      this.stock.water -= SPAWN_COST;
      const a = Math.random() * Math.PI * 2;
      const np = new Person(
        this.mudpit.x + Math.cos(a) * (this.mudpit.r + 18),
        this.mudpit.y + Math.sin(a) * (this.mudpit.r * 0.75 + 16),
      );
      np.speak = 2.5;
      this.people.push(np);
      this.spawnedCount++;
      this.lastEventPos = { x: np.x, y: np.y };
      sfx.spawn();
      this.emit('🎉 A new mud person emerges from the pit!');
    }

    // win / lose
    const alive = this.population;
    if (alive >= this.params.popTarget && this.completedHuts.length >= this.params.hutTarget) {
      this.status = 'won';
      sfx.win();
    } else if (alive === 0) {
      this.status = 'lost';
      sfx.lose();
    }
  }
}
