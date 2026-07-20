import { PERSON_SPEED, CARRY_AMOUNT, GATHER_TIME, REVIVE_TIME, REVIVE_COST } from './const.js';
import { dist, nearest } from './util.js';

let nextId = 1;

export class Person {
  constructor(x, y) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.state = 'ok';          // 'ok' | 'melted' | 'dried'
    this.carrying = null;       // 'dirt' | 'water'
    this.carryAmt = 0;
    this.wet = 0;               // seconds of rain exposure
    this.dry = 0;               // seconds of sun exposure
    this.inHut = null;          // hut ref while sheltering
    this.task = null;
    this.facing = 1;
    this.bob = Math.random() * Math.PI * 2;
    this.speak = 0;             // little "!" timer
  }

  get busy() { return !!this.task; }
  get alive() { return this.state === 'ok'; }

  stop() { this.task = null; }

  moveTo(x, y) { this.task = { type: 'move', x, y }; }

  gather(res) { // 'dirt' | 'water' | 'both'
    const first = res === 'both' ? (Math.random() < 0.5 ? 'dirt' : 'water') : res;
    this.task = { type: 'gather', mode: res, res: first, phase: 'toSource', timer: 0, target: null };
  }

  revive(target) {
    this.task = { type: 'revive', targetId: target.id, phase: 'start', timer: 0 };
  }

  build(hut) { this.task = { type: 'build', hut, phase: 'toSite' }; }

  enter(hut) { this.task = { type: 'enter', hut }; }

  melt(kind) { // kind: 'melted' | 'dried'
    this.state = kind;
    this.task = null;
    this.carrying = null; this.carryAmt = 0;
    this.wet = 0; this.dry = 0;
  }

  reviveNow() {
    this.state = 'ok';
    this.wet = 0; this.dry = 0;
    this.speak = 2;
  }

  _step(x, y, dt) {
    const d = dist(this.x, this.y, x, y);
    const step = PERSON_SPEED * dt;
    if (d <= Math.max(step, 5)) { this.x = x; this.y = y; return true; }
    const dx = (x - this.x) / d, dy = (y - this.y) / d;
    this.x += dx * step; this.y += dy * step;
    if (Math.abs(dx) > 0.1) this.facing = Math.sign(dx);
    return false;
  }

  update(dt, world) {
    if (this.speak > 0) this.speak -= dt;
    if (this.state !== 'ok' || this.inHut) return;
    this.bob += dt * (this.busy ? 9 : 3);
    const t = this.task;
    if (!t) return;

    if (t.type === 'move') {
      if (this._step(t.x, t.y, dt)) this.task = null;
      return;
    }

    if (t.type === 'gather') {
      if (t.phase === 'toSource') {
        if (!t.target || t.target.dead) {
          const pool = t.res === 'dirt' ? world.dirtholes : world.ponds;
          t.target = nearest(this.x, this.y, pool);
          if (!t.target) { this.task = null; return; }
        }
        if (this._step(t.target.x + t.target.slotX, t.target.y + t.target.slotY, dt)) {
          t.phase = 'working'; t.timer = 0;
        }
      } else if (t.phase === 'working') {
        t.timer += dt;
        if (t.timer >= GATHER_TIME) {
          this.carrying = t.res;
          this.carryAmt = CARRY_AMOUNT;
          t.phase = 'toPit';
        }
      } else if (t.phase === 'toPit') {
        const p = world.mudpit;
        if (this._step(p.x + p.slotX, p.y + p.slotY, dt)) {
          world.deposit(this.carrying, this.carryAmt);
          this.carrying = null; this.carryAmt = 0;
          if (t.mode === 'both') t.res = t.res === 'dirt' ? 'water' : 'dirt';
          t.phase = 'toSource'; t.target = null;
        }
      }
      return;
    }

    if (t.type === 'revive') {
      const target = world.personById(t.targetId);
      if (!target || target.state === 'ok') { this.task = null; return; }
      const need = target.state === 'melted' ? 'dirt' : 'water';
      if (t.phase === 'start') {
        t.phase = (this.carrying === need && this.carryAmt >= REVIVE_COST) ? 'toTarget' : 'toSource';
        t.target = null;
      }
      if (t.phase === 'toSource') {
        if (!t.target) {
          const pool = need === 'dirt' ? world.dirtholes : world.ponds;
          t.target = nearest(this.x, this.y, pool);
          if (!t.target) { this.task = null; return; }
        }
        if (this._step(t.target.x + t.target.slotX, t.target.y + t.target.slotY, dt)) {
          t.phase = 'working'; t.timer = 0;
        }
      } else if (t.phase === 'working') {
        t.timer += dt;
        if (t.timer >= GATHER_TIME) {
          this.carrying = need; this.carryAmt = REVIVE_COST;
          t.phase = 'toTarget';
        }
      } else if (t.phase === 'toTarget') {
        if (this._step(target.x + 16, target.y, dt)) { t.phase = 'reviving'; t.timer = 0; }
      } else if (t.phase === 'reviving') {
        t.timer += dt;
        if (t.timer >= REVIVE_TIME) {
          this.carrying = null; this.carryAmt = 0;
          target.reviveNow();
          world.onRevived(target);
          this.task = null;
        }
      }
      return;
    }

    if (t.type === 'build') {
      const hut = t.hut;
      if (hut.dead || hut.complete) { this.task = null; return; }
      if (t.phase === 'toSite') {
        const a = (this.id % 8) / 8 * Math.PI * 2;
        if (this._step(hut.x + Math.cos(a) * 30, hut.y + Math.sin(a) * 22, dt)) t.phase = 'working';
      } else {
        hut.workThisFrame += dt;
      }
      return;
    }

    if (t.type === 'enter') {
      const hut = t.hut;
      if (hut.dead || !hut.complete || hut.occupants.length >= hut.capacity) { this.task = null; return; }
      if (this._step(hut.x, hut.y + 26, dt)) {
        hut.occupants.push(this);
        this.inHut = hut;
        this.task = null;
      }
      return;
    }
  }
}
