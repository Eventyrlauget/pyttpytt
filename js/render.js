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
    for (const p of world.ponds) this.pond(ctx, p, t);

    // dirt holes
    for (const d of world.dirtholes) this.dirthole(ctx, d, t);

    // mud pit
    this.mudpit(ctx, world, t);

    // huts
    for (const h of world.huts) this.hut(ctx, h, t);

    // people (y-sorted)
    const people = [...world.people].filter(p => !p.inHut).sort((a, b) => a.y - b.y);
    for (const p of people) this.person(ctx, p, world, t);

    // build placement ghost
    if (ui.buildArmed && ui.pointerWorld) {
      const g = ui.pointerWorld;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#a9793f';
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

  // ---------- shared bits ----------

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

  // a single pointed grass blade, base at (x,y), tip curving to (x+dx, y-h)
  grassBlade(ctx, x, y, dx, h, w, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x + dx * 0.4, y - h * 0.6, x + dx, y - h);
    ctx.quadraticCurveTo(x + dx * 0.15, y - h * 0.5, x + w, y);
    ctx.closePath();
    ctx.fill();
  }

  // a little fan of grass blades that sway with time
  grassTuft(ctx, x, y, s = 1) {
    const sway = Math.sin(this.t * 1.4 + x * 0.05) * 1.6;
    const cols = ['#2f7a2c', '#4fa33f', '#3c8a34', '#5bb84a', '#357f30'];
    const blades = [[-7, 15, 2], [-3.5, 22, 2.2], [0, 25, 2.1], [3.5, 21, 2], [7, 16, 1.9]];
    blades.forEach((b, i) => {
      this.grassBlade(ctx, x + b[0] * s, y, (b[0] * 0.45 + sway) * s, b[1] * s, b[2] * s, cols[i % cols.length]);
    });
  }

  pebble(ctx, x, y, s = 1) {
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    ctx.beginPath(); ctx.ellipse(x, y + 1.4 * s, 4.6 * s, 2 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#a7a79d';
    ctx.beginPath(); ctx.ellipse(x, y, 4.6 * s, 3.4 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.ellipse(x - 1.1 * s, y - 1.1 * s, 1.8 * s, 1.1 * s, -0.4, 0, 7); ctx.fill();
  }

  // ---------- landmarks ----------

  pond(ctx, p, t) {
    // sandy shore
    ctx.fillStyle = '#cdb389';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, p.r * 1.2, p.r * 0.9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#bda074';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, p.r * 1.06, p.r * 0.78, 0, 0, 7); ctx.fill();
    // water
    const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.28, p.r * 0.2, p.x, p.y, p.r * 1.05);
    g.addColorStop(0, '#93d2f0');
    g.addColorStop(1, '#3f9fd8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.96, p.r * 0.66, 0, 0, 7); ctx.fill();
    // sheen
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(p.x - p.r * 0.2, p.y - p.r * 0.08, p.r * 0.5, Math.PI * 0.92 + Math.sin(t + p.phase) * 0.12, Math.PI * 1.5);
    ctx.stroke();
    // faint ripple
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(p.x + p.r * 0.15, p.y + p.r * 0.18, p.r * 0.34, p.r * 0.14, 0, 0, 7); ctx.stroke();
    // lily pads
    this.lilypad(ctx, p.x - p.r * 0.45, p.y + p.r * 0.14, 1);
    this.lilypad(ctx, p.x + p.r * 0.4, p.y - p.r * 0.18, 0.85);
    // reeds around the back/sides
    for (const a of [-2.5, -2.0, -1.35, -0.6, 3.0]) {
      this.grassTuft(ctx, p.x + Math.cos(a) * p.r * 1.02, p.y + Math.sin(a) * p.r * 0.74, 0.85);
    }
  }

  lilypad(ctx, x, y, s) {
    ctx.fillStyle = '#3f9d4f';
    ctx.beginPath(); ctx.ellipse(x, y, 5.2 * s, 3.8 * s, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#34833f';
    ctx.beginPath(); ctx.ellipse(x, y, 5.2 * s, 3.8 * s, 0.3, -0.35, 0.15); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.beginPath(); ctx.ellipse(x - 1.4 * s, y - 1.2 * s, 1.6 * s, 1 * s, 0.3, 0, 7); ctx.fill();
  }

  dirthole(ctx, d, t) {
    // mound
    const g = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.4, d.r * 0.2, d.x, d.y, d.r * 1.35);
    g.addColorStop(0, '#8f5e2f');
    g.addColorStop(1, '#5e3c1c');
    ctx.fillStyle = g;
    this.blob(ctx, d.x, d.y, d.r * 1.2, d.r * 0.86, d.phase); ctx.fill();
    // crater (dark) with a lit far wall
    ctx.fillStyle = '#33200f';
    ctx.beginPath(); ctx.ellipse(d.x, d.y - d.r * 0.02, d.r * 0.54, d.r * 0.35, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#5e3c1c';
    ctx.beginPath(); ctx.ellipse(d.x, d.y - d.r * 0.12, d.r * 0.46, d.r * 0.26, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#20120a';
    ctx.beginPath(); ctx.ellipse(d.x, d.y + d.r * 0.02, d.r * 0.4, d.r * 0.24, 0, 0, 7); ctx.fill();
    // pebbles around the rim
    this.pebble(ctx, d.x - d.r * 1.02, d.y + d.r * 0.28, 1);
    this.pebble(ctx, d.x + d.r * 0.95, d.y + d.r * 0.34, 1.15);
    this.pebble(ctx, d.x + d.r * 1.05, d.y - d.r * 0.15, 0.85);
    this.pebble(ctx, d.x - d.r * 0.7, d.y + d.r * 0.55, 0.9);
    // grass tufts at the back
    this.grassTuft(ctx, d.x - d.r * 0.55, d.y - d.r * 0.5, 0.8);
    this.grassTuft(ctx, d.x + d.r * 0.5, d.y - d.r * 0.48, 0.8);
  }

  mudpit(ctx, world, t) {
    const m = world.mudpit;
    // tall grass growing from the back
    this.grassTuft(ctx, m.x - m.r * 0.35, m.y - m.r * 0.5, 1.7);
    this.grassTuft(ctx, m.x + m.r * 0.25, m.y - m.r * 0.55, 1.5);
    // outer wet rim
    ctx.fillStyle = '#4f3118';
    this.blob(ctx, m.x, m.y + 4, m.r * 1.12, m.r * 0.82, 0.5); ctx.fill();
    // glossy mud
    const g = ctx.createRadialGradient(m.x - m.r * 0.3, m.y - m.r * 0.3, m.r * 0.2, m.x, m.y, m.r * 1.1);
    g.addColorStop(0, '#7d4f27');
    g.addColorStop(1, '#472b13');
    ctx.fillStyle = g;
    this.blob(ctx, m.x, m.y, m.r, m.r * 0.68, 1.5); ctx.fill();
    // wet sheen
    ctx.fillStyle = 'rgba(255,236,200,.13)';
    ctx.beginPath(); ctx.ellipse(m.x - m.r * 0.28, m.y - m.r * 0.22, m.r * 0.52, m.r * 0.22, -0.3, 0, 7); ctx.fill();
    // bubbles
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

  // ---------- huts ----------

  domePath(ctx, cx, baseY, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, baseY);
    ctx.bezierCurveTo(cx - w / 2, baseY - h * 1.35, cx + w / 2, baseY - h * 1.35, cx + w / 2, baseY);
    ctx.quadraticCurveTo(cx, baseY + h * 0.1, cx - w / 2, baseY);
    ctx.closePath();
  }

  hut(ctx, h, t) {
    if (h.dead) return;
    const st = h.complete ? 3 : Math.max(0, h.stage || 0);
    const baseY = h.y + h.r * 0.45;

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,.13)';
    ctx.beginPath(); ctx.ellipse(h.x, h.y + h.r * 0.6, h.r * 1.08, h.r * 0.32, 0, 0, 7); ctx.fill();
    // light mud base puddle
    ctx.fillStyle = '#a9793f';
    ctx.beginPath(); ctx.ellipse(h.x, baseY, h.r * 1.08, h.r * 0.42, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8c6231';
    ctx.beginPath(); ctx.ellipse(h.x, baseY + 2, h.r * 0.92, h.r * 0.3, 0, 0, 7); ctx.fill();

    if (st >= 1) {
      const domeH = st === 1 ? h.r * 0.5 : st === 2 ? h.r * 0.98 : h.r * 1.28;
      const domeW = st === 1 ? h.r * 1.55 : st === 2 ? h.r * 1.5 : h.r * 1.62;
      const g = ctx.createRadialGradient(h.x - domeW * 0.2, baseY - domeH * 0.95, domeW * 0.1, h.x, baseY - domeH * 0.3, domeW * 0.9);
      g.addColorStop(0, '#b3803f');
      g.addColorStop(1, '#734a24');
      this.domePath(ctx, h.x, baseY, domeW, domeH);
      ctx.fillStyle = g;
      ctx.fill();
      // upper-left sheen
      ctx.fillStyle = 'rgba(255,236,190,.22)';
      ctx.beginPath();
      ctx.ellipse(h.x - domeW * 0.22, baseY - domeH * 0.75, domeW * 0.22, domeH * 0.32, -0.4, 0, 7);
      ctx.fill();

      if (st >= 3) {
        // faint contour rings near the top
        ctx.strokeStyle = 'rgba(74,45,18,.35)';
        ctx.lineWidth = 1.6;
        for (let i = 1; i <= 2; i++) {
          ctx.beginPath();
          ctx.arc(h.x, baseY - domeH * 0.62, domeH * 0.28 * i, Math.PI * 1.12, Math.PI * 1.88);
          ctx.stroke();
        }
        // dark arched doorway
        const dw = h.r * 0.52, dh = h.r * 0.74;
        ctx.fillStyle = '#33200f';
        ctx.beginPath();
        ctx.moveTo(h.x - dw / 2, baseY);
        ctx.lineTo(h.x - dw / 2, baseY - dh * 0.5);
        ctx.quadraticCurveTo(h.x - dw / 2, baseY - dh, h.x, baseY - dh);
        ctx.quadraticCurveTo(h.x + dw / 2, baseY - dh, h.x + dw / 2, baseY - dh * 0.5);
        ctx.lineTo(h.x + dw / 2, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.beginPath(); ctx.ellipse(h.x, baseY - dh * 0.12, dw * 0.42, dh * 0.2, 0, 0, 7); ctx.fill();
      }
    }

    // grass tufts at the foot (stage 2+)
    if (st >= 2) {
      this.grassTuft(ctx, h.x - h.r * 0.92, baseY - 2, 0.8);
      this.grassTuft(ctx, h.x + h.r * 0.92, baseY - 2, 0.8);
      this.grassTuft(ctx, h.x - h.r * 0.35, baseY + h.r * 0.16, 0.6);
    }

    // build progress bar
    if (!h.complete) {
      ctx.fillStyle = 'rgba(70,45,18,.75)';
      ctx.fillRect(h.x - 22, h.y - h.r - 16, 44, 7);
      ctx.fillStyle = '#ffcf5c';
      ctx.fillRect(h.x - 20, h.y - h.r - 14.5, 40 * (h.progress || 0), 4);
    } else if (h.occupants.length) {
      ctx.fillStyle = 'rgba(70,45,18,.85)';
      ctx.beginPath(); ctx.arc(h.x + h.r * 0.7, h.y - h.r * 0.9, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff6e8';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(h.occupants.length), h.x + h.r * 0.7, h.y - h.r * 0.9 + 0.5);
    }
  }

  // ---------- mud people ----------

  // the shared gingerbread/golem body: rounded head over a wider belly, stubby arms & legs
  golem(ctx, cx, y, r, pal, { swell = false, water = false, walk = 0, moving = false } = {}) {
    const bw = r * 0.95 * (swell ? 1.2 : 1);
    const bh = r * 0.85 * (swell ? 1.14 : 1);
    // legs — swing forward/back and lift while walking
    const l1 = moving ? Math.sin(walk) : 0;
    const l2 = moving ? Math.sin(walk + Math.PI) : 0;
    const stride = r * 0.34, lift = r * 0.32;
    ctx.fillStyle = pal.dark;
    ctx.beginPath(); ctx.ellipse(cx - r * 0.42 + l1 * stride, y + r * 1.02 - Math.max(0, l1) * lift, r * 0.3, r * 0.34, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.42 + l2 * stride, y + r * 1.02 - Math.max(0, l2) * lift, r * 0.3, r * 0.34, 0, 0, 7); ctx.fill();
    // arms peeking from behind the belly — swing opposite the legs
    ctx.beginPath(); ctx.ellipse(cx - bw * 0.92, y + r * 0.28 + l2 * r * 0.12, r * 0.3, r * 0.48, 0.35, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + bw * 0.92, y + r * 0.28 + l1 * r * 0.12, r * 0.3, r * 0.48, -0.35, 0, 7); ctx.fill();
    // body (belly + head, same gradient so they read as one form)
    const g = ctx.createRadialGradient(cx - r * 0.3, y - r * 0.4, r * 0.25, cx, y + r * 0.2, r * 1.5);
    g.addColorStop(0, pal.light);
    g.addColorStop(1, pal.dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, y + r * 0.32, bw, bh, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, y - r * 0.5, r * 0.66, r * 0.62, 0, 0, 7); ctx.fill();
    // soft front highlight
    ctx.fillStyle = pal.hi;
    ctx.beginPath(); ctx.ellipse(cx - r * 0.24, y + r * 0.12, bw * 0.44, bh * 0.5, -0.2, 0, 7); ctx.fill();
    // water sloshing in the belly
    if (water) {
      const wg = ctx.createRadialGradient(cx - bw * 0.25, y + r * 0.1, bw * 0.15, cx, y + r * 0.4, bw);
      wg.addColorStop(0, 'rgba(120,205,240,.5)');
      wg.addColorStop(1, 'rgba(58,150,214,.5)');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.ellipse(cx, y + r * 0.36, bw * 0.9, bh * 0.86, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.ellipse(cx - bw * 0.3, y + r * 0.02, bw * 0.24, bh * 0.24, -0.3, 0, 7); ctx.fill();
    }
  }

  person(ctx, p, world, t) {
    const sel = world.selected.has(p);
    const r = PERSON_R;

    if (p.state === 'melted') {
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, r * 1.85, r * 0.72, 0, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(p.x - r * 0.4, p.y - 2, r * 0.4, p.x, p.y + 2, r * 1.9);
      g.addColorStop(0, '#7e5230');
      g.addColorStop(1, '#4f2e16');
      ctx.fillStyle = g;
      this.blob(ctx, p.x, p.y + 2, r * 1.7, r * 0.66, p.id); ctx.fill();
      ctx.fillStyle = 'rgba(255,236,200,.18)';
      ctx.beginPath(); ctx.ellipse(p.x - r * 0.3, p.y - r * 0.12, r * 0.8, r * 0.24, -0.2, 0, 7); ctx.fill();
      this.eyes(ctx, p.x + r * 0.15, p.y - r * 0.12, 1, 0, true);
      if (sel) this.ring(ctx, p, t);
      return;
    }

    if (p.state === 'dried') {
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.9, r * 0.95, r * 0.34, 0, 0, 7); ctx.fill();
      this.golem(ctx, p.x, p.y, r, { light: '#ccc1a7', dark: '#948868', hi: 'rgba(255,255,245,.32)' }, {});
      // cracks
      ctx.strokeStyle = '#6f6047';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(p.x - r * 0.1, p.y - r * 0.6); ctx.lineTo(p.x + r * 0.05, p.y - r * 0.1); ctx.lineTo(p.x - r * 0.2, p.y + r * 0.35);
      ctx.moveTo(p.x + r * 0.35, p.y - r * 0.05); ctx.lineTo(p.x + r * 0.15, p.y + r * 0.4);
      ctx.moveTo(p.x - r * 0.45, p.y + r * 0.1); ctx.lineTo(p.x - r * 0.15, p.y + r * 0.2);
      ctx.stroke();
      this.eyes(ctx, p.x, p.y - r * 0.5, 1, 0, true);
      if (sel) this.ring(ctx, p, t);
      return;
    }

    const bob = Math.sin(p.bob) * (p.busy ? 1.6 : 0.8);
    const y = p.y + bob;
    // shadow (stays on the ground)
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.95, r * 0.9, r * 0.32, 0, 0, 7); ctx.fill();

    const pal = { light: '#b5813f', dark: '#7a4f26', hi: 'rgba(255,226,176,.28)' };
    this.golem(ctx, p.x, y, r, pal, {
      swell: p.carrying === 'water', water: p.carrying === 'water',
      walk: p.walk, moving: p.moving,
    });

    // eyes (busy = little side-to-side wobble)
    this.eyes(ctx, p.x, y - r * 0.5, p.facing, p.busy ? Math.sin(t * 6) * 0.5 : 0, false);

    // carrying dirt: a dark clod hugged to the chest
    if (p.carrying === 'dirt') {
      const lg = ctx.createRadialGradient(p.x - r * 0.2, y + r * 0.25, r * 0.2, p.x, y + r * 0.5, r);
      lg.addColorStop(0, '#7c5027');
      lg.addColorStop(1, '#452a12');
      ctx.fillStyle = lg;
      this.blob(ctx, p.x, y + r * 0.5, r * 0.72, r * 0.6, p.id * 2); ctx.fill();
      // arms wrapping over it
      ctx.fillStyle = pal.dark;
      ctx.beginPath(); ctx.ellipse(p.x - r * 0.62, y + r * 0.48, r * 0.3, r * 0.22, 0.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x + r * 0.62, y + r * 0.48, r * 0.3, r * 0.22, -0.5, 0, 7); ctx.fill();
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
    const dx = 3.8, er = 3.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - dx, y, er, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + dx, y, er, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,20,.22)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(x - dx, y, er, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + dx, y, er, 0, 7); ctx.stroke();
    const px = facing * 1.0 + wobble;
    const py = sad ? 0.8 : 0.3;
    ctx.fillStyle = '#201306';
    ctx.beginPath(); ctx.arc(x - dx + px, y + py, 1.7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + dx + px, y + py, 1.7, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(x - dx + px - 0.6, y + py - 0.7, 0.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + dx + px - 0.6, y + py - 0.7, 0.6, 0, 7); ctx.fill();
    if (sad) {
      ctx.strokeStyle = '#201306';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(x, y + 6.5, 2.5, 1.25 * Math.PI, 1.75 * Math.PI); ctx.stroke();
    }
  }

  ring(ctx, p, t) {
    ctx.strokeStyle = '#ffcf5c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + PERSON_R * 0.9, 14 + Math.sin(t * 5) * 1.2, 6.5, 0, 0, 7);
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
