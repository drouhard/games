/* Run state and meta progression.

   A run is disposable: HP, deck, floor. The Sanctum is what survives it -
   Echoes and the unlocks they buy. Both live in localStorage, and like the
   engine this file has no DOM access so the simulator can drive a whole
   career through it. */

import {
  CARDS, CLASSES, FLOORS, MAX_ENERGY, NEUTRAL_POOL, NODES_PER_FLOOR, REWARDS, UNLOCKS,
} from "./data.js";

const RUN_KEY = "deckdelve:run";
const META_KEY = "deckdelve:meta";

export const classById = (id) => CLASSES.find((c) => c.id === id);

/* ---------- meta -------------------------------------------------------- */

export function newMeta() {
  return { echoes: 0, unlocked: [], runs: 0, wins: 0, best: 0 };
}

export function hasUnlock(meta, id) {
  return meta.unlocked.includes(id);
}

export function unlockCost(id) {
  return UNLOCKS.find((u) => u.id === id).cost;
}

export function buyUnlock(meta, id) {
  if (hasUnlock(meta, id)) return false;
  const cost = unlockCost(id);
  if (meta.echoes < cost) return false;
  meta.echoes -= cost;
  meta.unlocked.push(id);
  return true;
}

export function classIsLocked(cls, meta) {
  return !!cls.unlock && !hasUnlock(meta, cls.unlock);
}

/* ---------- starting a run ---------------------------------------------- */

export function newRun(classId, meta) {
  const cls = classById(classId);
  const maxHp = cls.maxHp + (hasUnlock(meta, "vigor") ? 8 : 0);
  const deck = cls.deck.map((id) => ({
    id,
    upgraded: hasUnlock(meta, "honing") && id === cls.honed,
  }));

  return {
    classId,
    maxHp,
    hp: maxHp,
    energy: cls.energy || MAX_ENERGY,
    floor: 0,
    node: 0,
    deck,
    options: null, // the two paths on offer right now
    fights: 0,
    echoes: 0,
    over: null, // 'cleared' | 'dead'
  };
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/* The two doors on offer. Step 0 is always a fight so a floor opens with a
   fight; step 2 always offers a rest so the boss is never a surprise you
   couldn't prepare for. */
export function rollOptions(run, rng = Math.random) {
  const floor = FLOORS[run.floor];
  if (run.node >= NODES_PER_FLOOR) {
    run.options = [{ type: "boss", enemies: [floor.boss], name: floor.name }];
    return run.options;
  }

  const fight = () => ({ type: "fight", enemies: pick(floor.fights, rng) });
  const elite = () => ({ type: "elite", enemies: pick(floor.elites, rng) });

  const pairs = [
    [fight(), rng() < 0.4 ? { type: "shrine" } : fight()],
    [rng() < 0.5 ? elite() : fight(), rng() < 0.5 ? { type: "rest" } : { type: "shrine" }],
    [rng() < 0.6 ? elite() : fight(), { type: "rest" }],
  ];
  run.options = pairs[run.node];
  return run.options;
}

export const NODE_INFO = {
  fight: { label: "Fight", icon: "⚔", desc: "A room with monsters in it." },
  elite: { label: "Elite", icon: "☠", desc: "Harder. Worth more." },
  rest: { label: "Camp", icon: "✦", desc: "Heal, or upgrade a card." },
  shrine: { label: "Shrine", icon: "◈", desc: "Take a card, or burn one." },
  boss: { label: "Boss", icon: "♆", desc: "The floor's keeper." },
};

/* ---------- finishing a node -------------------------------------------- */

export function advance(run) {
  run.node += 1;
  if (run.node > NODES_PER_FLOOR) {
    run.floor += 1;
    run.node = 0;
    if (run.floor >= FLOORS.length) {
      run.over = "cleared";
      run.echoes += REWARDS.clear;
    }
  }
  run.options = null;
}

/* Every win patches you up a little. Without it the ladder is pure attrition:
   nine fights at nine HP apiece kills a full-health hero before the last boss
   regardless of how well any single fight went. */
export function winFight(run, type) {
  run.fights += 1;
  run.echoes += REWARDS[type] ?? REWARDS.fight;
  if (type === "elite") run.maxHp += 4;
  const mend = { fight: 0.06, elite: 0.1, boss: 0.25 }[type] ?? 0.06;
  run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * mend));
}

export function loseRun(run) {
  run.over = "dead";
}

/* Echoes are banked whichever way the run ended - a loss still buys a little
   of the next attempt, which is the whole point of the Sanctum. */
export function bankRun(meta, run) {
  meta.runs += 1;
  meta.echoes += run.echoes;
  if (run.over === "cleared") meta.wins += 1;
  const reached = run.floor * (NODES_PER_FLOOR + 1) + run.node;
  meta.best = Math.max(meta.best, reached);
  return run.echoes;
}

/* ---------- card rewards ------------------------------------------------ */

export function rewardChoices(run, meta, rng = Math.random) {
  const cls = classById(run.classId);
  const allowRare = hasUnlock(meta, "arsenal");
  const pool = [...cls.pool, ...NEUTRAL_POOL].filter((id) => allowRare || !CARDS[id].rare);
  const count = hasUnlock(meta, "insight") ? 4 : 3;

  const picks = [];
  const bag = pool.slice();
  while (picks.length < count && bag.length) {
    const index = Math.floor(rng() * bag.length);
    picks.push(bag.splice(index, 1)[0]);
  }
  return picks.map((id) => ({ id, upgraded: false }));
}

/* The Shrine always digs into the deeper end of the pool - it is the only
   place a rare shows up before Arsenal is unlocked. */
export function shrineChoices(run, rng = Math.random) {
  const cls = classById(run.classId);
  const pool = [...cls.pool, ...NEUTRAL_POOL];
  const rares = pool.filter((id) => CARDS[id].rare);
  const rest = pool.filter((id) => !CARDS[id].rare);
  const picks = [];
  if (rares.length) picks.push(rares[Math.floor(rng() * rares.length)]);
  const bag = rest.slice();
  while (picks.length < 3 && bag.length) {
    picks.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  }
  return picks.map((id) => ({ id, upgraded: false }));
}

export function addCard(run, card) {
  run.deck.push({ id: card.id, upgraded: !!card.upgraded });
}

export function removeCard(run, index) {
  run.deck.splice(index, 1);
}

export function upgradeCard(run, index) {
  const card = run.deck[index];
  if (card && CARDS[card.id].up) card.upgraded = true;
}

export function canUpgrade(card) {
  return !card.upgraded && !!CARDS[card.id].up;
}

export function restHeal(run) {
  const healed = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * 0.4));
  run.hp += healed;
  return healed;
}

/* ---------- saving ------------------------------------------------------

   localStorage throws in some private-browsing modes; a game that can't save
   should still be playable. */

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    /* play on unsaved */
  }
}

export function loadMeta() {
  const meta = read(META_KEY);
  if (!meta || typeof meta.echoes !== "number" || !Array.isArray(meta.unlocked)) return newMeta();
  const valid = new Set(UNLOCKS.map((u) => u.id));
  meta.unlocked = meta.unlocked.filter((id) => valid.has(id));
  return { ...newMeta(), ...meta };
}

export function saveMeta(meta) {
  write(META_KEY, meta);
}

export function saveRun(run) {
  if (!run || run.over) clearRun();
  else write(RUN_KEY, run);
}

/* Rejects a save written by an older, differently-shaped version rather than
   letting it crash the fight. */
export function loadRun() {
  const run = read(RUN_KEY);
  if (!run || !classById(run.classId) || !Array.isArray(run.deck) || run.over) return null;
  if (run.deck.some((c) => !CARDS[c.id])) return null;
  if (typeof run.floor !== "number" || run.floor >= FLOORS.length) return null;
  return run;
}

export function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch (error) {
    /* nothing to do */
  }
}
