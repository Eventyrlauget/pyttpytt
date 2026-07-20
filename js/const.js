export const WORLD_W = 1500;
export const WORLD_H = 1000;

export const PERSON_SPEED = 72;      // px/s
export const PERSON_R = 11;          // body radius
export const CARRY_AMOUNT = 3;       // resource units per trip
export const GATHER_TIME = 1.6;      // seconds at a source
export const REVIVE_TIME = 2.0;      // seconds reviving a friend
export const REVIVE_COST = 3;        // one carry-load

export const SPAWN_COST = 15;        // dirt AND water needed per new mud person

export const HUT_COST = 8;           // dirt AND water to start a hut
export const HUT_BUILD_WORK = 24;    // worker-seconds to complete
export const HUT_CAPACITY = 5;
export const HUT_RAIN_DAMAGE = 1 / 3;// progress lost when rain starts (incomplete huts)

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
    clearMin: Math.max(9, 24 - c * 1.3),
    clearMax: Math.max(15, 34 - c * 1.6),
    warnTime: 4,
    eventMin: 6 + c * 0.6,
    eventMax: 9 + c * 0.8,
    exposureTol: Math.max(3.5, 6 - c * 0.2), // seconds in rain/sun before melt/dry
    dirtholes: 2 + (n % 3 === 0 ? 1 : 0),
    ponds: 2 + (n % 2 === 0 ? 1 : 0),
  };
}
