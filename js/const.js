// Bump on every release; keep sw.js CACHE in sync so clients pick up the change.
export const APP_VERSION = '0.4.0';

export const WORLD_W = 1500;
export const WORLD_H = 1000;

export const PERSON_SPEED = 72;      // px/s
export const PERSON_R = 11;          // body radius
export const CARRY_AMOUNT = 3;       // resource units per trip
export const GATHER_TIME = 1.6;      // seconds at a source
export const REVIVE_TIME = 2.0;      // seconds reviving a friend
export const REVIVE_COST = 3;        // one carry-load

export const SPAWN_COST = 15;        // dirt AND water needed per new mud person

export const HUT_STAGES = 3;         // mud people needed to complete a hut, one per stage
export const HUT_MOULD_TIME = 2;     // seconds for a mud person to meld into a hut stage
export const HUT_CAPACITY = 5;

export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 2.2;

export function levelParams(n) {
  const c = Math.min(n, 12); // difficulty caps out
  return {
    level: n,
    seed: n * 7919 + 3,
    startPeople: 3,
    startStock: 6,
    popTarget: 6 + 2 * n,
    hutTarget: n >= 2 ? Math.min(1 + Math.floor((n - 2) / 3), 3) : 0,
    clearMin: Math.max(9, 24 - c * 1.3) * 1.5,  // +50% time between weather events
    clearMax: Math.max(15, 34 - c * 1.6) * 1.5,
    warnTime: 4 * 1.5,                          // +50% warning head start
    eventMin: (6 + c * 0.6) * 0.5,              // -50% how long weather lasts
    eventMax: (9 + c * 0.8) * 0.5,
    exposureTol: Math.max(3.5, 6 - c * 0.2) * 0.2, // -80% tolerance in rain/sun before melt/dry
    dirtholes: 2 + (n % 3 === 0 ? 1 : 0),
    ponds: 2 + (n % 2 === 0 ? 1 : 0),
  };
}
