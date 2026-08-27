/* Balance simulator for Wildermark.

   The duel, the map and the career are all DOM-free, so a whole life in the
   Wildermark - walking, hunting, shopping, binding leylines, delving, and
   eventually kicking in five keep doors - can be played thousands of times in
   Node.

       node tools/wild-sim.mjs [careers] [--duels] [--verbose]

   What good output looks like, measured over 400 careers:
     * duels around 15 turns - eight apiece - and nothing hitting the turn cap
     * a ladder you can feel: ~70% against the roadside, ~37% in the deep
       country, ~32% against a warden
     * ~20% of careers sweeping all five wardens and taking the Spire, in
       about a thousand steps and 120 duels
     * nobody stuck: a career that ends because the bot could not find a step
       is a map bug, not a hard game

   Those percentages are a floor, not a target. The bot registers its deck by
   raw card value with no read of synergy, never spends a wildmagic, walks
   greedily rather than planning a route, and picks its fights off a table of
   thresholds. A person clears far more than one career in five.

   Not part of serving the site - nothing under games/ imports it. */

import { CARDS, COLORS, COLOR_KEYS, cardValue, isLand } from "../games/wildermark/cards.js";
import { DECKS, FOES, PRICES, deckList } from "../games/wildermark/data.js";
import * as duel from "../games/wildermark/duel.js";
import * as ai from "../games/wildermark/ai.js";
import * as world from "../games/wildermark/world.js";

const args = process.argv.slice(2);
const CAREERS = Number(args.find((a) => !a.startsWith("--"))) || 200;
const VERBOSE = args.includes("--verbose");
const TURN_CAP = 60;
/* Roughly what a real sitting looks like on the overworld. If a career cannot
   be finished inside this many steps the game is a grind, whatever the win
   rate eventually says. */
const STEP_BUDGET = 2000;

/* ---------- one duel, both seats played by the bot ------------------------ */

function playDuel(heroPlayer, foePlayer, rng, heroSkill, foeSkill, heroFirst) {
  const state = duel.newDuel({ hero: heroPlayer, foe: foePlayer, rng, heroFirst });
  ai.botMulligan(state, 0);
  ai.botMulligan(state, 1);
  duel.keepHands(state);
  let guard = 0;
  while (!state.over && guard++ < 3000) {
    if (state.turn > TURN_CAP) { state.capped = true; break; }
    if (!ai.botAct(state, state.priority === 0 ? heroSkill : foeSkill)) break;
  }
  return state;
}

function tally(out, foeKey, win) {
  const t = FOES[foeKey].tier;
  const row = (out.byTier[t] ||= { n: 0, w: 0 });
  row.n += 1;
  if (win) row.w += 1;
}

function duelCareer(career, foeKey, rng) {
  const hero = world.heroPlayer(career);
  const foe = world.foePlayer(career, foeKey);
  const state = playDuel(hero, foe, rng, 0.92, FOES[foeKey].skill, rng() < 0.5);
  return {
    win: state.over?.winner === 0,
    lifeLeft: Math.max(1, state.players[0].life),
    turns: state.turn,
    capped: !!state.capped,
    stuck: !state.over && !state.capped,
  };
}

/* ---------- the bot's deck ------------------------------------------------

   Blunt on purpose: two colours, everything colourless it owns, best spells
   first, and a mana base split by how many pips each colour actually wants.
   A person builds better than this, which is why the win rates below are a
   floor. */

function buildDeck(career) {
  const owned = career.collection;
  const spells = Object.keys(owned).filter((id) => !isLand(id));
  const byColor = {};
  for (const id of spells) {
    const c = CARDS[id].color;
    if (!c) continue;
    byColor[c] = (byColor[c] || 0) + cardValue(id) * owned[id];
  }
  const ranked = COLOR_KEYS.slice().sort((a, b) => (byColor[b] || 0) - (byColor[a] || 0));
  const [main, splash] = ranked;
  career.main = main;
  career.splash = splash;

  const usable = spells
    .filter((id) => !CARDS[id].color || CARDS[id].color === main || CARDS[id].color === splash)
    .sort((a, b) => cardValue(b) - cardValue(a));

  // A curve, not just the sixteen most expensive things it owns: a deck of
  // bombs never casts any of them.
  const deck = [];
  const room = { 5: 4, 4: 5 };
  const band = (id) => (CARDS[id].cost >= 5 ? 5 : CARDS[id].cost === 4 ? 4 : 0);
  let mainPips = 0, splashPips = 0;
  for (const id of usable) {
    if (deck.length >= 16) break;
    const b = band(id);
    const copies = Math.min(owned[id], 4);
    for (let i = 0; i < copies && deck.length < 16; i++) {
      if (b && room[b] <= 0) break;
      if (b) room[b] -= 1;
      deck.push(id);
      if (CARDS[id].color === main) mainPips += CARDS[id].pips || 0;
      if (CARDS[id].color === splash) splashPips += CARDS[id].pips || 0;
    }
  }
  const landsWanted = 11;
  const total = mainPips + splashPips || 1;
  let mainLands = Math.round((mainPips / total) * landsWanted);
  mainLands = Math.max(6, Math.min(landsWanted, mainLands));
  const put = (id, n) => {
    const have = owned[id] || 0;
    for (let i = 0; i < Math.min(n, have); i++) deck.push(id);
    return Math.min(n, have);
  };
  const gotMain = put(COLORS[main].land, mainLands);
  const gotSplash = put(COLORS[splash].land, landsWanted - mainLands);
  put("confluence", landsWanted - gotMain - gotSplash);
  // Whatever is left over: any land at all beats being short.
  for (const id of Object.keys(owned)) {
    if (!isLand(id)) continue;
    let held = deck.filter((c) => c === id).length;
    while (deck.length < 26 && held < owned[id]) { deck.push(id); held++; }
  }
  career.deck = deck;
  return deck;
}

/* ---------- walking to somewhere ----------------------------------------- */

/* Walks a step toward something, going around anything it does not want to
   duel. Routing around a monster you are not ready for is the whole overworld
   game, so the bot has to do it too - a bot that blunders into every tier-two
   on the map and then runs away is measuring the flee button, not the game. */
function stepToward(career, target, rng, avoid) {
  const dx = Math.sign(target.x - career.x);
  const dy = Math.sign(target.y - career.y);
  const tries = [[dx, dy], [dx, 0], [0, dy], [dx, -dy], [-dx, dy], [0, dy || 1], [dx || 1, 0]];
  const ok = (ax, ay) => {
    if (!world.passable(career, career.x + ax, career.y + ay)) return false;
    const m = world.monsterAt(career, career.x + ax, career.y + ay);
    return !(m && avoid(m));
  };
  for (const [ax, ay] of tries) {
    if (!ax && !ay) continue;
    if (ok(ax, ay)) return world.walk(career, ax, ay);
  }
  // Nothing forward is clear: sidestep anywhere that is.
  for (let ax = -1; ax <= 1; ax++) {
    for (let ay = -1; ay <= 1; ay++) {
      if ((ax || ay) && ok(ax, ay)) return world.walk(career, ax, ay);
    }
  }
  // Boxed in by sea: shove in a random direction rather than deadlock.
  for (let i = 0; i < 8; i++) {
    const ax = Math.floor(rng() * 3) - 1, ay = Math.floor(rng() * 3) - 1;
    if ((ax || ay) && world.passable(career, career.x + ax, career.y + ay)) return world.walk(career, ax, ay);
  }
  return { kind: "blocked" };
}

/* How dangerous a fight looks to a bot that will not read its own hand. */
function threat(career, foeKey) {
  const def = FOES[foeKey];
  const mine = career.deck.reduce((n, id) => n + cardValue(id), 0) / Math.max(1, career.deck.length);
  const theirs = deckList(DECKS[def.deck]).reduce((n, id) => n + cardValue(id), 0) / 26;
  return theirs / Math.max(0.5, mine) + def.tier * 0.25;
}

/* A person picks their fights by how far along they are, not by arithmetic on
   a deck list, so the bot does too: the roadside always, the deep country once
   there is a deck, the tier-three things only when properly kitted. */
function willFight(career, foeKey) {
  const tier = FOES[foeKey].tier;
  const owned = Object.values(career.collection).reduce((a, b) => a + b, 0);
  if (tier === 1) return true;
  if (tier === 2) return career.leylines >= 3 || owned >= 34;
  if (tier === 3) return career.leylines >= 3 && owned >= 36;
  return true;
}

/* ---------- a town visit -------------------------------------------------- */

function doTown(career, site, rng, out) {
  const before = career.gold;
  world.arriveTown(career, site);
  if (career.quest && world.questReady(career) && career.quest.town === site.id) world.turnInQuest(career, site);
  if (!career.quest || career.quest.done) world.takeQuest(career, site);

  for (const color of COLOR_KEYS) {
    if (!career.wildmagic[color] && career.sigils[color] >= 2) world.learnWildmagic(career, color);
  }
  if (career.life < career.maxLife) { const g = career.gold; world.restAtInn(career); out.spentInn += g - career.gold; }

  // Leylines first while they are cheap: a point of life is worth more than
  // any single card early on.
  while (career.gold > PRICES.leyline(career.leylines) + 60) {
    const g = career.gold;
    if (!world.bindLeyline(career)) break;
    out.spentLey += g - career.gold;
  }

  let shopped = 0;
  while (shopped < 10) {
    const stock = (site.stock || []).slice().sort((a, b) => cardValue(b) - cardValue(a));
    const want = stock.find((id) => {
      const c = CARDS[id];
      if (career.gold < (c.price || 40) + 15) return false;
      if (c.type === "land") return true;
      return !c.color || c.color === career.main || c.color === career.splash;
    });
    if (!want) break;
    const g = career.gold;
    world.buyCard(career, site, want);
    out.spentShop += g - career.gold;
    out.bought += 1;
    shopped += 1;
  }
  if (career.gold > 260 && career.collection[COLORS[site.color].land]) world.buyLand(career, site, 2);
  buildDeck(career);
  out.townVisits += 1;
  void before;
}

/* ---------- what to do next ----------------------------------------------- */

function chooseGoal(career, rng) {
  const towns = career.sites.filter((s) => s.kind === "town");
  const hurt = career.life <= career.maxLife * 0.6;
  if (hurt) return towns.sort((a, b) => hyp(a, career) - hyp(b, career))[0];

  if (career.won) return null;
  const allDown = Object.values(career.wardens).every(Boolean);
  if (allDown) return career.sites.find((s) => s.id === "spire");

  // A keep outranks everything once its colour has bled and there is life in
  // the tank to spend. Leaving it below the errands is how a bot ends a career
  // rich, well read and having knocked on two doors.
  const ready = career.sites
    .filter((s) => s.kind === "keep" && !career.wardens[s.color])
    .filter((s) => career.kills[s.color] >= 3 && career.leylines >= 3)
    .sort((a, b) => hyp(a, career) - hyp(b, career))[0];
  if (ready) return ready;

  const shrine = career.sites.filter((s) => s.kind === "shrine" && !s.taken)
    .sort((a, b) => hyp(a, career) - hyp(b, career))[0];
  if (shrine && hyp(shrine, career) < 10) return shrine;

  const dungeon = career.sites.filter((s) => s.kind === "dungeon" && !s.cleared)
    .sort((a, b) => hyp(a, career) - hyp(b, career))[0];
  if (dungeon && career.leylines >= 2 && hyp(dungeon, career) < 10 && career.life > career.maxLife * 0.85) return dungeon;

  // Otherwise hunt: the nearest monster of the colour we most want to bleed.
  const weakest = COLOR_KEYS.filter((c) => !career.wardens[c])
    .sort((a, b) => career.kills[b] - career.kills[a])[0];
  const prey = career.monsters
    .filter((m) => willFight(career, m.foe) && !m.stun)
    .sort((a, b) => (a.color === weakest ? -3 : 0) + hyp(a, career) - ((b.color === weakest ? -3 : 0) + hyp(b, career)))[0];
  if (prey) return prey;
  return towns[Math.floor(rng() * towns.length)];
}

const hyp = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/* ---------- a whole career ------------------------------------------------ */

function runCareer(seed) {
  const rng = duel.makeRng(seed);
  const colors = COLOR_KEYS.slice().sort(() => rng() - 0.5);
  const career = world.newCareer({ seed, main: colors[0], splash: colors[1] });
  buildDeck(career);
  const out = { seed, wardens: 0, won: false, steps: 0, duels: 0, wins: 0, stuck: false, capped: 0, turns: [], deaths: 0, byTier: {}, spentInn: 0, spentLey: 0, spentShop: 0, bought: 0, townVisits: 0, earned: 0 };

  let steps = 0;
  while (steps++ < STEP_BUDGET && !career.won) {
    if (career.dungeon) {
      const d = career.dungeon;
      const res = duelCareer(career, d.rooms[d.at], rng);
      out.duels++; out.turns.push(res.turns);
      if (res.capped) out.capped++;
      if (res.stuck) { out.stuck = true; break; }
      tally(out, d.rooms[d.at], res.win);
      if (res.win) {
        out.wins++;
        world.clearRoom(career, res.lifeLeft);
        // Walk out while you still can: the prize is not worth the last room
        // on four life.
        if (career.dungeon && career.life <= career.maxLife * 0.3) world.leaveDungeon(career);
      } else {
        world.loseDuel(career, d.rooms[d.at], world.anteFor(career, d.rooms[d.at], rng));
        out.deaths++;
        buildDeck(career);
      }
      continue;
    }

    const goal = chooseGoal(career, rng);
    if (!goal) break;
    const before = `${career.x},${career.y}`;
    const shy = (m) => career.life < career.maxLife * 0.6 || !willFight(career, m.foe);
    const res = stepToward(career, goal, rng, shy);
    out.steps++;
    if (res.kind === "blocked" && before === `${career.x},${career.y}`) {
      // Truly wedged. That is a map bug, so say so loudly.
      out.stuck = true;
      break;
    }
    if (res.kind === "monster") {
      const foeKey = res.monster.foe;
      // Hurt, or badly outmatched: break off. Fleeing costs two life and a few
      // ticks, which is cheaper than a stake and a walk home.
      if (career.life < career.maxLife * 0.6 || !willFight(career, foeKey)) {
        world.flee(career, res.monster);
        out.fled = (out.fled || 0) + 1;
        continue;
      }
      const ante = world.anteFor(career, foeKey, rng);
      const fight = duelCareer(career, foeKey, rng);
      out.duels++; out.turns.push(fight.turns);
      if (fight.capped) out.capped++;
      if (fight.stuck) { out.stuck = true; break; }
      career.monsters = career.monsters.filter((m) => m.id !== res.monster.id);
      tally(out, foeKey, fight.win);
      if (fight.win) {
        out.wins++;
        const g = career.gold;
        world.winDuel(career, foeKey, ante, { takeAnte: rng() < 0.8, lifeLeft: fight.lifeLeft });
        out.earned += career.gold - g;
      } else {
        world.loseDuel(career, foeKey, ante);
        out.deaths++;
      }
      buildDeck(career);
    } else if (res.kind === "site") {
      const site = res.site;
      if (site.kind === "town") doTown(career, site, rng, out);
      else if (site.kind === "shrine") world.takeShrine(career, site);
      else if (site.kind === "dungeon" && !site.cleared && career.life > career.maxLife * 0.7) world.enterDungeon(career, site);
      else if (site.kind === "keep" && !career.wardens[site.color]) {
        if (career.leylines >= 3 && career.life > career.maxLife * 0.85) {
          const ante = world.anteFor(career, site.foe, rng);
          const fight = duelCareer(career, site.foe, rng);
          out.duels++; out.turns.push(fight.turns);
          tally(out, site.foe, fight.win);
          if (fight.win) { out.wins++; world.winDuel(career, site.foe, ante, { lifeLeft: fight.lifeLeft }); }
          else { world.loseDuel(career, site.foe, ante); out.deaths++; }
          buildDeck(career);
        }
      } else if (site.kind === "spire" && !site.hidden) {
        const ante = world.anteFor(career, "shardlord", rng);
        const fight = duelCareer(career, "shardlord", rng);
        out.duels++; out.turns.push(fight.turns);
        tally(out, "shardlord", fight.win);
        if (fight.win) { out.wins++; world.winDuel(career, "shardlord", ante, { lifeLeft: fight.lifeLeft }); }
        else { world.loseDuel(career, "shardlord", ante); out.deaths++; }
        buildDeck(career);
      }
    }
  }
  out.wardens = Object.values(career.wardens).filter(Boolean).length;
  out.won = career.won;
  out.leylines = career.leylines;
  out.gold = career.gold;
  out.collection = Object.values(career.collection).reduce((a, b) => a + b, 0);
  out.sigils = Object.values(career.sigils).reduce((a, b) => a + b, 0);
  out.killTotal = Object.values(career.kills).reduce((a, b) => a + b, 0);
  return out;
}

/* ---------- a matchup table, for the decks alone -------------------------- */

function duelTable() {
  console.log("\nA fresh starting pile against the wilds (200 duels each):");
  const rng = duel.makeRng(4242);
  for (const tier of [1, 2, 3, 4]) {
    let wins = 0, n = 0, turns = 0;
    for (let i = 0; i < 200; i++) {
      const colors = COLOR_KEYS.slice().sort(() => rng() - 0.5);
      const career = world.newCareer({ seed: 1000 + i, main: colors[0], splash: colors[1] });
      buildDeck(career);
      const pool = Object.values(FOES).filter((f) => f.tier === tier);
      const foe = pool[Math.floor(rng() * pool.length)];
      const res = duelCareer(career, foe.key, rng);
      wins += res.win ? 1 : 0; n++; turns += res.turns;
    }
    console.log(`  tier ${tier}: ${((100 * wins) / n).toFixed(0)}% won, ${(turns / n).toFixed(1)} turns`);
  }

  console.log("\nColour against colour, tier 2, tuned lists (120 duels each):");
  for (const a of COLOR_KEYS) {
    const line = [];
    for (const b of COLOR_KEYS) {
      if (a === b) { line.push("  — "); continue; }
      let w = 0;
      for (let i = 0; i < 120; i++) {
        const rng2 = duel.makeRng(9000 + i);
        const pa = duel.newPlayer({ name: "A", deck: deckList(DECKS[`${a}2`]), life: 18 });
        const pb = duel.newPlayer({ name: "B", deck: deckList(DECKS[`${b}2`]), life: 18 });
        const s = playDuel(pa, pb, rng2, 0.9, 0.9, i % 2 === 0);
        if (s.over?.winner === 0) w++;
      }
      line.push(`${((100 * w) / 120).toFixed(0).padStart(3)}%`);
    }
    console.log(`  ${a.padEnd(8)} ${line.join(" ")}`);
  }
  console.log(`  ${"".padEnd(8)} ${COLOR_KEYS.map((c) => c.slice(0, 4).padStart(4)).join(" ")}`);
}

/* ---------- go ------------------------------------------------------------ */

if (args.includes("--duels")) {
  duelTable();
} else {
  const results = [];
  for (let i = 0; i < CAREERS; i++) results.push(runCareer(1 + i * 17));
  const n = results.length;
  const avg = (f) => (results.reduce((a, r) => a + f(r), 0) / n).toFixed(1);
  const pct = (f) => ((100 * results.filter(f).length) / n).toFixed(0);
  const turns = results.flatMap((r) => r.turns);

  console.log(`${n} careers, ${turns.length} duels\n`);
  console.log(`  wardens beaten   avg ${avg((r) => r.wardens)} of 5   (all five: ${pct((r) => r.wardens === 5)}%)`);
  console.log(`  Shardlord        ${pct((r) => r.won)}% of careers`);
  const winners = results.filter((r) => r.won);
  if (winners.length) {
    const s2 = winners.reduce((a, r) => a + r.steps, 0) / winners.length;
    const d2 = winners.reduce((a, r) => a + r.duels, 0) / winners.length;
    console.log(`  a winning career ${s2.toFixed(0)} steps, ${d2.toFixed(0)} duels`);
  }
  console.log(`  duels won        ${((100 * results.reduce((a, r) => a + r.wins, 0)) / results.reduce((a, r) => a + r.duels, 0)).toFixed(0)}%`);
  console.log(`  duel length      ${(turns.reduce((a, b) => a + b, 0) / turns.length).toFixed(1)} turns, longest ${Math.max(...turns)}`);
  console.log(`  hit the turn cap ${results.reduce((a, r) => a + r.capped, 0)} duels`);
  console.log(`  leylines bound   avg ${avg((r) => r.leylines)}`);
  console.log(`  sigils held      avg ${avg((r) => r.sigils)}`);
  console.log(`  collection       avg ${avg((r) => r.collection)} cards`);
  console.log(`  gold in hand     avg ${avg((r) => r.gold)}`);
  console.log(`  gold won         avg ${avg((r) => r.earned)}`);
  console.log(`  spent on inns    avg ${avg((r) => r.spentInn)}  (${avg((r) => r.townVisits)} town visits)`);
  console.log(`  spent on leyline avg ${avg((r) => r.spentLey)}`);
  console.log(`  spent in shops   avg ${avg((r) => r.spentShop)}  (${avg((r) => r.bought)} cards)`);
  console.log(`  kills            avg ${avg((r) => r.killTotal)} (25 fully bleeds all five wardens)`);
  console.log(`  losses per run   avg ${avg((r) => r.deaths)}`);
  console.log(`  duels per run    avg ${avg((r) => r.duels)}`);
  console.log(`  fights ducked    avg ${avg((r) => r.fled || 0)}`);
  for (const t of [1, 2, 3, 4, 5]) {
    const n = results.reduce((a, r) => a + (r.byTier[t]?.n || 0), 0);
    const w = results.reduce((a, r) => a + (r.byTier[t]?.w || 0), 0);
    if (n) console.log(`  tier ${t} duels     ${n} fought, ${((100 * w) / n).toFixed(0)}% won`);
  }
  const stuck = results.filter((r) => r.stuck).length;
  console.log(stuck ? `\n  !! ${stuck} careers got stuck` : "\n  nothing got stuck");
  if (VERBOSE) for (const r of results.slice(0, 12)) {
    console.log(`  seed ${r.seed}: ${r.duels} duels, ${r.wins} won, ${r.earned}g won, ${r.spentInn}g inns, ${r.spentShop}g shops (${r.bought}), ${r.fled} fled, ${r.townVisits} towns, ley ${r.leylines}, coll ${r.collection}`);
  }
}
