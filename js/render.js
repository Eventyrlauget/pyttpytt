import { PERSON_R, ZOOM_MIN, ZOOM_MAX } from './const.js';
import { clamp } from './util.js';

export class Camera {
  constructor(world, vw, vh) {
    this.world = world;
    this.x = world.mudpit.x;
    this.y = world.mudpit.y;
    this.zoom = 1;
    this.vw = vw; this.vh = vh;
  }
  resize(vw, vh) { this.vw = vw; this.vh = vh; this.clampView(); }
  clampView() {
    this.zoom = clamp(this.zoom, ZOOM_MIN, ZOOM_MAX);
    const hw = this.vw / 2 / this.zoom, hh = this.vh / 2 / this.zoom;
    this.x = clamp(this.x, Math.min(hw, this.world.w / 2), Math.max(this.world.w - hw, this.world.w / 2));
    this.y = clamp(this.y, Math.min(hh, this.world.h / 2), Math.max(this.world.h - hh, this.world.h / 2));
  }
  toWorld(sx, sy) {
    return {
      x: this.x + (sx - this.vw / 2) / this.zoom,
      y: this.y + (sy - this.vh / 2) / this.zoom,
    };
  }
}

export class Renderer {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mini = minimap;
    this.mctx = minimap.getContext('2d');
    this.t = 0;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    const mdpr = 2;
    this.mini.width = 120 * mdpr; this.mini.height = 80 * mdpr;
  }

  draw(world, cam, dt, ui) {
    this.t += dt;
    const ctx = this.ctx, t = this.t;
    const dpr = this.dpr, z = cam.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // ground
    ctx.fillStyle = '#79b356';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(z * dpr, 0, 0, z * dpr, (cam.vw / 2 - cam.x * z) * dpr, (cam.vh / 2 - cam.y * z) * dpr);

    // world bounds
    ctx.fillStyle = '#84bd60';
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.strokeStyle = '#5d9440';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, world.w, world.h);

    // deco
    for (const d of world.deco) {
      if (d.t === 'grass') {
        ctx.strokeStyle = '#4f8a38';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(d.x + i * 3, d.y);
          ctx.lineTo(d.x + i * 4 + Math.sin(t * 1.5 + d.v * 9) * 1.5, d.y - 7 - (i === 0 ? 3 : 0));
        }
        ctx.stroke();
      } else if (d.t === 'pebble') {
        ctx.fillStyle = '#9aa08f';
        ctx.beginPath(); ctx.ellipse(d.x, d.y, 4.5, 3, d.v, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = '#4f8a38';
        ctx.fillRect(d.x - 0.8, d.y - 6, 1.6, 6);
        ctx.fillStyle = d.v < 0.5 ? '#ff8fa3' : '#ffd166';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * 6.28 + d.v;
          ctx.beginPath(); ctx.arc(d.x + Math.cos(a) * 3, d.y - 6 + Math.sin(a) * 3, 2.2, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#fff6e8';
        ctx.beginPath(); ctx.arc(d.x, d.y - 6, 1.6, 0, 7); ctx.fill();
      }
    }

    // ponds
    for (const p of world.ponds) {
      ctx.fillStyle = '#3f7fb8';
      this.blob(ctx, p.x, p.y + 3, p.r * 1.05, p.r * 0.72, p.phase);
      ctx.fill();
      ctx.fillStyle = '#5aa7e0';
      this.blob(ctx, p.x, p.y, p.r, p.r * 0.68, p.phase);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.2, p.y - p.r * 0.12, p.r * 0.45, Math.PI * 0.9 + Math.sin(t + p.phase) * 0.15, Math.PI * 1.5);
      ctx.stroke();
    }

    // dirtholes
    for (const d of world.dirtholes) {
      ctx.fillStyle = '#7a4f26';
      this.blob(ctx, d.x, d.y, d.r * 1.15, d.r * 0.8, d.phase);
      ctx.fill();
      ctx.fillStyle = '#4a2d12';
      ctx.beginPath(); ctx.ellipse(d.x, d.y + 2, d.r * 0.62, d.r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a5a2b';
      ctx.beginPath(); ctx.ellipse(d.x - d.r * 0.55, d.y - d.r * 0.42, d.r * 0.32, d.r * 0.2, -0.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(d.x + d.r * 0.5, d.y - d.r * 0.35, d.r * 0.26, d.r * 0.17, 0.4, 0, 7); ctx.fill();
    }

    // mudpit
    {
      const m = world.mudpit;
      ctx.fillStyle = '#6b4322';
      ctx.beginPath(); ctx.ellipse(m.x, m.y + 4, m.r * 1.12, m.r * 0.78, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#54331a';
      ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r, m.r * 0.68, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6d4423';
      for (let i = 0; i < 4; i++) {
        const bt = (t * 0.7 + i * 1.7) % 3;
        const br = 3 + bt * 3;
        const a = i * 2.1;
        if (bt < 2.4) {
          ctx.globalAlpha = 1 - bt / 2.6;
          ctx.beginPath();
          ctx.arc(m.x + Math.cos(a) * m.r * 0.4, m.y + Math.sin(a) * m.r * 0.25, br, 0, 7);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // spawn progress ring
      const prog = Math.min(world.stock.dirt / 15, 1) * 0.5 + Math.min(world.stock.water / 15, 1) * 0.5;
      if (prog > 0 && prog < 1) {
        ctx.strokeStyle = 'rgba(255,207,92,.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, m.r + 10, m.r * 0.68 + 10, 0, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        ctx.stroke();
      }
    }

    // huts
    for (const h of world.huts) {
      if (h.dead) continue;
      const stage = h.complete ? 3 : h.progress < 0.34 ? 1 : h.progress < 0.75 ? 2 : 3;
      ctx.fillStyle = 'rgba(0,0,0,.13)';
      ctx.beginPath(); ctx.ellipse(h.x, h.y + h.r * 0.62, h.r * 1.05, h.r * 0.32, 0, 0, 7); ctx.fill();
      if (stage === 1) {
        ctx.fillStyle = '#8a5a2b';
        ctx.beginPath(); ctx.ellipse(h.x, h.y + h.r * 0.35, h.r * 0.85, h.r * 0.38, 0, Math.PI, 0); ctx.fill();
      } else {
        const hh = stage === 2 ? h.r * 0.75 : h.r * 1.15;
        ctx.fillStyle = '#96622f';
        ctx.beginPath();
        ctx.moveTo(h.x - h.r * 0.9, h.y + h.r * 0.55);
        ctx.quadraticCurveTo(h.x - h.r * 0.95, h.y + h.r * 0.55 - hh, h.x, h.y + h.r * 0.5 - hh);
        ctx.quadraticCurveTo(h.x + h.r * 0.95, h.y + h.r * 0.55 - hh, h.x + h.r * 0.9, h.y + h.r * 0.55);
        ctx.closePath(); ctx.fill();
        if (stage === 3 && h.complete) {
          ctx.strokeStyle = 'rgba(74,45,18,.5)';
          ctx.lineWidth = 2;
          for (let i = 1; i <= 2; i++) {
            ctx.beginPath();
            ctx.arc(h.x, h.y + h.r * 0.55 - hh * 0.1, hh * 0.36 * i, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          }
          ctx.fillStyle = '#4a2d12';
          ctx.beginPath();
          ctx.ellipse(h.x, h.y + h.r * 0.5, h.r * 0.3, h.r * 0.42, 0, Math.PI, 0, true);
          ctx.fill();
        }
      }
      if (!h.complete) {
        ctx.fillStyle = 'rgba(70,45,18,.75)';
        ctx.fillRect(h.x - 22, h.y - h.r - 16, 44, 7);
        ctx.fillStyle = '#ffcf5c';
        ctx.fillRect(h.x - 20, h.y - h.r - 14.5, 40 * h.progress, 4);
      } else if (h.occupants.length) {
        ctx.fillStyle = 'rgba(70,45,18,.85)';
        ctx.beginPath(); ctx.arc(h.x + h.r * 0.7, h.y - h.r * 0.8, 11, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff6e8';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(h.occupants.length), h.x + h.r * 0.7, h.y - h.r * 0.8 + 0.5);
      }
    }

    // people (y-sorted)
    const people = [...world.people].filter(p => !p.inHut).sort((a, b) => a.y - b.y);
    for (const p of people) this.person(ctx, p, world, t);

    // build placement ghost
    if (ui.buildArmed && ui.pointerWorld) {
      const g = ui.pointerWorld;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#96622f';
      ctx.beginPath(); ctx.ellipse(g.x, g.y + 10, 32, 14, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffcf5c';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(g.x, g.y, 40, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }

    // selection box
    if (ui.selBox) {
      const b = ui.selBox;
      ctx.strokeStyle = '#ffcf5c';
      ctx.fillStyle = 'rgba(255,207,92,.14)';
      ctx.lineWidth = 2 / z;
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
      ctx.fillRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.strokeRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }

    // weather overlay (screen space)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = world.weather;
    if (W.state === 'rain') {
      ctx.fillStyle = 'rgba(30,50,90,.22)';
      ctx.fillRect(0, 0, cam.vw, cam.vh);
      ctx.strokeStyle = 'rgba(180,210,255,.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 60; i++) {
        const rx = ((i * 127.3 + t * 260) % (cam.vw + 40)) - 20;
        const ry = ((i * 61.7 + t * 540) % (cam.vh + 40)) - 20;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + 11);
      }
      ctx.stroke();
    } else if (W.state === 'sun') {
      const pulse = 0.13 + Math.sin(t * 2.2) * 0.04;
      ctx.fillStyle = `rgba(255,190,60,${pulse})`;
      ctx.fillRect(0, 0, cam.vw, cam.vh);
      const grd = ctx.createRadialGradient(cam.vw - 40, 30, 6, cam.vw - 40, 30, 130);
      grd.addColorStop(0, 'rgba(255,230,130,.85)');
      grd.addColorStop(1, 'rgba(255,230,130,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(cam.vw - 190, -30, 220, 190);
    } else if (W.state === 'warning') {
      const blink = Math.sin(t * 8) > 0;
      if (blink) {
        ctx.fillStyle = W.next === 'rain' ? 'rgba(30,50,90,.08)' : 'rgba(255,190,60,.07)';
        ctx.fillRect(0, 0, cam.vw, cam.vh);
      }
    }

    this.drawMini(world, cam);
  }

  blob(ctx, x, y, rx, ry, phase) {
    ctx.beginPath();
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = 1 + 0.07 * Math.sin(a * 3 + phase);
      const px = x + Math.cos(a) * rx * w;
      const py = y + Math.sin(a) * ry * w;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  person(ctx, p, world, t) {
    const sel = world.selected.has(p);
    const r = PERSON_R;

    if (p.state === 'melted') {
      ctx.fillStyle = '#75492218';
      ctx.fillStyle = 'rgba(0,0,0,.1)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, r * 1.7, r * 0.75, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#7a4f26';
      this.blob(ctx, p.x, p.y + 2, r * 1.6, r * 0.62, p.id);
      ctx.fill();
      this.eyes(ctx, p.x, p.y - 1, 1, 0, true);
      if (sel) this.ring(ctx, p, t);
      return;
    }
    if (p.state === 'dried') {
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.8, r * 1.1, r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#b3906a';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 1.05, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7c5c39';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - r * 0.5, p.y - r * 0.5); ctx.lineTo(p.x - r * 0.1, p.y);
      ctx.lineTo(p.x - r * 0.4, p.y + r * 0.55);
      ctx.moveTo(p.x + r * 0.55, p.y - r * 0.3); ctx.lineTo(p.x + r * 0.15, p.y + r * 0.25);
      ctx.stroke();
      this.eyes(ctx, p.x, p.y - 3, 1, 0, true);
      if (sel) this.ring(ctx, p, t);
      return;
    }

    const bob = Math.sin(p.bob) * (p.busy ? 1.6 : 0.8);
    const y = p.y + bob;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.13)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.85, r * 0.95, r * 0.36, 0, 0, 7); ctx.fill();
    // body
    ctx.fillStyle = '#8a5a2b';
    ctx.beginPath();
    ctx.ellipse(p.x, y, r * (1 + Math.sin(p.bob * 2) * 0.03), r * 1.08, 0, 0, 7);
    ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255,235,200,.25)';
    ctx.beginPath(); ctx.ellipse(p.x - r * 0.3, y - r * 0.45, r * 0.4, r * 0.3, -0.5, 0, 7); ctx.fill();
    // face
    this.eyes(ctx, p.x, y - 3, p.facing, p.busy ? Math.sin(t * 6) * 0.5 : 0, false);
    ctx.strokeStyle = '#3d2810';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x + p.facing * 1, y + 3.6, 3, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();

    // carried item
    if (p.carrying) {
      const cy = y - r * 1.6 + Math.sin(t * 5 + p.id) * 0.8;
      if (p.carrying === 'water') {
        ctx.fillStyle = '#5aa7e0';
        ctx.beginPath();
        ctx.moveTo(p.x, cy - 7);
        ctx.quadraticCurveTo(p.x + 6, cy + 1, p.x, cy + 5);
        ctx.quadraticCurveTo(p.x - 6, cy + 1, p.x, cy - 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.beginPath(); ctx.arc(p.x - 1.5, cy, 1.4, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = '#6b4322';
        this.blob(ctx, p.x, cy, 6, 5, p.id * 2);
        ctx.fill();
      }
    }

    // exposure meter
    const meter = Math.max(p.wet, p.dry) / world.params.exposureTol;
    if (meter > 0.15) {
      ctx.fillStyle = 'rgba(70,45,18,.65)';
      ctx.fillRect(p.x - 11, y - r * 2 - 3, 22, 4.5);
      ctx.fillStyle = p.wet > p.dry ? '#5aa7e0' : '#ff9f43';
      ctx.fillRect(p.x - 10, y - r * 2 - 2, 20 * Math.min(meter, 1), 2.5);
    }

    // speech "!"
    if (p.speak > 0) {
      ctx.fillStyle = '#fff6e8';
      ctx.strokeStyle = '#5b3a1e';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x + r, y - r * 1.9, 7, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5b3a1e';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♥', p.x + r, y - r * 1.9 + 0.5);
    }

    if (sel) this.ring(ctx, p, t);
  }

  eyes(ctx, x, y, facing, wobble, sad) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 3.6, y, 2.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.6, y, 2.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#221408';
    const px = facing * 0.9 + wobble;
    ctx.beginPath(); ctx.arc(x - 3.6 + px, y + (sad ? 0.8 : 0.2), 1.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.6 + px, y + (sad ? 0.8 : 0.2), 1.3, 0, 7); ctx.fill();
    if (sad) {
      ctx.strokeStyle = '#221408';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y + 7.5, 2.6, 1.25 * Math.PI, 1.75 * Math.PI); ctx.stroke();
    }
  }

  ring(ctx, p, t) {
    ctx.strokeStyle = '#ffcf5c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + PERSON_R * 0.8, 14 + Math.sin(t * 5) * 1.2, 6.5, 0, 0, 7);
    ctx.stroke();
  }

  drawMini(world, cam) {
    const c = this.mctx;
    const sx = this.mini.width / world.w, sy = this.mini.height / world.h;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#84bd60';
    c.fillRect(0, 0, this.mini.width, this.mini.height);
    c.fillStyle = '#54331a';
    const m = world.mudpit;
    c.beginPath(); c.ellipse(m.x * sx, m.y * sy, m.r * sx * 1.4, m.r * sy * 1.1, 0, 0, 7); c.fill();
    c.fillStyle = '#5aa7e0';
    for (const p of world.ponds) { c.beginPath(); c.arc(p.x * sx, p.y * sy, 6, 0, 7); c.fill(); }
    c.fillStyle = '#7a4f26';
    for (const d of world.dirtholes) { c.beginPath(); c.arc(d.x * sx, d.y * sy, 5, 0, 7); c.fill(); }
    c.fillStyle = '#c9a15c';
    for (const h of world.huts) { if (!h.dead) c.fillRect(h.x * sx - 4, h.y * sy - 4, 8, 8); }
    for (const p of world.people) {
      if (p.inHut) continue;
      c.fillStyle = !p.alive ? '#e74c3c' : p.busy ? '#ffd166' : '#ff9ecd';
      c.beginPath(); c.arc(p.x * sx, p.y * sy, 3, 0, 7); c.fill();
    }
    // viewport
    c.strokeStyle = '#fff6e8';
    c.lineWidth = 2;
    const vw = cam.vw / cam.zoom * sx, vh = cam.vh / cam.zoom * sy;
    c.strokeRect(cam.x * sx - vw / 2, cam.y * sy - vh / 2, vw, vh);
  }
}
