/* Run state, levelling, and the meta.

   A run is a character walking three floors: hit points, a level, a purse and
   a deck. What survives it is Lore, spent in the Sanctum. Both live in
   localStorage, and like the duel and the dungeon this file has no DOM access
   so the simulator can drive a whole career through it. */

import {
  BOONS, CARDS, CLASSES, FLOORS, LEVEL_XP, LORE, NEUTRAL_POOL,
  POTION_PRICE, SHOP_BURN_PRICE, SHOP_CARD_PRICES, UNLOCKS,
} from "./data.js";
import { makeFloor } from "./dungeon.js";

const RUN_KEY = "deckdelve:run";
const META_KEY = "deckdelve:meta";

export const classById = (id) => CLASSES.find((c) => c.id === id);
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/* ---------- meta --------------------------------------------------------- */

export const newMeta = () => ({ lore: 0, unlocked: [], runs: 0, wins: 0, best: 0 });
export const hasUnlock = (meta, id) => meta.unlocked.includes(id);
export const unlockCost = (id) => UNLOCKS.find((u) => u.id === id).cost;
export const classIsLocked = (cls, meta) => !!cls.unlock && !hasUnlock(meta, cls.unlock);

export function buyUnlock(meta, id) {
  if (hasUnlock(meta, id)) return false;
  const cost = unlockCost(id);
  if (meta.lore < cost) return false;
  meta.lore -= cost;
  meta.unlocked.push(id);
  return true;
}

/* ---------- a run -------------------------------------------------------- */

export function newRun(classId, meta, rng = Math.random) {
  const cls = classById(classId);
  const maxHp = cls.maxHp + (hasUnlock(meta, "vigor") ? 6 : 0);
  const run = {
    classId,
    maxHp,
    hp: maxHp,
    hand: cls.hand + (hasUnlock(meta, "grip") ? 1 : 0),
    startRes: 0,
    gold: hasUnlock(meta, "purse") ? 40 : 0,
    potions: 0,
    xp: 0,
    level: 1,
    pendingLevels: 0,
    deck: cls.deck.map((id) => ({ id, upgraded: false })),
    floorIndex: 0,
    floor: null,
    kills: 0,
    lore: 0,
    over: null, // 'cleared' | 'dead'
  };
  run.floor = makeFloor(0, rng, { scouted: hasUnlock(meta, "scout") });
  return run;
}

export function heroFor(run) {
  const cls = classById(run.classId);
  return {
    name: cls.name,
    sprite: cls.sprite,
    hp: run.hp,
    maxHp: run.maxHp,
    hand: run.hand,
    startRes: run.startRes,
    resName: cls.resource,
    ragePerRound: !!cls.ragePerRound,
  };
}

export function descend(run, meta, rng = Math.random) {
  run.floorIndex += 1;
  run.lore += LORE.floor;
  // The stairs are the one guaranteed breather. Without it a run is decided
  // by how much HP the last keeper happened to leave you with.
  run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * 0.35));
  if (run.floorIndex >= FLOORS.length) {
    run.over = "cleared";
    run.lore += LORE.clear;
    return null;
  }
  run.floor = makeFloor(run.floorIndex, rng, { scouted: hasUnlock(meta, "scout") });
  return run.floor;
}

/* ---------- kills, XP and levels ----------------------------------------- */

export function grantKill(run, foe) {
  run.kills += 1;
  run.xp += foe.xp;
  run.gold += foe.gold;
  if (foe.boss) run.lore += LORE.boss;

  let gained = 0;
  while (run.level < LEVEL_XP.length && run.xp >= LEVEL_XP[run.level]) {
    run.level += 1;
    gained += 1;
  }
  run.pendingLevels += gained;
  return { levels: gained, xp: foe.xp, gold: foe.gold };
}

export const xpToNext = (run) =>
  run.level >= LEVEL_XP.length ? null : LEVEL_XP[run.level] - run.xp;

export const xpBar = (run) => {
  if (run.level >= LEVEL_XP.length) return { value: 1, label: "max" };
  const floorXp = LEVEL_XP[run.level - 1];
  const nextXp = LEVEL_XP[run.level];
  return { value: (run.xp - floorXp) / (nextXp - floorXp), label: `${run.xp}/${nextXp}` };
};

/* A level is a draft: two cards out of your class pool and a boon. This is
   the run's whole growth curve - there is no card handed out for winning a
   fight, only the levels the fight buys. */
export function levelOptions(run, meta, rng = Math.random) {
  const cards = draftPool(run, meta);
  const options = [];
  const bag = cards.slice();
  for (let i = 0; i < 2 && bag.length; i++) {
    const id = bag.splice(Math.floor(rng() * bag.length), 1)[0];
    options.push({ kind: "card", id });
  }
  const boons = BOONS.filter((b) => b.id !== "grip" || run.hand < 7);
  options.push({ kind: "boon", boon: pick(boons, rng).id });
  return options;
}

function draftPool(run, meta) {
  const cls = classById(run.classId);
  const allowRare = hasUnlock(meta, "arsenal") || run.floorIndex >= 1;
  return [...cls.pool, ...NEUTRAL_POOL].filter((id) => allowRare || !CARDS[id].rare);
}

export function takeLevelOption(run, option) {
  if (option.kind === "card") return addCard(run, { id: option.id });
  const boon = BOONS.find((b) => b.id === option.boon);
  if (boon.apply) boon.apply(run);
  return boon;
}

export const boonById = (id) => BOONS.find((b) => b.id === id);

/* ---------- the deck ----------------------------------------------------- */

export const addCard = (run, card) => run.deck.push({ id: card.id, upgraded: !!card.upgraded });
export const removeCard = (run, index) => run.deck.splice(index, 1);
export const canUpgrade = (card) => !card.upgraded && !!CARDS[card.id].up;

export function upgradeCard(run, index) {
  const card = run.deck[index];
  if (card && CARDS[card.id].up) card.upgraded = true;
}

/* ---------- rooms -------------------------------------------------------- */

export function chestLoot(run, meta, rng = Math.random) {
  const gold = 18 + Math.floor(rng() * 22) + run.floorIndex * 8;
  const bag = draftPool(run, meta).slice();
  const cards = [];
  for (let i = 0; i < 3 && bag.length; i++) {
    cards.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  }
  return { gold, cards };
}

export function shopStock(run, meta, rng = Math.random) {
  const bag = draftPool(run, meta).slice();
  const cards = [];
  for (let i = 0; i < 3 && bag.length; i++) {
    const id = bag.splice(Math.floor(rng() * bag.length), 1)[0];
    cards.push({ id, price: CARDS[id].rare ? SHOP_CARD_PRICES.rare : SHOP_CARD_PRICES.common });
  }
  return { cards, potion: POTION_PRICE, burn: SHOP_BURN_PRICE };
}

export function spend(run, amount) {
  if (run.gold < amount) return false;
  run.gold -= amount;
  return true;
}

export function drinkPotion(run) {
  if (run.potions <= 0) return 0;
  run.potions -= 1;
  const healed = Math.min(run.maxHp - run.hp, 14);
  run.hp += healed;
  return healed;
}

export function restAtFire(run) {
  const healed = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * 0.35));
  run.hp += healed;
  return healed;
}

export const loseRun = (run) => { run.over = "dead"; };

export function bankRun(meta, run) {
  meta.runs += 1;
  meta.lore += run.lore;
  if (run.over === "cleared") meta.wins += 1;
  meta.best = Math.max(meta.best, run.floorIndex + 1);
  return run.lore;
}

/* ---------- saving -------------------------------------------------------

   localStorage throws in some private-browsing modes; a game that cannot save
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
  if (!meta || typeof meta.lore !== "number" || !Array.isArray(meta.unlocked)) return newMeta();
  const valid = new Set(UNLOCKS.map((u) => u.id));
  meta.unlocked = meta.unlocked.filter((id) => valid.has(id));
  return { ...newMeta(), ...meta };
}

export const saveMeta = (meta) => write(META_KEY, meta);
export const saveRun = (run) => (!run || run.over ? clearRun() : write(RUN_KEY, run));

/* Rejects a save written by an older, differently shaped version rather than
   letting it crash the dungeon. */
export function loadRun() {
  const run = read(RUN_KEY);
  if (!run || !classById(run.classId) || !Array.isArray(run.deck) || run.over) return null;
  if (run.deck.some((c) => !CARDS[c.id])) return null;
  if (typeof run.floorIndex !== "number" || run.floorIndex >= FLOORS.length) return null;
  if (!run.floor?.tiles?.length) return null;
  return run;
}

export function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch (error) {
    /* nothing to do */
  }
}
