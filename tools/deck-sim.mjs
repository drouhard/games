/* Balance simulator for Deckdelve.

   The duel, the dungeon and the run state are all DOM-free, so a whole career
   - walking the fog, fighting, levelling, shopping, three keepers - can be
   played thousands of times in Node.

       node tools/deck-sim.mjs [runs]

   What good output looks like: a fresh account clearing 12-25% of runs and a
   fully unlocked one 30-55% (the bot plays worse than a person, so those are
   a floor, not a ceiling); no class more than ~15 points off the others;
   duels of about 3 rounds, elites 4-6, keepers 4-7; almost nobody dying on
   floor one; characters reaching the last keeper around level 8; and
   stalemates at zero - a duel neither side can win is a tuning failure, not a
   hard fight.

   Not part of serving the site - nothing under games/ imports it. */

import { CARDS, FLOORS } from "../games/deckdelve/data.js";
import * as combat from "../games/deckdelve/combat.js";
import * as dungeon from "../games/deckdelve/dungeon.js";
import * as run from "../games/deckdelve/run.js";

/* ---------- a reasonable, non-optimal duellist --------------------------- */

// How much a card is worth to a draft or a shop. Deliberately blunt: a real
// player reads synergy, so these results are a floor.
const VALUE = {
  hew: 4, bulwark: 4, sidestep: 3, warcry: 4, shieldbash: 3, cleaver: 5,
  ironskin: 3, laststand: 5, juggernaut: 5,
  firebolt: 5, frost: 4, channel: 3, arcaneshield: 4, siphon: 4, prism: 3,
  meteor: 5, leyline: 5,
  nettle: 3, venomspray: 4, thorncoat: 3, regrowth: 3, cull: 4, fang: 4,
  blight: 5, brambleveil: 4,
  dagger: 2, buckler: 2, torch: 3, bandage: 2, whetstone: 3, tonic: 2,
};

const isGuard = (def) => def.effects?.some((e) => e.kind === "defense");
const gainsRes = (def) => def.effects?.some((e) => e.kind === "res" || e.kind === "flow");

/* Cards are free to play, so a turn is about order, modes and whether to
   spend the pool. Resource first, then guards (Shield Bash reads them), then
   everything else. */
function fightRound(state) {
  for (let guard = 0; guard < 30; guard++) {
    const hand = state.hand.map((card, index) => ({ card, index, def: combat.defOf(card) }));
    if (!hand.length) break;
    const incoming = () => Math.max(0, state.foe.attack - state.hero.defense);
    const lethal = () => state.hero.attack - state.foe.defense >= state.foe.hp;

    const playable = hand.filter((c) => (c.def.cost || 0) <= state.hero.res);
    if (!playable.length) break;

    let choice = playable.find((c) => gainsRes(c.def) && !c.def.cost);
    if (!choice && incoming() > 0 && !lethal()) choice = playable.find((c) => isGuard(c.def) && !c.def.modes);
    if (!choice) choice = playable.find((c) => c.def.cost > 0 && state.hero.res >= c.def.cost);
    if (!choice) choice = playable[0];

    // Modal cards: shield up when the swing would land, otherwise hit.
    let mode = 0;
    if (choice.def.modes) {
      const defensive = choice.def.modes.findIndex((m) => m.effects.some((e) => e.kind === "defense"));
      mode = incoming() > 3 && defensive >= 0 && !lethal() ? defensive : 0;
    }
    // Ask the engine whether the play happened. Counting the hand instead
    // silently ends the turn on any card that draws as much as it costs.
    if (!combat.playCard(state, choice.index, mode).length) break;
  }
}

/* A duel that runs past the cap is a stalemate: nobody can punch through the
   other's armour. It counts as a loss, and it is reported, because a game
   full of them is a tuning failure rather than a hard fight. */
function duel(state, cap = 30) {
  while (!state.over && state.round <= cap) {
    fightRound(state);
    combat.endRound(state);
  }
  return { rounds: state.round, stalemate: !state.over };
}

/* ---------- walking the floor -------------------------------------------- */

function path(floor, target) {
  const key = (x, y) => `${x},${y}`;
  const from = new Map([[key(floor.x, floor.y), null]]);
  const queue = [[floor.x, floor.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === target.x && y === target.y) {
      const steps = [];
      let at = key(x, y);
      while (from.get(at)) {
        const [px, py] = from.get(at);
        steps.unshift(at.split(",").map(Number));
        at = key(px, py);
      }
      return steps;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tile = dungeon.tileAt(floor, x + dx, y + dy);
      if (!tile || !tile.known || tile.type === "wall" || from.has(key(tile.x, tile.y))) continue;
      from.set(key(tile.x, tile.y), [x, y]);
      queue.push([tile.x, tile.y]);
    }
  }
  return null;
}

function nearest(floor, test) {
  const options = floor.tiles.flat().filter((t) => t.known && test(t));
  let best = null;
  for (const tile of options) {
    const route = path(floor, tile);
    if (route && (!best || route.length < best.route.length)) best = { tile, route };
  }
  return best;
}

/* Where the bot wants to go next, in priority order. */
function nextTarget(state, meta) {
  const floor = state.floor;
  const hurt = state.hp < state.maxHp * 0.5;
  const rich = state.gold >= 30;

  if (hurt) {
    const fire = nearest(floor, (t) => t.type === "fire");
    if (fire) return fire;
  }
  const shop = rich ? nearest(floor, (t) => t.type === "shop") : null;
  if (shop) return shop;
  const room = nearest(floor, (t) => t.type === "chest" || t.type === "altar");
  if (room) return room;

  const fightable = nearest(floor, (t) => t.type === "foe" || (t.type === "elite" && state.level >= 3));
  if (fightable && state.hp > state.maxHp * 0.25) return fightable;

  // Nothing known worth doing: push into the fog.
  const edge = nearest(floor, (t) => t.type === "floor" &&
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const n = dungeon.tileAt(floor, t.x + dx, t.y + dy);
      return n && !n.known;
    }));
  if (edge) return edge;

  // Nothing left but the keeper: patch up first if there is anywhere to do it.
  if (state.hp < state.maxHp * 0.7) {
    const fire = nearest(floor, (t) => t.type === "fire");
    if (fire) return fire;
  }
  return nearest(floor, (t) => t.type === "boss" || t.type === "stairs");
}

/* ---------- rooms -------------------------------------------------------- */

function draftBest(state, ids) {
  return ids.map((id) => ({ id, score: VALUE[id] || 1 })).sort((a, b) => b.score - a.score)[0];
}

function takeLevels(state, meta, rng, log) {
  while (state.pendingLevels > 0) {
    state.pendingLevels -= 1;
    const options = run.levelOptions(state, meta, rng);
    const cards = options.filter((o) => o.kind === "card");
    const best = cards.length ? draftBest(state, cards.map((c) => c.id)) : null;
    // Past sixteen cards a mediocre pick is worse than a boon.
    const wantBoon = !best || best.score < (state.deck.length > 16 ? 4 : 3);
    const choice = wantBoon ? options.find((o) => o.kind === "boon") : { kind: "card", id: best.id };
    if (choice.kind === "boon" && run.boonById(choice.boon).pick === "burn") {
      const index = state.deck.findIndex((c) => !c.upgraded && isBasic(c.id));
      if (index >= 0 && state.deck.length > 8) run.removeCard(state, index);
      else run.takeLevelOption(state, options.find((o) => o.kind === "card") || choice);
    } else {
      run.takeLevelOption(state, choice);
    }
    log.levels += 1;
  }
}

const BASICS = new Set(["slash", "guard", "spark", "ward", "rake", "bark"]);
const isBasic = (id) => BASICS.has(id);

function visitRoom(state, meta, tile, rng) {
  if (tile.type === "fire") {
    run.restAtFire(state);
    return;
  }
  if (tile.type === "chest") {
    const loot = run.chestLoot(state, meta, rng);
    const best = draftBest(state, loot.cards);
    if (best.score >= 4 && state.deck.length < 18) run.addCard(state, { id: best.id });
    else state.gold += loot.gold;
    return;
  }
  if (tile.type === "altar") {
    const index = state.deck.findIndex((c) => isBasic(c.id) && !c.upgraded);
    if (state.deck.length > 9 && index >= 0) run.removeCard(state, index);
    else {
      const up = state.deck.findIndex((c) => run.canUpgrade(c) && !isBasic(c.id));
      run.upgradeCard(state, up >= 0 ? up : Math.max(0, state.deck.findIndex((c) => run.canUpgrade(c))));
    }
    return;
  }
  if (tile.type === "shop") {
    const stock = run.shopStock(state, meta, rng);
    if (state.hp < state.maxHp * 0.6 && run.spend(state, stock.potion)) state.potions += 1;
    for (const item of stock.cards.slice().sort((a, b) => (VALUE[b.id] || 1) - (VALUE[a.id] || 1))) {
      if ((VALUE[item.id] || 1) >= 4 && run.spend(state, item.price)) run.addCard(state, { id: item.id });
    }
    const index = state.deck.findIndex((c) => isBasic(c.id) && !c.upgraded);
    if (state.deck.length > 12 && index >= 0 && run.spend(state, stock.burn)) run.removeCard(state, index);
  }
}

/* ---------- one run ------------------------------------------------------ */

function playRun(classId, meta, rng = Math.random) {
  const state = run.newRun(classId, meta, rng);
  const log = { levels: 0, duels: [], steps: 0, deathFloor: null, stalemates: 0 };

  for (let guard = 0; !state.over && guard < 900; guard++) {
    const floor = state.floor;
    const target = nextTarget(state, meta);
    if (!target) { run.loseRun(state); log.deathFloor = state.floorIndex; break; }

    // An empty route means the bot is already standing on what it wanted.
    if (!target.route.length) {
      resolveTile(state, meta, floor, target.tile, rng, log);
      continue;
    }
    for (const [x, y] of target.route) {
      const tile = dungeon.tileAt(floor, x, y);
      dungeon.step(floor, tile);
      log.steps += 1;
      if (tile === target.tile) {
        resolveTile(state, meta, floor, tile, rng, log);
        break;
      }
    }
  }
  if (!state.over) { run.loseRun(state); log.deathFloor = state.floorIndex; log.stuck = true; }
  return { state, log };
}

/* Whatever the tile turns out to be, dealt with in place. */
function resolveTile(state, meta, floor, tile, rng, log) {
  if (tile.type === "foe" || tile.type === "elite" || tile.type === "boss") {
    const spec = dungeon.foeFor(tile, rng);
    const foe = combat.makeFoe(spec.key, spec);
    const fight = combat.startCombat({ hero: run.heroFor(state), deck: state.deck, foe, rng });
    const { rounds, stalemate } = duel(fight);
    state.hp = fight.hero.hp;
    if (stalemate) log.stalemates += 1;
    if (fight.over !== "win") {
      run.loseRun(state);
      log.deathFloor = state.floorIndex;
      log.deathTo = foe.name;
      return;
    }
    log.duels.push({ kind: tile.type, floor: state.floorIndex, rounds });
    run.grantKill(state, foe);
    takeLevels(state, meta, rng, log);
    dungeon.clearTile(floor, tile);
    if (state.potions && state.hp < state.maxHp * 0.4) run.drinkPotion(state);
    return;
  }
  if (tile.type === "stairs") {
    run.descend(state, meta, rng);
    return;
  }
  if (tile.type === "floor") return; // an exploration step, nothing to do
  visitRoom(state, meta, tile, rng);
  dungeon.clearTile(floor, tile);
}

/* ---------- report ------------------------------------------------------- */

const N = Number(process.argv[2]) || 300;
const full = { ...run.newMeta(), unlocked: ["vigor", "arsenal", "warden", "purse", "grip", "scout"] };

for (const account of [{ label: "fresh account (no unlocks)", meta: run.newMeta() },
                       { label: "everything unlocked", meta: full }]) {
  console.log(`\n=== ${account.label} ===`);
  console.log("class    cleared  avg floor  level  deck  lore   deaths f1/f2/f3   rounds foe/elite/boss");

  for (const cls of [{ id: "knight", name: "Knight" }, { id: "adept", name: "Adept" }, { id: "warden", name: "Warden" }]) {
    if (cls.id === "warden" && !run.hasUnlock(account.meta, "warden")) continue;
    let cleared = 0, floors = 0, levels = 0, deck = 0, lore = 0, stale = 0;
    const deaths = [0, 0, 0];
    const rounds = { foe: [], elite: [], boss: [] };

    for (let i = 0; i < N; i++) {
      const { state, log } = playRun(cls.id, account.meta, Math.random);
      if (state.over === "cleared") cleared++;
      else deaths[Math.min(2, log.deathFloor ?? state.floorIndex)]++;
      floors += state.floorIndex + 1;
      levels += state.level;
      deck += state.deck.length;
      lore += state.lore;
      stale += log.stalemates;
      for (const d of log.duels) rounds[d.kind === "elite" ? "elite" : d.kind === "boss" ? "boss" : "foe"].push(d.rounds);
    }
    const avg = (list) => (list.length ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(1) : "-");
    console.log(
      `${cls.name.padEnd(8)} ${String(Math.round(cleared / N * 100)).padStart(4)}%  ` +
      `${(floors / N).toFixed(2).padStart(9)}  ${(levels / N).toFixed(1).padStart(5)}  ` +
      `${(deck / N).toFixed(1).padStart(4)}  ${(lore / N).toFixed(1).padStart(4)}   ` +
      `${deaths.join(" / ").padEnd(16)} ${avg(rounds.foe)}/${avg(rounds.elite)}/${avg(rounds.boss)}` +
      `   stalemates ${(stale / N).toFixed(2)}`
    );
  }
}
