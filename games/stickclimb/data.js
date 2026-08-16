/* Numbers only. Every curve in the game lives here so tools/climb-sim.mjs can
   retune the whole ladder without touching a line of engine or interface code.

   The shape of an incremental is one relationship: how fast the foes grow
   against how fast a purchase grows you. Foe health climbs 1.6x a rung, and a
   Haymaker level buys 1.3x damage, so a rung costs roughly two levels - and
   the cost multiplier is picked so two levels is about what a rung's scrap
   pays for. Change one of those three and the whole climb moves. */

export const TUNING = {
  // --- the ladder --------------------------------------------------------
  // Bounty has to climb faster than health or farming rung 1 forever would be
  // the best scrap in the game; the gap between them is what makes the newest
  // foe you can beat the one worth grinding.
  foeHp: 200,
  foeHpGrowth: 1.6,
  foeHit: 7,
  foeHitGrowth: 1.5,
  bounty: 25,
  bountyGrowth: 1.72,

  // Attacks come faster and travel quicker the higher you climb, but both
  // bottom out - past that the dodge stops being a reaction and starts being
  // a coin flip.
  foePeriod: 2.4,
  foePeriodStep: 0.05,
  foePeriodFloor: 1.15,
  foeTravel: 1.05,
  foeTravelStep: 0.025,
  foeTravelFloor: 0.5,

  // --- the stick figure --------------------------------------------------
  heroHp: 70,
  heroRegen: 0.012, // fraction of max health per second
  strike: 8,
  strikeCd: 0.4,
  heavyCd: 2.4,
  heavyMult: 2.5,
  focusCd: 9,
  focusDur: 5,
  focusMult: 1.5,
  autoDps: 1.6,
  airTime: 0.6,
  slideTime: 0.55,
  hurtTime: 0.32,
  momentumCap: 5,

  // The beat between one foe dropping and the next stepping in. It reads as
  // polish, but it is load-bearing: without it a fight your damage trivialises
  // takes zero time, and farming an old rung mints unlimited scrap per second.
  roundGap: 1.1,

  // --- the meta ----------------------------------------------------------
  relicBonus: 0.35, // per relic, added to scrap gain
  ascendAt: 9, // lowest cleared rung that unlocks Ascend
  offlineCap: 8 * 3600,
  offlineRate: 0.6, // a sleeping twin swings slower than you do
};

/* Eight silhouettes, then the ranks start over with a bigger title. An
   endless ladder needs to reuse its art; naming the reuse is more honest than
   pretending rung 30 has its own monster. */
const SPECIES = [
  { name: "Blob", sprite: "blob" },
  { name: "Flitter", sprite: "flitter" },
  { name: "Bruiser", sprite: "bruiser" },
  { name: "Skitter", sprite: "skitter" },
  { name: "Wisp", sprite: "wisp" },
  { name: "Slab", sprite: "slab" },
  { name: "Coil", sprite: "coil" },
  { name: "Warden", sprite: "warden" },
];

const RANKS = ["", "Grim", "Elder", "Dread", "Void", "Astral", "Eternal"];

export function foeAt(index) {
  const species = SPECIES[index % SPECIES.length];
  const rank = Math.floor(index / SPECIES.length);
  const title = rank === 0 ? "" : `${RANKS[rank] ?? `Ω${rank}`} `;
  const T = TUNING;
  return {
    index,
    name: `${title}${species.name}`,
    sprite: species.sprite,
    rank,
    maxHp: T.foeHp * Math.pow(T.foeHpGrowth, index),
    hit: T.foeHit * Math.pow(T.foeHitGrowth, index),
    bounty: T.bounty * Math.pow(T.bountyGrowth, index),
    period: Math.max(T.foePeriodFloor, T.foePeriod - index * T.foePeriodStep),
    travel: Math.max(T.foeTravelFloor, T.foeTravel - index * T.foeTravelStep),
  };
}

/* Costs multiply, effects multiply, and the two are tied together: a rung
   needs ln(1.6)/ln(step) levels to stay level with it, so a cost multiplier
   of step^(ln 2.1 / ln 1.6) makes each rung cost about 2.1x the last while
   paying only 1.72x - a slow squeeze that turns into a wall, which is exactly
   what Ascend is for.

   Pocket Runes is priced well above that line for a reason the simulator had
   to teach: it multiplies income, and income buys more of it, so at a cost
   multiplier of 1.75 scrap compounds at 2.15x a rung, outruns the 2.1x costs,
   and the wall never arrives. Anything below ~1.85 here breaks the game.

   `max` is only set where an effect would stop making sense: hang time longer
   than the gap between attacks would let you simply live in the air. */
export const UPGRADES = [
  {
    id: "power", name: "Haymaker", icon: "✊",
    blurb: "Strike and Heavy hit 30% harder.",
    cost: 30, mult: 1.51, step: 1.3, max: null,
  },
  {
    id: "auto", name: "Shadow Twin", icon: "👥",
    blurb: "A copy of you keeps swinging - even while the tab is shut.",
    cost: 80, mult: 1.59, step: 1.34, max: null,
  },
  {
    id: "vigor", name: "Iron Ribs", icon: "🫀",
    blurb: "+26% health, and you mend faster between blows.",
    cost: 45, mult: 1.44, step: 1.26, max: null,
  },
  {
    id: "wind", name: "Feather Boots", icon: "🥾",
    blurb: "Hang in the air and hold a slide longer.",
    cost: 200, mult: 2.4, step: 1, max: 6,
  },
  {
    id: "fortune", name: "Pocket Runes", icon: "🪙",
    blurb: "+25% scrap from every kill.",
    cost: 150, mult: 2.6, step: 1.25, max: 8,
  },
  {
    id: "flow", name: "Killer Instinct", icon: "🔥",
    blurb: "Each point of momentum feeds more into a Heavy.",
    cost: 260, mult: 1.7, step: 1, max: 9,
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function costOf(id, level) {
  const up = UPGRADE_BY_ID[id];
  if (up.max != null && level >= up.max) return Infinity;
  return Math.ceil(up.cost * Math.pow(up.mult, level));
}

/* Everything the engine needs about the player, derived from levels rather
   than stored - so retuning a curve retunes an existing save too. */
export function stats(save) {
  const T = TUNING;
  const lv = save.levels;
  const relic = 1 + T.relicBonus * save.relics;
  return {
    strike: T.strike * Math.pow(UPGRADE_BY_ID.power.step, lv.power),
    autoDps: lv.auto === 0 ? 0 : T.autoDps * Math.pow(UPGRADE_BY_ID.auto.step, lv.auto - 1),
    maxHp: T.heroHp * Math.pow(UPGRADE_BY_ID.vigor.step, lv.vigor),
    regen: T.heroRegen * (1 + 0.25 * lv.vigor),
    airTime: T.airTime + 0.05 * lv.wind,
    slideTime: T.slideTime + 0.05 * lv.wind,
    scrapMult: Math.pow(UPGRADE_BY_ID.fortune.step, lv.fortune) * relic,
    momentumPower: 0.8 + 0.22 * lv.flow,
  };
}

/* Relics are linear in rungs past the threshold, and deliberately so. The
   simulator ran this at rungs^1.35 first: because a relic multiplies damage
   and scrap at once, and the scrap needed for a rung is superlinear in
   damage, a 4x relic stack cut the cost of rung 40 by 31x. Compounded over a
   few ascensions that turned a three-hour career into rung 517. Linear keeps
   each Ascend worth about three rungs, which is a climb rather than a
   cannon. */
export function relicsFor(best) {
  // best is the highest rung cleared, 0-based; -1 means nothing cleared yet.
  const rungs = best + 1;
  if (rungs <= TUNING.ascendAt) return 0;
  return rungs - TUNING.ascendAt;
}

export function newSave() {
  return {
    v: 1,
    scrap: 0,
    relics: 0,
    best: -1, // highest rung cleared
    target: 0, // rung currently in the arena
    kills: 0,
    ascends: 0,
    levels: { power: 0, auto: 0, vigor: 0, wind: 0, fortune: 0, flow: 0 },
    lastSeen: 0,
  };
}

const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/* Big numbers are the whole texture of an incremental, so they have to stay
   readable at a glance on a phone: three significant figures, never wider
   than six characters. */
export function fmt(n) {
  if (!isFinite(n)) return "∞";
  if (n < 0) return `-${fmt(-n)}`;
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
  const tier = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  const scaled = n / Math.pow(1000, tier);
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${scaled.toFixed(digits)}${SUFFIX[tier]}`;
}

export function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
