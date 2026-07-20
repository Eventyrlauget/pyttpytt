export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const lerp = (a, b, t) => a + (b - a) * t;
export const randIn = (rng, a, b) => a + rng() * (b - a);

export function nearest(x, y, items, filter) {
  let best = null, bd = Infinity;
  for (const it of items) {
    if (filter && !filter(it)) continue;
    const d = dist(x, y, it.x, it.y);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
