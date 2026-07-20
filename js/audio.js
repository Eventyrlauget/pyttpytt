// Tiny WebAudio synth — no audio assets needed.
let ctx = null;
let muted = localStorage.getItem('pyttpytt.muted') === '1';

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  localStorage.setItem('pyttpytt.muted', m ? '1' : '0');
}

export function unlock() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0, slide = 0) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(dur, vol = 0.08, delay = 0) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900;
  s.connect(f).connect(g).connect(ctx.destination);
  s.start(t0);
}

export const sfx = {
  select() { tone(660, 0.06, 'triangle', 0.08); },
  command() { tone(440, 0.07, 'triangle', 0.09); tone(550, 0.07, 'triangle', 0.08, 0.06); },
  deny() { tone(180, 0.15, 'square', 0.07, 0, -60); },
  spawn() { tone(523, 0.1, 'sine', 0.13); tone(659, 0.1, 'sine', 0.12, 0.09); tone(784, 0.18, 'sine', 0.12, 0.18); },
  melt() { tone(330, 0.5, 'sine', 0.12, 0, -220); },
  revive() { tone(392, 0.09, 'sine', 0.11); tone(587, 0.16, 'sine', 0.11, 0.08); },
  hutDone() { tone(392, 0.1, 'triangle', 0.11); tone(494, 0.1, 'triangle', 0.11, 0.09); tone(587, 0.2, 'triangle', 0.11, 0.18); },
  rain() { noise(1.2, 0.1); tone(120, 0.5, 'sine', 0.08, 0, -40); },
  sun() { tone(700, 0.4, 'sine', 0.07, 0, 300); },
  warn() { tone(520, 0.12, 'square', 0.06); tone(520, 0.12, 'square', 0.06, 0.2); },
  win() { [523, 587, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.11)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sine', 0.11, i * 0.18)); },
};
