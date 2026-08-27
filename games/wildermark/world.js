/* The Wildermark itself: the map, the walking, and the whole career that sits
   on top of it.

   The one rule this file exists to enforce is the one that made Shandalar what
   it is - your life total does not reset between duels. It comes off out here
   and it comes back slowly, on foot, or fast, for gold, at an inn. Everything
   else (where the monsters are, which warden is weakest, whether you can
   afford to cross the mire) is downstream of that number.

   No DOM. tools/wild-sim.mjs plays whole careers through this file. */

import { CARDS, CARD_KEYS, COLORS, COLOR_KEYS, cardValue, isLand } from "./cards.js";
import {
  DECKS, DECK_MAX_COPIES, DECK_MIN, DUNGEON_NAMES, FOES, HERO_MAX_LIFE, HERO_START_LIFE,
  LEYLINE_LIFE, PRICES, QUEST_KINDS, REGEN_TICKS, SHRINE_NAMES, STARTER, TERRAIN, TOWN_NAMES,
  WARDENS, WARDEN_LIFE_FLOOR, deckList,
} from "./data.js";
import { makeRng, newPlayer, shuffle } from "./duel.js";

export const MAP_W = 26;
export const MAP_H = 22;
/* Enough that there is always something to hunt within a short walk, few
   enough that a crossing is not a gauntlet. */
export const MONSTER_CAP = 11;
const TERRAIN_CHAR = { d: "downs", s: "shallows", m: "mire", c: "crags", w: "wood", "~": "sea" };
const CHAR_OF = Object.fromEntries(Object.entries(TERRAIN_CHAR).map(([k, v]) => [v, k]));
const COLOR_TERRAIN = Object.fromEntries(COLOR_KEYS.map((c) => [c, COLORS[c].terrain]));

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const roll = ([lo, hi], rng) => lo + Math.floor(rng() * (hi - lo + 1));

/* ---------- the map ------------------------------------------------------

   Five regions grown from scattered seeds, one landscape per colour, ringed
   by sea so the world has an edge you can feel. Each region seed is placed on
   its own third of the map, so Ember is never folded inside Bramble - you can
   learn where things live and then go there on purpose. */

function generateMap(rng) {
  const anchors = {
    sun: { x: 0.5, y: 0.22 },
    tide: { x: 0.16, y: 0.62 },
    rot: { x: 0.5, y: 0.86 },
    ember: { x: 0.85, y: 0.3 },
    bramble: { x: 0.8, y: 0.75 },
  };
  const seeds = [];
  for (const [color, at] of Object.entries(anchors)) {
    for (let i = 0; i < 4; i++) {
      seeds.push({
        color,
        x: clamp(Math.round(at.x * MAP_W + (rng() - 0.5) * 10), 3, MAP_W - 4),
        y: clamp(Math.round(at.y * MAP_H + (rng() - 0.5) * 8), 3, MAP_H - 4),
      });
    }
  }

  const rows = [];
  for (let y = 0; y < MAP_H; y++) {
    let row = "";
    for (let x = 0; x < MAP_W; x++) {
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      if (edge < 1 || (edge < 3 && rng() < 0.45 - edge * 0.12)) { row += "~"; continue; }
      let best = null, bestD = 1e9;
      for (const seed of seeds) {
        const d = Math.hypot(seed.x - x, seed.y - y) * (0.85 + rng() * 0.3);
        if (d < bestD) { bestD = d; best = seed; }
      }
      row += CHAR_OF[COLOR_TERRAIN[best.color]];
    }
    rows.push(row);
  }
  // A handful of inland tarns, so the Shallows are not just a coastline.
  for (let i = 0; i < 8; i++) {
    const x = 3 + Math.floor(rng() * (MAP_W - 6));
    const y = 3 + Math.floor(rng() * (MAP_H - 6));
    if (rows[y][x] === "s") rows[y] = rows[y].slice(0, x) + "~" + rows[y].slice(x + 1);
  }
  return rows;
}

export const terrainAt = (career, x, y) => {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return "sea";
  return TERRAIN_CHAR[career.map[y][x]];
};
export const passable = (career, x, y) => !TERRAIN[terrainAt(career, x, y)].blocked;
export const siteAt = (career, x, y) => career.sites.find((s) => s.x === x && s.y === y) || null;
export const monsterAt = (career, x, y) => career.monsters.find((m) => m.x === x && m.y === y) || null;

/* Sites go on land, spread out, and a keep goes as deep into its own colour as
   the map allows - which is what makes the last leg of a hunt a journey. */
function placeSites(career, rng) {
  const sites = [];
  const free = (x, y, gap) =>
    !TERRAIN[terrainAt(career, x, y)].blocked && sites.every((s) => dist(s, { x, y }) >= gap);

  const spot = (want, gap, tries = 900) => {
    for (let i = 0; i < tries; i++) {
      const x = 2 + Math.floor(rng() * (MAP_W - 4));
      const y = 2 + Math.floor(rng() * (MAP_H - 4));
      if (want && terrainAt(career, x, y) !== want) continue;
      if (free(x, y, gap)) return { x, y };
    }
    for (let i = 0; i < 4000; i++) {
      const x = 2 + Math.floor(rng() * (MAP_W - 4));
      const y = 2 + Math.floor(rng() * (MAP_H - 4));
      if (free(x, y, 2)) return { x, y };
    }
    return { x: MAP_W >> 1, y: MAP_H >> 1 };
  };

  // Home first: open ground as near the middle of the map as we can find, so
  // every colour is a walk away in a different direction and none of them is
  // the one you woke up in.
  const centre = { x: MAP_W >> 1, y: MAP_H >> 1 };
  let home = null, homeD = 1e9;
  for (let y = 3; y < MAP_H - 3; y++) {
    for (let x = 3; x < MAP_W - 3; x++) {
      if (TERRAIN[terrainAt(career, x, y)].blocked) continue;
      const d = dist({ x, y }, centre) + (terrainAt(career, x, y) === "downs" ? 0 : 4);
      if (d < homeD) { homeD = d; home = { x, y }; }
    }
  }
  home = home || spot(null, 0);
  sites.push({ id: "town0", kind: "town", name: TOWN_NAMES[0], x: home.x, y: home.y, color: terrainColorAt(career, home.x, home.y), home: true });

  COLOR_KEYS.forEach((color, i) => {
    const at = spot(COLOR_TERRAIN[color], 5);
    sites.push({ id: `town${i + 1}`, kind: "town", name: TOWN_NAMES[i + 1], x: at.x, y: at.y, color });
  });

  for (const warden of WARDENS) {
    // Deep into its own colour: one of the dozen tiles of that landscape that
    // sit furthest from home, picked at random so two seeds do not put the
    // same keep on the same rock.
    const candidates = [];
    for (let y = 2; y < MAP_H - 2; y++) {
      for (let x = 2; x < MAP_W - 2; x++) {
        if (terrainAt(career, x, y) !== COLOR_TERRAIN[warden.color]) continue;
        if (!free(x, y, 4)) continue;
        candidates.push({ x, y, d: dist({ x, y }, home) });
      }
    }
    candidates.sort((a, b) => b.d - a.d);
    const at = candidates.length ? pick(candidates.slice(0, 12), rng) : spot(COLOR_TERRAIN[warden.color], 3);
    sites.push({ id: warden.key, kind: "keep", name: warden.keep, color: warden.color, x: at.x, y: at.y, foe: warden.key });
  }

  DUNGEON_NAMES.forEach((name, i) => {
    const color = COLOR_KEYS[i % COLOR_KEYS.length];
    const at = spot(COLOR_TERRAIN[color], 4);
    sites.push({
      id: `dungeon${i}`, kind: "dungeon", name, color, x: at.x, y: at.y,
      rooms: 3 + (i % 3), cleared: false, found: false,
    });
  });

  for (let i = 0; i < 5; i++) {
    const color = COLOR_KEYS[i];
    const at = spot(COLOR_TERRAIN[color], 3);
    sites.push({ id: `shrine${i}`, kind: "shrine", name: pick(SHRINE_NAMES, rng), color, x: at.x, y: at.y, taken: false });
  }

  const spire = spot(null, 4);
  sites.push({ id: "spire", kind: "spire", name: "The Spire", color: "shard", x: spire.x, y: spire.y, hidden: true });
  return sites;
}

const terrainColorAt = (career, x, y) => TERRAIN[terrainAt(career, x, y)].color;

/* ---------- a starting collection ---------------------------------------

   A randomly generated pile with one colour it mostly is and one it flirts
   with. It is not a good deck. That is the point: what you turn it into is
   the game. */

export function starterCollection(rng, main, splash) {
  const collection = {};
  const add = (id, n = 1) => { collection[id] = (collection[id] || 0) + n; };
  add(COLORS[main].land, STARTER.lands - 3);
  add(COLORS[splash].land, 3);

  const pool = (color, rarity, kind) =>
    CARD_KEYS.filter((id) => {
      const c = CARDS[id];
      return c.color === color && c.type !== "land" && (c.rarity || 1) === rarity
        && (!kind || (kind === "creature" ? c.type === "creature" : c.type !== "creature"));
    });

  // Random, but not so random that it hands you a pile with nothing to play on
  // turn two. Bodies first, in a rough curve; the spells fill in around them.
  // Nothing lands more than DECK_MAX_COPIES times, because a starting pile you
  // cannot legally register is not a starting pile.
  const room = (id) => (collection[id] || 0) < DECK_MAX_COPIES;
  const take = (list) => {
    const open = list.filter(room);
    if (!open.length) return;
    add(pick(open, rng));
  };
  const bodies = pool(main, 1, "creature").slice().sort((a, b) => CARDS[a].cost - CARDS[b].cost);
  for (let i = 0; i < STARTER.creatures; i++) {
    take(bodies.slice(0, Math.max(2, Math.ceil(bodies.length * (0.4 + i * 0.12)))));
  }
  for (let i = 0; i < STARTER.spells; i++) take(pool(main, 1, "spell"));
  for (let i = 0; i < STARTER.uncommons; i++) take(pool(main, 2));
  for (let i = 0; i < STARTER.splash; i++) take(pool(splash, 1));
  add("wanderersblade");
  return collection;
}

/* The whole satchel, trimmed to a legal list: four of anything that is not a
   land. Anything over that stays in the satchel rather than quietly making the
   deck unregisterable. */
export const deckFromCollection = (collection) =>
  Object.entries(collection).flatMap(([id, n]) => {
    const cap = isLand(id) ? n : Math.min(n, DECK_MAX_COPIES);
    return Array.from({ length: cap }, () => id);
  });

export function deckProblems(deck) {
  const out = [];
  if (deck.length < DECK_MIN) out.push(`A deck is at least ${DECK_MIN} cards. Yours is ${deck.length}.`);
  const counts = {};
  for (const id of deck) counts[id] = (counts[id] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    if (n > DECK_MAX_COPIES && CARDS[id].type !== "land") {
      out.push(`${DECK_MAX_COPIES} copies of ${CARDS[id].name} is the limit.`);
    }
  }
  if (!deck.some(isLand)) out.push("No land. You will never cast anything.");
  return out;
}

/* ---------- a new career -------------------------------------------------- */

export function newCareer({ seed = Math.floor(Math.random() * 1e9), main = "ember", splash = "bramble" } = {}) {
  const rng = makeRng(seed);
  const career = {
    seed,
    rngState: 0,
    main, splash,
    map: null,
    sites: [],
    x: 0, y: 0,
    life: HERO_START_LIFE,
    maxLife: HERO_START_LIFE,
    gold: 60,
    leylines: 0,
    collection: {},
    deck: [],
    sigils: Object.fromEntries(COLOR_KEYS.map((c) => [c, 0])),
    wildmagic: Object.fromEntries(COLOR_KEYS.map((c) => [c, false])),
    kills: Object.fromEntries(COLOR_KEYS.map((c) => [c, 0])),
    wardens: Object.fromEntries(COLOR_KEYS.map((c) => [c, false])),
    monsters: [],
    ticks: 0,
    nextMonster: 1,
    emberstride: 0,
    seen: [],
    quest: null,
    dungeon: null,
    rumors: [],
    won: false,
    dead: false,
    log: [],
    stats: { duels: 0, wins: 0, losses: 0, rooms: 0 },
  };
  career.map = generateMap(rng);
  career.sites = placeSites(career, rng);
  const home = career.sites[0];
  career.x = home.x;
  career.y = home.y;
  career.seen.push(home.id);
  career.collection = starterCollection(rng, main, splash);
  career.deck = deckFromCollection(career.collection);
  career.rngState = rng.state();
  spawnMonsters(career, rng, MONSTER_CAP);
  career.rngState = rng.state();
  note(career, `You come down out of the hills above ${home.name}.`);
  return career;
}

export const rngOf = (career) => {
  const rng = makeRng(career.rngState || career.seed);
  return rng;
};
export const saveRng = (career, rng) => { career.rngState = rng.state(); };

function note(career, text, kind = "info") {
  career.log.push({ text, kind });
  if (career.log.length > 60) career.log.shift();
}

/* ---------- monsters ------------------------------------------------------

   Danger grows outward. Near home you meet the tier that a starting pile can
   beat; the far corners hold the things that guard a warden, and every warden
   you put down raises the floor everywhere. */

export function tierFor(career, x, y, rng) {
  const home = career.sites[0];
  const far = dist({ x, y }, home) / Math.max(MAP_W, MAP_H);
  const down = Object.values(career.wardens).filter(Boolean).length;
  const pressure = far * 2.6 + down * 0.45 + career.leylines * 0.08;
  const r = rng();
  if (pressure > 1.5) return r < 0.45 ? 3 : r < 0.85 ? 2 : 1;
  if (pressure > 0.85) return r < 0.3 ? 3 : r < 0.75 ? 2 : 1;
  return r < 0.08 ? 3 : r < 0.35 ? 2 : 1;
}

export function spawnMonsters(career, rng, n) {
  for (let i = 0; i < n; i++) {
    let placed = null;
    for (let t = 0; t < 200 && !placed; t++) {
      const x = 1 + Math.floor(rng() * (MAP_W - 2));
      const y = 1 + Math.floor(rng() * (MAP_H - 2));
      if (TERRAIN[terrainAt(career, x, y)].blocked) continue;
      if (siteAt(career, x, y) || monsterAt(career, x, y)) continue;
      if (dist({ x, y }, career) < 5) continue;
      placed = { x, y };
    }
    if (!placed) continue;
    const color = terrainColorAt(career, placed.x, placed.y);
    const tier = tierFor(career, placed.x, placed.y, rng);
    const options = Object.values(FOES).filter((f) => f.color === color && f.tier === tier);
    const foe = pick(options.length ? options : Object.values(FOES).filter((f) => f.tier === 1), rng);
    career.monsters.push({ id: career.nextMonster++, x: placed.x, y: placed.y, foe: foe.key, color, tier, stun: 0 });
  }
}

/* Most of what lives out here is not looking for you. A bog thing drifts, a
   crag raider will come three tiles for a fight, and only the tier-three
   things actually hunt - which is what turns the overworld into a routing
   problem you can win by reading it, rather than a corridor of ambushes. */
const HUNT_RANGE = { 1: 0, 2: 3, 3: 5 };

function moveMonsters(career, rng) {
  if (career.emberstride > 0) return null;
  let caught = null;
  for (const m of career.monsters) {
    if (m.stun > 0) { m.stun -= 1; continue; }
    const toward = dist(m, career) <= (HUNT_RANGE[m.tier] || 0);
    let dx = 0, dy = 0;
    if (toward && rng() < 0.7) {
      dx = Math.sign(career.x - m.x);
      dy = Math.sign(career.y - m.y);
    } else if (rng() < 0.3) {
      dx = Math.floor(rng() * 3) - 1;
      dy = Math.floor(rng() * 3) - 1;
    }
    if (!dx && !dy) continue;
    const nx = m.x + dx, ny = m.y + dy;
    if (TERRAIN[terrainAt(career, nx, ny)].blocked) continue;
    if (siteAt(career, nx, ny) || monsterAt(career, nx, ny)) continue;
    m.x = nx; m.y = ny;
    if (nx === career.x && ny === career.y) caught = m;
  }
  return caught;
}

/* ---------- walking ------------------------------------------------------- */

export function stepCost(career, x, y) {
  const t = TERRAIN[terrainAt(career, x, y)];
  return career.wildmagic.bramble ? 1 : t.cost;
}

/* One step. Returns what the step ran into, and the caller decides what
   screen that is. Stepping onto empty ground is free and reversible, so it
   happens on the tap; anything that costs you something asks first. */
export function walk(career, dx, dy) {
  if (career.dungeon || career.won || career.dead) return { kind: "blocked" };
  const nx = career.x + dx, ny = career.y + dy;
  if (TERRAIN[terrainAt(career, nx, ny)].blocked) return { kind: "blocked" };

  const rng = rngOf(career);
  career.x = nx; career.y = ny;
  const cost = stepCost(career, nx, ny);
  const result = advance(career, rng, cost);
  saveRng(career, rng);
  if (result) return result;

  const monster = monsterAt(career, nx, ny);
  if (monster) return { kind: "monster", monster };
  const site = siteAt(career, nx, ny);
  if (site && !(site.kind === "spire" && site.hidden)) {
    if (site.kind === "dungeon" && !site.found) { site.found = true; }
    return { kind: "site", site };
  }
  return { kind: "step" };
}

/* Time passing: monsters move, wounds close, and the world tops itself up. */
function advance(career, rng, ticks) {
  let caught = null;
  for (let i = 0; i < ticks; i++) {
    career.ticks += 1;
    if (career.emberstride > 0) career.emberstride -= 1;
    if (career.ticks % 3 === 0) caught = moveMonsters(career, rng) || caught;
    const every = career.wildmagic.bramble ? Math.ceil(REGEN_TICKS / 2) : REGEN_TICKS;
    if (career.ticks % every === 0 && career.life < career.maxLife) career.life += 1;
    if (career.ticks % 45 === 0) {
      const room = MONSTER_CAP - career.monsters.length;
      if (room > 0) spawnMonsters(career, rng, Math.min(room, 2));
    }
  }
  return caught ? { kind: "monster", monster: caught, ambush: true } : null;
}

/* Backing out of a fight.

   It costs coin and a few ticks, never health. Charging life for it was the
   single worst number in this file: anyone already hurt enough to want out
   paid for the privilege in the exact resource they were short of, and the
   only way out of that hole was to walk in a circle until it healed. Gold you
   can be out of. Life you cannot. */
export const FLEE_COST = 10;

export function flee(career, monster) {
  if (career.dungeon) return false;
  const rng = rngOf(career);
  career.gold = Math.max(0, career.gold - FLEE_COST);
  // Three tiles directly away, and it loses you for a while. Without that
  // stun a pursuer simply re-catches you on the next tick and fleeing is not
  // an escape, it is a slow way to bleed out.
  const dx = Math.sign(career.x - monster.x) || (rng() < 0.5 ? 1 : -1);
  const dy = Math.sign(career.y - monster.y) || (rng() < 0.5 ? 1 : -1);
  for (let i = 0; i < 3; i++) {
    const nx = career.x + dx, ny = career.y + dy;
    if (TERRAIN[terrainAt(career, nx, ny)].blocked || monsterAt(career, nx, ny) || siteAt(career, nx, ny)) break;
    career.x = nx; career.y = ny;
  }
  monster.stun = 10;
  advance(career, rng, 6);
  saveRng(career, rng);
  note(career, "You break off and put ground between you. Coin spills as you go.");
  return true;
}

export function useEmberstride(career) {
  if (!career.wildmagic.ember || career.sigils.ember < 1) return false;
  career.sigils.ember -= 1;
  career.emberstride = 30;
  note(career, "The air goes hot and still. Nothing on the map moves.");
  return true;
}

export function tidewalk(career, siteId) {
  if (!career.wildmagic.tide || career.sigils.tide < 1) return false;
  const site = career.sites.find((s) => s.id === siteId);
  if (!site || !career.seen.includes(siteId)) return false;
  career.sigils.tide -= 1;
  career.x = site.x; career.y = site.y;
  note(career, `The water takes you to ${site.name}.`);
  return true;
}

/* ---------- duels --------------------------------------------------------- */

export function heroPlayer(career) {
  return newPlayer({
    name: "You",
    sprite: "hero",
    deck: career.deck.slice(),
    life: career.life,
    maxLife: career.maxLife,
    colors: [career.main, career.splash],
  });
}

/* A warden's life is the only difficulty dial the player turns from outside a
   duel: every creature of its colour you put down is one point it has lost by
   the time you reach the keep. */
export function foeLife(career, foeKey) {
  const def = FOES[foeKey];
  if (def.tier !== 4) return def.life;
  return Math.max(WARDEN_LIFE_FLOOR, def.life - career.kills[def.color] * 2);
}

export function foePlayer(career, foeKey) {
  const def = FOES[foeKey];
  return newPlayer({
    name: def.name,
    sprite: def.art,
    deck: deckList(DECKS[def.deck]),
    life: foeLife(career, foeKey),
    maxLife: def.life,
    colors: [def.color],
  });
}

/* What each side is putting on the table.

   Yours is always a card you hold a spare copy of. That single restriction is
   what keeps the ante a wager instead of a slow dismantling: over a long run
   of bad duels the old rule ate the deck one irreplaceable card at a time and
   nothing you won ever caught up. Stake a duplicate and a loss costs you
   redundancy; when you have no duplicate to stake, it costs gold. */
export function anteFor(career, foeKey, rng) {
  const def = FOES[foeKey];
  const spares = Object.keys(career.collection)
    .filter((id) => career.collection[id] >= 2 && !isLand(id));
  const anyLand = Object.keys(career.collection).filter((id) => career.collection[id] >= 5 && isLand(id));
  const pool = spares.length ? spares : anyLand;
  return {
    theirs: pick(def.ante, rng),
    mine: pool.length ? pick(pool, rng) : null,
  };
}

export function winDuel(career, foeKey, ante, { takeAnte = true, lifeLeft = null } = {}) {
  const def = FOES[foeKey];
  const rng = rngOf(career);
  if (lifeLeft !== null) career.life = Math.max(1, lifeLeft);
  career.stats.duels += 1;
  career.stats.wins += 1;

  const gold = roll(def.gold, rng);
  career.gold += gold;
  if (def.tier <= 3) {
    career.kills[def.color] = (career.kills[def.color] || 0) + 1;
    if (career.quest && !career.quest.done && career.quest.kind === "hunt" && career.quest.color === def.color) {
      career.quest.progress += 1;
    }
  }
  if (def.tier === 4) {
    career.wardens[def.color] = true;
    note(career, `${def.name} kneels. The ${COLORS[def.color].name} keep is yours.`, "good");
    if (Object.values(career.wardens).every(Boolean)) {
      const spire = career.sites.find((s) => s.id === "spire");
      spire.hidden = false;
      note(career, "Five keeps are quiet. Something answers from the Spire.", "good");
    }
  }
  if (def.key === "shardlord") { career.won = true; note(career, "The Shardlord scatters. The Wildermark is yours.", "good"); }

  let prize = null;
  if (takeAnte) {
    prize = ante.theirs;
    addCard(career, prize);
    note(career, `You take ${CARDS[prize].name} off ${def.name}. +${gold} gold.`, "good");
  } else {
    const bonus = Math.round(gold * 0.6) + 20;
    career.gold += bonus;
    prize = null;
    const hidden = career.sites.filter((s) => s.kind === "dungeon" && !s.found);
    if (hidden.length) {
      const site = pick(hidden, rng);
      site.found = true;
      career.rumors.push(site.id);
      note(career, `You waive the stake. It talks: ${site.name} lies at ${site.x},${site.y}. +${gold + bonus} gold.`, "good");
    } else {
      note(career, `You waive the stake and take coin instead. +${gold + bonus} gold.`, "good");
    }
  }
  saveRng(career, rng);
  return { gold, prize };
}

/* Losing takes the stake and the walk home, never your health - a retry has to
   be at least as survivable as the fight that beat you.

   And the stake has a floor. A run of bad duels used to eat the deck a card at
   a time until there was no deck left to lose with, which is the one failure
   state a game like this must not have: once the list is down to its legal
   minimum the ante is paid in gold, and if there is no gold either, in
   nothing. You can be poor here. You cannot be disarmed. */
export function loseDuel(career, foeKey, ante) {
  const rng = rngOf(career);
  career.stats.duels += 1;
  career.stats.losses += 1;
  let lost = null, tithe = 0;

  if (career.wildmagic.rot || !ante.mine) {
    tithe = Math.min(career.gold, 25 + ((CARDS[ante.mine]?.price || 40) >> 1));
    career.gold -= tithe;
  } else {
    lost = ante.mine;
    removeCard(career, lost);
  }

  const town = nearestTown(career);
  career.x = town.x; career.y = town.y;
  if (!career.seen.includes(town.id)) career.seen.push(town.id);
  career.life = career.maxLife;
  career.dungeon = null;
  note(
    career,
    lost
      ? `You come to on the road to ${town.name}. ${CARDS[lost].name} is gone.`
      : `You come to on the road to ${town.name}. It took ${tithe} gold rather than a card.`,
    "bad",
  );
  saveRng(career, rng);
  return { lost, tithe, town };
}

export function nearestTown(career) {
  return career.sites
    .filter((s) => s.kind === "town")
    .sort((a, b) => dist(a, career) - dist(b, career))[0];
}

export function addCard(career, id, n = 1) {
  career.collection[id] = (career.collection[id] || 0) + n;
}

/* A lost card comes out of the deck first, so the list you play never claims
   copies the collection no longer holds. */
export function removeCard(career, id) {
  if (!career.collection[id]) return false;
  career.collection[id] -= 1;
  if (career.collection[id] <= 0) delete career.collection[id];
  const inDeck = career.deck.filter((c) => c === id).length;
  if (inDeck > (career.collection[id] || 0)) {
    career.deck.splice(career.deck.lastIndexOf(id), 1);
  }
  return true;
}

/* ---------- towns --------------------------------------------------------- */

export function arriveTown(career, site) {
  if (!career.seen.includes(site.id)) career.seen.push(site.id);
  if (career.wildmagic.sun && career.life < career.maxLife) {
    career.life = career.maxLife;
    note(career, `${site.name} takes you in. Sanctuary closes every wound.`, "good");
  }
  // A merchant lays out new stock while you are away. Without this the towns
  // empty out permanently after the first shopping trip and gold stops being
  // worth anything, which quietly kills the whole progression.
  if (!site.stock || career.ticks - (site.stockedAt || -999) > 110) restock(career, site, true);
  if (!site.quest) site.quest = rollQuest(career, site);
}

export function restock(career, site, free = false) {
  if (!free) {
    if (career.gold < PRICES.restock) return false;
    career.gold -= PRICES.restock;
  }
  const rng = rngOf(career);
  const weight = (id) => {
    const c = CARDS[id];
    if (c.type === "land") return c.any ? 1 : 0;
    const rare = c.rarity || 1;
    let w = rare === 1 ? 6 : rare === 2 ? 3 : 1;
    if (c.color === site.color) w *= 3;
    // A merchant who has watched you come and go stocks what you can cast.
    if (c.color === career.main || c.color === career.splash) w *= 2;
    if (!c.color) w *= 2;
    return w;
  };
  const pool = [];
  for (const id of CARD_KEYS) for (let i = 0; i < weight(id); i++) pool.push(id);
  const stock = [];
  let guard = 0;
  while (stock.length < 8 && guard++ < 400) {
    const id = pick(pool, rng);
    if (!stock.includes(id)) stock.push(id);
  }
  // A town always has its own land for sale; nobody should be stuck on mana.
  site.stock = stock;
  site.stockedAt = career.ticks;
  site.landPrice = 18;
  saveRng(career, rng);
  return true;
}

export function buyCard(career, site, id) {
  const price = CARDS[id].price || 40;
  if (career.gold < price) return false;
  career.gold -= price;
  addCard(career, id);
  site.stock = site.stock.filter((s) => s !== id);
  return true;
}

export function buyLand(career, site, n = 1) {
  const cost = site.landPrice * n;
  if (career.gold < cost) return false;
  career.gold -= cost;
  addCard(career, COLORS[site.color].land, n);
  return true;
}

export function sellCard(career, id) {
  if (!career.collection[id]) return false;
  const price = Math.max(4, Math.round((CARDS[id].price || 20) * PRICES.sellShare));
  removeCard(career, id);
  career.gold += price;
  return price;
}

export function bindLeyline(career) {
  const cost = PRICES.leyline(career.leylines);
  if (career.gold < cost || career.maxLife >= HERO_MAX_LIFE) return false;
  career.gold -= cost;
  career.leylines += 1;
  career.maxLife += LEYLINE_LIFE;
  career.life += LEYLINE_LIFE;
  note(career, `The leyline takes. You can hold ${career.maxLife} life now.`, "good");
  return true;
}

export const innPrice = (career) => PRICES.inn(career.leylines);

/* One flat price for a night, however badly you came in. */
export function restAtInn(career) {
  const missing = career.maxLife - career.life;
  const cost = innPrice(career);
  if (missing <= 0 || career.gold < cost) return 0;
  career.gold -= cost;
  career.life = career.maxLife;
  return missing;
}

function rollQuest(career, site) {
  const rng = rngOf(career);
  const kind = pick(QUEST_KINDS, rng).kind;
  const color = pick(COLOR_KEYS, rng);
  const quest = {
    town: site.id, kind, color,
    need: kind === "purse" ? 120 + Math.floor(rng() * 5) * 30 : 2 + Math.floor(rng() * 3),
    progress: 0, done: false,
  };
  saveRng(career, rng);
  return quest;
}

export function takeQuest(career, site) {
  if (career.quest && !career.quest.done) return false;
  career.quest = { ...site.quest, town: site.id };
  return true;
}

export function questReady(career) {
  const q = career.quest;
  if (!q || q.done) return false;
  if (q.kind === "purse") return career.gold >= q.need;
  return q.progress >= q.need;
}

export function turnInQuest(career, site) {
  const q = career.quest;
  if (!q || q.town !== site.id || !questReady(career)) return null;
  if (q.kind === "purse") career.gold -= q.need;
  q.done = true;
  career.sigils[q.color] += 1;
  const gold = q.kind === "purse" ? 0 : 40 + q.need * 15;
  career.gold += gold;
  site.quest = rollQuest(career, site);
  note(career, `${COLORS[q.color].name} sigil earned.`, "good");
  return { sigil: q.color, gold };
}

export function learnWildmagic(career, color) {
  const cost = 2;
  if (career.wildmagic[color] || career.sigils[color] < cost) return false;
  career.sigils[color] -= cost;
  career.wildmagic[color] = true;
  return true;
}

/* ---------- shrines and dungeons ----------------------------------------- */

export function takeShrine(career, site) {
  if (site.taken) return false;
  site.taken = true;
  career.sigils[site.color] += 1;
  note(career, `The stone gives up a ${COLORS[site.color].name} sigil.`, "good");
  return true;
}

/* A dungeon is the one place your life total is the whole difficulty: nothing
   heals between rooms, and the prize only lands if you walk out the far end. */
export function enterDungeon(career, site) {
  if (site.cleared) return null;
  const rng = rngOf(career);
  const rooms = [];
  for (let i = 0; i < site.rooms; i++) {
    const tier = i === site.rooms - 1 ? 3 : i === 0 ? 1 : 2;
    const options = Object.values(FOES).filter((f) => f.color === site.color && f.tier === tier);
    rooms.push(pick(options, rng).key);
  }
  career.dungeon = { site: site.id, name: site.name, color: site.color, rooms, at: 0, gold: 0 };
  saveRng(career, rng);
  note(career, `You go down into ${site.name}.`);
  return career.dungeon;
}

export function clearRoom(career, lifeLeft) {
  const d = career.dungeon;
  if (!d) return null;
  const rng = rngOf(career);
  const beaten = d.rooms[d.at];
  const def = FOES[beaten];
  d.at += 1;
  career.stats.rooms += 1;
  career.life = Math.max(1, lifeLeft);

  // A room is a kill like any other: it pays, and it bleeds the warden whose
  // colour the dungeon belongs to. That is the whole reason to go down there
  // rather than hunt the same creature in the open, where nothing is chasing
  // you and you can walk away between fights.
  const gold = Math.round(roll(def.gold, rng) * 0.7);
  career.gold += gold;
  d.gold += gold;
  career.kills[def.color] = (career.kills[def.color] || 0) + 1;
  if (career.quest && !career.quest.done) {
    if (career.quest.kind === "delve") career.quest.progress += 1;
    if (career.quest.kind === "hunt" && career.quest.color === def.color) career.quest.progress += 1;
  }
  saveRng(career, rng);
  if (d.at >= d.rooms.length) return finishDungeon(career);
  return { done: false, next: d.rooms[d.at], gold };
}

function finishDungeon(career) {
  const d = career.dungeon;
  const rng = rngOf(career);
  const site = career.sites.find((s) => s.id === d.site);
  site.cleared = true;
  const gold = 90 + d.rooms.length * 45;
  career.gold += gold;
  career.sigils[d.color] += 1;
  const rares = CARD_KEYS.filter((id) => CARDS[id].rarity === 3 && (CARDS[id].color === d.color || !CARDS[id].color));
  const prize = pick(rares.length ? rares : CARD_KEYS.filter((id) => CARDS[id].rarity === 2), rng);
  addCard(career, prize);
  career.dungeon = null;
  saveRng(career, rng);
  note(career, `${site.name} is empty. ${CARDS[prize].name}, a ${COLORS[d.color].name} sigil and ${gold} gold.`, "good");
  return { done: true, gold, prize, sigil: d.color };
}

export function leaveDungeon(career) {
  if (!career.dungeon) return false;
  note(career, `You climb back out of ${career.dungeon.name} with nothing to show for it.`);
  career.dungeon = null;
  return true;
}

/* ---------- save --------------------------------------------------------- */

export const SAVE_KEY = "wildermark.career.v1";

export function serialize(career) {
  return JSON.stringify(career);
}

export function deserialize(text) {
  try {
    const career = JSON.parse(text);
    return career && career.map && career.sites ? career : null;
  } catch { return null; }
}
