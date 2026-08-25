/* Tuning, the cast and the stage scripts for Petalstorm.

   Pure data plus a couple of pure helpers: no DOM, no timers, no randomness,
   so tools/hell-sim.mjs loads exactly what the browser loads and can play a
   few hundred runs in Node before any of these numbers ship.

   Everything is measured in field units, which are also the pixels of the
   240x360 back buffer the game draws into - one unit is one fat pixel on the
   phone. Speeds are units per second. */

export const FIELD = { w: 240, h: 360 };

export const TUNING = {
  // The ship. hitR is deliberately tiny - a bullet hell is only fair if the
  // hitbox is the glowing core, not the wings, and the game draws that core.
  // The speed is what a thumb can actually drag: much slower and the ship
  // trails behind the finger, which reads as broken rather than as heavy.
  speed: 162,
  hitR: 2,
  grazeR: 12,
  invuln: 2.4, // after a death
  maxLives: 6,
  // Extra ships, at raw score - so playing well buys the safety net.
  extends: [40000, 100000, 200000],

  // Shots. period is one volley; POWER below says how many bolts a volley is.
  shotPeriod: 0.1,
  shotSpeed: 380,
  shotR: 3,

  // Grazing is the whole risk/reward loop: skimming bullets is what pays for
  // the panic button that erases them.
  grazeCharge: 3,
  killCharge: 1.5,
  grazeScore: 12,
  bloomFull: 100,
  bloomCost: 100,
  bloomSpeed: 300, // how fast the shockwave front travels
  bloomReach: 210,
  bloomDps: 260,
  bloomCancelScore: 30,

  // Pickups drift down and get hoovered up from a little way off.
  pickupSpeed: 34,
  pickupR: 9,
  magnetR: 46,

  cullMargin: 26, // bullets die this far outside the field
  bulletCap: 460, // a hard ceiling, so a bad script can never melt the phone
};

/* Power stages. Each is one volley: a list of bolts as [x offset, angle in
   degrees from straight up, damage]. Angled bolts miss a lot, which is why
   the wide stages don't simply out-damage the focused ones. */
export const POWER = [
  { name: "I", bolts: [[0, 0, 6]] },
  { name: "II", bolts: [[-4, 0, 5], [4, 0, 5]] },
  { name: "III", bolts: [[-4, 0, 5], [4, 0, 5], [-7, -13, 3], [7, 13, 3]] },
  { name: "IV", bolts: [[-4, 0, 6], [4, 0, 6], [-8, -11, 4], [8, 11, 4], [-11, -24, 3], [11, 24, 3]] },
];

/* Three difficulties, because a bullet hell tuned for one thumb is wrong for
   every other one. `speed` scales every enemy bullet, `period` stretches the
   gap between volleys, and `score` is what a clear is worth - Ace is harder
   and pays for it, so the three high scores are kept apart. */
export const DIFFS = {
  novice: { name: "Novice", blurb: "Slower fire, five ships.", speed: 0.8, period: 1.35, lives: 5, score: 0.5 },
  pilot: { name: "Pilot", blurb: "The fight as intended.", speed: 1, period: 1, lives: 3, score: 1 },
  ace: { name: "Ace", blurb: "Faster, denser, two ships.", speed: 1.12, period: 0.85, lives: 2, score: 1.6 },
};

export const BULLETS = {
  pellet: { sprite: "pellet", r: 2.6 },
  orb: { sprite: "orb", r: 4 },
  petal: { sprite: "petal", r: 3.2 },
  shard: { sprite: "shard", r: 2.2 },
  star: { sprite: "star", r: 3.6 },
};

/* Guns. `pattern` names a function in engine.js; the rest is its arguments.
   period is the gap between volleys, first the delay before the first one,
   burst/burstGap turn one volley into a quick stutter of them. */
export const GUNS = {
  ping: { bullet: "pellet", pattern: "aimed", count: 1, speed: 74, period: 2.1, first: 0.7 },
  ping2: { bullet: "pellet", pattern: "aimed", count: 1, speed: 86, period: 1.0, first: 0.4, burst: 2, burstGap: 0.16 },
  fan3: { bullet: "pellet", pattern: "aimed", count: 3, spread: 30, speed: 80, period: 2.4, first: 0.9 },
  fan5: { bullet: "pellet", pattern: "aimed", count: 5, spread: 52, speed: 78, period: 2.1, first: 1.0 },
  lance: { bullet: "shard", pattern: "aimed", count: 2, spread: 9, speed: 140, period: 1.8, first: 0.5 },
  ring8: { bullet: "orb", pattern: "ring", count: 8, speed: 56, period: 2.6, first: 1.0 },
  ring12: { bullet: "orb", pattern: "ring", count: 12, speed: 60, period: 2.4, first: 1.1 },
  ring16: { bullet: "orb", pattern: "ring", count: 16, speed: 64, period: 2.2, first: 1.0 },
  bloomer: { bullet: "petal", pattern: "ring", count: 10, speed: 52, period: 1.7, first: 0.8, spin: 18 },
  spiral2: { bullet: "petal", pattern: "spiral", count: 2, speed: 70, period: 0.17, first: 0.5, spin: 47 },
  spiral3: { bullet: "petal", pattern: "spiral", count: 3, speed: 74, period: 0.16, first: 0.4, spin: -39 },
  rain: { bullet: "pellet", pattern: "spray", count: 3, spread: 70, speed: 92, period: 0.9, first: 0.5 },
  cross: { bullet: "star", pattern: "ring", count: 4, speed: 70, period: 0.5, first: 0.3, spin: 23 },
  wallL: { bullet: "orb", pattern: "wall", count: 7, speed: 74, period: 2.6, first: 1.2, spread: 150, drift: -1 },
  wallR: { bullet: "orb", pattern: "wall", count: 7, speed: 74, period: 2.6, first: 1.2, spread: 150, drift: 1 },
  volley: { bullet: "shard", pattern: "aimed", count: 3, spread: 16, speed: 160, period: 2.2, first: 0.8, burst: 3, burstGap: 0.13 },
  petalfall: { bullet: "petal", pattern: "spray", count: 5, spread: 120, speed: 60, period: 1.1, first: 0.4 },
};

/* The fodder. `path` names a movement behaviour in engine.js. */
export const ENEMIES = {
  drone: { sprite: "drone", hp: 8, r: 7, score: 120, path: "dive", speed: 62, gun: "ping" },
  weaver: { sprite: "weaver", hp: 10, r: 7, score: 160, path: "sine", speed: 54, amp: 44, freq: 1.5, gun: "fan3" },
  turret: { sprite: "turret", hp: 44, r: 8, score: 420, path: "park", speed: 70, stay: 7.5, gun: "ring8", drop: "power" },
  lancer: { sprite: "lancer", hp: 14, r: 7, score: 220, path: "swoop", speed: 105, gun: "lance" },
  bloom: { sprite: "bloom", hp: 30, r: 8, score: 380, path: "park", speed: 60, stay: 6.5, gun: "bloomer", drop: "shard" },
  spinner: { sprite: "spinner", hp: 34, r: 8, score: 460, path: "park", speed: 66, stay: 7, gun: "spiral2", drop: "power" },
};

/* Bosses. A phase swaps in a new attack script when HP crosses `at`; the
   script loops until then, so a phase never runs out of things to do. */
export const BOSSES = {
  sentinel: {
    name: "Sentinel", sprite: "sentinel", w: 32, h: 32, r: 13, hp: 1100, score: 6000, sway: 46,
    phases: [
      { at: 1, move: "sway", script: [{ gun: "ring12", dur: 5.5 }, { gun: "fan5", dur: 4.5 }] },
      { at: 0.55, move: "sway", script: [{ gun: "ring16", dur: 5 }, { gun: "volley", dur: 4.5 }, { gun: "rain", dur: 4 }] },
    ],
  },
  hive: {
    name: "Hive Mother", sprite: "hive", w: 32, h: 32, r: 14, hp: 1900, score: 9000, sway: 56,
    phases: [
      { at: 1, move: "sway", script: [{ gun: "petalfall", dur: 5 }, { gun: "wallL", dur: 5 }] },
      { at: 0.6, move: "drift", script: [{ gun: "spiral3", dur: 6 }, { gun: "wallR", dur: 5 }, { gun: "fan5", dur: 4 }] },
      { at: 0.28, move: "drift", script: [{ gun: "bloomer", dur: 4 }, { gun: "spiral2", dur: 6 }, { gun: "volley", dur: 4 }] },
    ],
  },
  warlance: {
    name: "Warlance", sprite: "warlance", w: 32, h: 32, r: 13, hp: 2400, score: 12000,
    phases: [
      { at: 1, move: "charge", script: [{ gun: "volley", dur: 5 }, { gun: "cross", dur: 5 }] },
      { at: 0.62, move: "charge", script: [{ gun: "lance", dur: 4 }, { gun: "ring16", dur: 5 }, { gun: "rain", dur: 4.5 }] },
      { at: 0.3, move: "sway", script: [{ gun: "spiral3", dur: 6 }, { gun: "volley", dur: 4 }, { gun: "wallL", dur: 4 }] },
    ],
  },
  queen: {
    name: "Petal Queen", sprite: "queen", w: 48, h: 40, r: 17, hp: 3000, score: 20000,
    phases: [
      { at: 1, move: "sway", script: [{ gun: "bloomer", dur: 5 }, { gun: "ring16", dur: 5 }] },
      { at: 0.7, move: "drift", script: [{ gun: "spiral2", dur: 6 }, { gun: "petalfall", dur: 4.5 }, { gun: "wallR", dur: 4.5 }] },
      { at: 0.42, move: "drift", script: [{ gun: "spiral3", dur: 6.5 }, { gun: "volley", dur: 4 }, { gun: "wallL", dur: 4.5 }] },
      { at: 0.18, move: "charge", script: [{ gun: "ring16", dur: 4 }, { gun: "spiral2", dur: 5 }, { gun: "cross", dur: 4 }, { gun: "petalfall", dur: 4 }] },
    ],
  },
};

/* Formation helpers. Waves are written as one line each below, and these
   expand them into the individual craft with their entry positions and the
   stagger between them. */
function row({ type, count, y = -14, from = 34, to = FIELD.w - 34, stagger = 0, ...rest }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push({ type, x: from + (to - from) * t, y, delay: i * stagger, ...rest });
  }
  return out;
}

function stream({ type, count, x, y = -14, gap = 0.4, ...rest }) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ type, x, y, delay: i * gap, ...rest });
  return out;
}

function vee({ type, count, x = FIELD.w / 2, y = -14, step = 22, ...rest }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const rank = Math.floor(i / 2);
    out.push({ type, x: x + side * step * Math.ceil((i + 1) / 2) * 0.5, y: y - rank * 12, delay: i * 0.12, ...rest });
  }
  return out;
}

/* The four stages. `at` is seconds into the stage; the boss arrives once every
   wave has spawned and the field is clear of fodder. `speed` scales every
   enemy bullet in the stage, which is most of what makes stage 4 stage 4. */
export const STAGES = [
  {
    name: "Ashfall", subtitle: "Stage 1", speed: 1, boss: "sentinel",
    waves: [
      { at: 1.0, craft: row({ type: "drone", count: 5, stagger: 0.18 }) },
      { at: 6.0, craft: row({ type: "drone", count: 5, from: 200, to: 40, stagger: 0.18 }) },
      { at: 11.0, craft: stream({ type: "lancer", count: 2, x: 46, gap: 0.55 }) },
      { at: 12.5, craft: stream({ type: "lancer", count: 2, x: 194, gap: 0.55 }) },
      { at: 18.0, craft: row({ type: "weaver", count: 4, stagger: 0.3 }) },
      { at: 25.0, craft: [{ type: "turret", x: 80, y: -14, park: 62 }, { type: "turret", x: 160, y: -14, park: 62, delay: 0.4 }] },
      { at: 33.0, craft: vee({ type: "drone", count: 6 }) },
      { at: 39.0, craft: row({ type: "weaver", count: 5, stagger: 0.22 }) },
    ],
  },
  {
    name: "Thornbelt", subtitle: "Stage 2", speed: 1.08, boss: "hive",
    waves: [
      { at: 1.0, craft: row({ type: "weaver", count: 5, stagger: 0.16 }) },
      { at: 7.0, craft: stream({ type: "lancer", count: 4, x: 60, gap: 0.35 }) },
      { at: 8.0, craft: stream({ type: "lancer", count: 4, x: 180, gap: 0.35 }) },
      { at: 14.0, craft: [{ type: "bloom", x: 120, y: -16, park: 74 }] },
      { at: 16.0, craft: row({ type: "drone", count: 6, stagger: 0.14, gun: "ping2" }) },
      { at: 24.0, craft: [{ type: "turret", x: 54, y: -14, park: 56 }, { type: "turret", x: 186, y: -14, park: 56 }, { type: "spinner", x: 120, y: -16, park: 76, delay: 0.6 }] },
      { at: 34.0, craft: vee({ type: "weaver", count: 6 }) },
      { at: 41.0, craft: row({ type: "drone", count: 7, stagger: 0.12, gun: "fan3" }) },
      { at: 47.0, craft: [{ type: "bloom", x: 72, y: -16, park: 64 }, { type: "bloom", x: 168, y: -16, park: 64, delay: 0.5 }] },
    ],
  },
  {
    name: "Glasswake", subtitle: "Stage 3", speed: 1.16, boss: "warlance",
    waves: [
      { at: 1.0, craft: row({ type: "drone", count: 7, stagger: 0.12, gun: "ping2" }) },
      { at: 6.0, craft: [{ type: "spinner", x: 66, y: -16, park: 60 }, { type: "spinner", x: 174, y: -16, park: 60, delay: 0.5 }] },
      { at: 14.0, craft: stream({ type: "lancer", count: 5, x: 40, gap: 0.3 }).concat(stream({ type: "lancer", count: 5, x: 200, gap: 0.3 })) },
      { at: 21.0, craft: row({ type: "weaver", count: 6, stagger: 0.14, gun: "fan5" }) },
      { at: 28.0, craft: [{ type: "bloom", x: 120, y: -16, park: 80 }, { type: "turret", x: 46, y: -14, park: 54 }, { type: "turret", x: 194, y: -14, park: 54 }] },
      { at: 38.0, craft: vee({ type: "lancer", count: 8 }) },
      { at: 45.0, craft: row({ type: "drone", count: 8, stagger: 0.1, gun: "fan3" }) },
      { at: 51.0, craft: [{ type: "spinner", x: 90, y: -16, park: 70 }, { type: "spinner", x: 150, y: -16, park: 70, delay: 0.4 }, { type: "bloom", x: 120, y: -16, park: 44, delay: 1.2 }] },
    ],
  },
  {
    name: "Queensreach", subtitle: "Stage 4", speed: 1.25, boss: "queen",
    waves: [
      { at: 1.0, craft: row({ type: "weaver", count: 7, stagger: 0.1, gun: "fan5" }) },
      { at: 7.0, craft: stream({ type: "lancer", count: 6, x: 52, gap: 0.26 }).concat(stream({ type: "lancer", count: 6, x: 188, gap: 0.26 })) },
      { at: 14.0, craft: [{ type: "bloom", x: 60, y: -16, park: 66 }, { type: "bloom", x: 180, y: -16, park: 66 }, { type: "spinner", x: 120, y: -16, park: 88, delay: 0.8 }] },
      { at: 24.0, craft: row({ type: "drone", count: 8, stagger: 0.09, gun: "fan3" }) },
      { at: 30.0, craft: [{ type: "turret", x: 40, y: -14, park: 50 }, { type: "turret", x: 120, y: -14, park: 62 }, { type: "turret", x: 200, y: -14, park: 50 }] },
      { at: 40.0, craft: vee({ type: "weaver", count: 8, gun: "fan5" }) },
      { at: 47.0, craft: [{ type: "spinner", x: 74, y: -16, park: 72 }, { type: "spinner", x: 166, y: -16, park: 72 }, { type: "bloom", x: 120, y: -16, park: 48, delay: 1 }] },
    ],
  },
];

export function fmtScore(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
