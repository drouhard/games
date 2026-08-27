/* The other duellist.

   One function, `botAct`, performs exactly one atomic action for whoever holds
   priority and returns a short label for it. The browser calls it on a timer
   so you can watch the monster think; tools/wild-sim.mjs calls it in a tight
   loop. Both drive the identical bot, which is the only way a simulated win
   rate means anything about the game you actually play.

   The bot is honest, not clairvoyant: it reads the board, not your hand, and a
   monster's `skill` makes it drop blocks and swing badly, so a bog thing plays
   like a bog thing and a warden does not.

   No DOM in here. */

import { CARDS, cardValue, isLand } from "./cards.js";
import * as duel from "./duel.js";

const { power, toughness, has, creatures, canAttack, canBlock } = duel;

const live = (p) => toughness(p) - p.damage;

/* Would `hitter` kill `victim` in one swing? Deathtouch makes a 1/1 lethal to
   anything, and a first-striker that kills its blocker never gets hit back -
   both of those decide whether an attack or a block is a good idea, so the
   whole bot asks through these two. */
const lethal = (hitter, victim) => (has(hitter, "deathtouch") ? power(hitter) >= 1 : power(hitter) >= live(victim));
const survives = (mine, theirs) =>
  (has(mine, "firststrike") && !has(theirs, "firststrike") && lethal(mine, theirs)) || !lethal(theirs, mine);

/* ---------- what to keep ------------------------------------------------- */

export function botMulligan(state, idx) {
  const pl = state.players[idx];
  if (pl.mulliganed) return false;
  const lands = duel.landsInHand(pl);
  const cheap = pl.hand.filter((c) => !isLand(c.id) && CARDS[c.id].cost <= 3).length;
  // A hand that cannot make land drops, or is nothing but land, is not a hand.
  if (lands <= 1 || lands >= 6 || (lands >= 2 && cheap === 0)) return duel.mulligan(state, idx);
  return false;
}

/* ---------- lands -------------------------------------------------------- */

// Play the land that unlocks the most stuck cards in hand.
function bestLand(state, idx) {
  const pl = state.players[idx];
  const lands = pl.hand.filter((c) => isLand(c.id));
  if (!lands.length) return null;
  const need = {};
  for (const card of pl.hand) {
    const def = CARDS[card.id];
    if (def.type === "land" || !def.color) continue;
    need[def.color] = (need[def.color] || 0) + (def.pips || 0);
  }
  const have = {};
  for (const perm of pl.board) if (perm.kind === "land" && perm.color) have[perm.color] = (have[perm.color] || 0) + 1;
  return lands
    .slice()
    .sort((a, b) => {
      const ca = CARDS[a.id], cb = CARDS[b.id];
      const score = (c) => {
        if (c.any) return 0.5; // useful, but it enters tapped
        const want = need[c.color] || 0;
        return want * 2 - (have[c.color] || 0);
      };
      return score(cb) - score(ca);
    })[0];
}

/* ---------- casting ------------------------------------------------------ */

function removalScore(state, idx, card) {
  const def = CARDS[card.id];
  const them = state.players[idx === 0 ? 1 : 0];
  const foes = creatures(them);
  if (!foes.length) return -1;
  let best = -1;
  for (const fx of def.fx || []) {
    if (fx.k === "damage" && (fx.to === "any" || fx.to === "creature" || fx.to === "theirs")) {
      for (const c of foes) if (live(c) <= fx.amount) best = Math.max(best, cardValue(c.id) + 2);
    }
    if (fx.k === "destroy" || fx.k === "exile") {
      const pool = fx.to === "theirsFlying" ? foes.filter((c) => has(c, "flying")) : foes;
      for (const c of pool) best = Math.max(best, cardValue(c.id) + 3);
    }
    if (fx.k === "wither") {
      for (const c of foes) if (live(c) <= -fx.toughness) best = Math.max(best, cardValue(c.id) + 2);
    }
    if (fx.k === "wrath") {
      const mine = creatures(state.players[idx]).length;
      if (foes.length >= 2 && foes.length > mine) best = Math.max(best, foes.length * 3);
    }
    if (fx.k === "bounce" && fx.to === "allTheirs" && foes.length >= 2) best = Math.max(best, foes.length * 2.5);
  }
  return best;
}

function spellScore(state, idx, card) {
  const def = CARDS[card.id];
  const me = state.players[idx];
  const them = state.players[idx === 0 ? 1 : 0];

  if (def.type === "creature") {
    // A body is nearly always right; bigger and cheaper both count.
    return 6 + (def.power + def.toughness) * 0.7 + (def.kw?.length || 0);
  }
  const kill = removalScore(state, idx, card);
  let score = kill;
  for (const fx of def.fx || []) {
    if (fx.k === "damage" && fx.to === "player" && them.life <= fx.amount) score = 99; // lethal
    if (fx.k === "drain" && them.life <= fx.amount) score = 99;
    if (fx.k === "heal") score = Math.max(score, me.life < me.maxLife * 0.45 ? 7 : -1);
    if (fx.k === "draw") score = Math.max(score, me.hand.length <= 3 ? 6 : 2);
    if (fx.k === "growth") score = Math.max(score, 5);
    if (fx.k === "counters" || (fx.k === "pump" && fx.to === "allYours")) {
      score = Math.max(score, creatures(me).length >= 2 ? 6 : -1);
    }
    if (fx.k === "freeze" || fx.k === "bounce") score = Math.max(score, creatures(them).length ? 3 : -1);
    if (fx.k === "discard") score = Math.max(score, them.hand.length ? 2 : -1);
    if (fx.k === "token") score = Math.max(score, 6);
  }
  return score;
}

// Pick the target the spell most wants, from the bot's side of the table.
function chooseTargets(state, idx, card) {
  const spec = duel.targetSpec(card.id);
  if (!spec.length) return [];
  const def = CARDS[card.id];
  const out = [];
  spec.forEach((kind, i) => {
    const legal = duel.legalTargets(state, idx, kind);
    if (!legal.length) { out.push(null); return; }
    const fx = (def.fx || []).filter((f) => ["any", "creature", "theirs", "yours", "theirsFlying"].includes(f.to))[i];
    const them = state.players[idx === 0 ? 1 : 0];
    if (kind === "yours") {
      out.push(legal.slice().sort((a, b) => power(b) - power(a))[0]);
      return;
    }
    const foes = legal.filter((t) => !t.isPlayer && t.owner !== idx);
    if (fx?.k === "damage") {
      const killable = foes.filter((c) => live(c) <= fx.amount).sort((a, b) => cardValue(b.id) - cardValue(a.id))[0];
      if (killable) { out.push(killable); return; }
      const face = legal.find((t) => t.isPlayer);
      if (face && (them.life <= fx.amount || !foes.length)) { out.push(face); return; }
      out.push(foes.sort((a, b) => cardValue(b.id) - cardValue(a.id))[0] || face || legal[0]);
      return;
    }
    out.push(foes.sort((a, b) => cardValue(b.id) - cardValue(a.id))[0] || legal[0]);
  });
  return out;
}

function castBest(state, idx) {
  const pl = state.players[idx];
  const options = pl.hand
    .filter((c) => CARDS[c.id].type !== "land" && duel.castable(state, idx, c))
    .map((c) => ({ card: c, score: spellScore(state, idx, c) }))
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score || CARDS[b.card.id].cost - CARDS[a.card.id].cost);
  for (const opt of options) {
    if (duel.castSpell(state, idx, opt.card, chooseTargets(state, idx, opt.card))) {
      return `casts ${CARDS[opt.card.id].name}`;
    }
  }
  return null;
}

/* ---------- attacking ----------------------------------------------------

   For each of its creatures the bot asks the only question that matters: if
   this swings, what is the best thing they can put in front of it? */

function bestBlockerFor(atk, foes) {
  const able = foes.filter((b) => canBlock(atk, b));
  if (!able.length) return null;
  // Their best block is the one that kills it and lives through it.
  const clean = able.filter((b) => lethal(b, atk) && survives(b, atk));
  if (clean.length) return clean.sort((a, b) => power(b) - power(a))[0];
  const trade = able.filter((b) => lethal(b, atk));
  if (trade.length) return trade.sort((a, b) => cardValue(a.id) - cardValue(b.id))[0];
  return able.sort((a, b) => live(b) - live(a))[0];
}

/* The mistake a per-creature reading makes is assuming every attacker meets
   the best blocker on the table. It cannot: a blocker stops one thing. So the
   bot hands out their blockers greedily, biggest threat first, and everything
   left over is simply unblocked - which is what makes a wide board attack. */
function pickAttackers(state, idx, skill) {
  const me = state.players[idx];
  const them = state.players[idx === 0 ? 1 : 0];
  const mine = me.board.filter(canAttack).sort((a, b) => power(b) - power(a));
  if (!mine.length) return [];
  const pool = creatures(them).filter((c) => !c.tapped);

  // Lethal check first: if their best possible blocks still leave them dead,
  // send everything and stop thinking.
  let unstoppable = 0;
  const spare = pool.slice();
  for (const atk of mine) {
    const b = bestBlockerFor(atk, spare);
    if (b) spare.splice(spare.indexOf(b), 1);
    else unstoppable += power(atk);
  }
  if (unstoppable >= them.life) return mine;

  const free = pool.slice();
  const out = [];
  for (const atk of mine) {
    const block = bestBlockerFor(atk, free);
    let go;
    if (!block) go = true;                                  // nothing left to stop it
    else if (lethal(atk, block) && survives(atk, block)) go = true;
    else if (lethal(atk, block)) go = cardValue(atk.id) <= cardValue(block.id) + 1.5;
    else if (survives(atk, block)) go = true;               // it bounces off, and costs nothing
    else go = false;
    if (state.rng() > skill) go = state.rng() < 0.5;        // a sloppy thing swings badly
    if (go) { out.push(atk); if (block) free.splice(free.indexOf(block), 1); }
  }
  return out;
}

/* ---------- blocking ----------------------------------------------------- */

export function botBlocks(state, skill = 0.9) {
  const idx = state.priority;
  const me = state.players[idx];
  const them = state.players[idx === 0 ? 1 : 0];
  const attackers = state.combat.attackers
    .map((u) => them.board.find((p) => p.uid === u))
    .filter(Boolean)
    .sort((a, b) => power(b) - power(a));
  const free = creatures(me).filter((c) => !c.tapped);
  const incoming = attackers.reduce((n, a) => n + power(a), 0);
  const desperate = incoming >= me.life;
  const blocks = {};

  for (const atk of attackers) {
    if (!free.length) break;
    const able = free.filter((b) => canBlock(atk, b));
    if (!able.length) continue;
    if (state.rng() > skill) continue; // it didn't see that one coming

    // Kill it and live; else a trade worth making; else chump only to survive.
    const clean = able.filter((b) => lethal(b, atk) && survives(b, atk));
    const trade = able.filter((b) => lethal(b, atk));
    const wall = able.filter((b) => survives(b, atk));
    let pick = null;
    if (clean.length) pick = clean.sort((a, b) => cardValue(a.id) - cardValue(b.id))[0];
    else if (trade.length && cardValue(trade[0].id) <= cardValue(atk.id) + 2) {
      pick = trade.sort((a, b) => cardValue(a.id) - cardValue(b.id))[0];
    } else if (wall.length) pick = wall.sort((a, b) => cardValue(a.id) - cardValue(b.id))[0];
    else if (desperate) pick = able.sort((a, b) => cardValue(a.id) - cardValue(b.id))[0];

    if (pick) {
      blocks[atk.uid] = [pick.uid];
      free.splice(free.indexOf(pick), 1);
      // Gang up when one body is not enough and the hit would be fatal.
      if (desperate && !lethal(pick, atk)) {
        const help = free.filter((b) => canBlock(atk, b))[0];
        if (help) { blocks[atk.uid].push(help.uid); free.splice(free.indexOf(help), 1); }
      }
    }
  }
  duel.declareBlockers(state, blocks);
  return "blocks";
}

/* ---------- combat tricks ------------------------------------------------ */

/* Reflex cards are only worth mana when combat is already on the table, so
   they get their own read of the board rather than the main-phase one. */
function castReflex(state, idx) {
  const pl = state.players[idx];
  const options = pl.hand.filter((c) => CARDS[c.id].type === "reflex" && duel.castable(state, idx, c));
  if (!options.length || !state.combat) return null;
  const them = state.players[idx === 0 ? 1 : 0];
  const attacking = state.combat.attackers
    .map((u) => state.players[state.active].board.find((p) => p.uid === u))
    .filter(Boolean);

  let best = null;
  for (const card of options) {
    const def = CARDS[card.id];
    let score = 0;
    for (const fx of def.fx || []) {
      if (fx.k === "damage") {
        const pool = idx === state.active ? creatures(them) : attacking;
        if (pool.some((c) => live(c) <= fx.amount)) score = Math.max(score, 8);
        if (fx.to === "any" && them.life <= fx.amount) score = 99;
      }
      if (fx.k === "destroy" || fx.k === "freeze" || fx.k === "bounce") {
        const pool = idx === state.active ? creatures(them) : attacking;
        const legal = fx.to === "theirsFlying" ? pool.filter((c) => has(c, "flying")) : pool;
        if (legal.length) score = Math.max(score, 7);
      }
      if (fx.k === "wither" && attacking.length && idx !== state.active) score = Math.max(score, 5);
      if (fx.k === "pump" || fx.k === "grant") {
        // Only worth it on a creature that is actually in the fight.
        const mine = idx === state.active ? attacking.filter((c) => c.owner === idx) : creatures(state.players[idx]).filter((c) => c.tapped === false);
        if (mine.length) score = Math.max(score, 5);
      }
    }
    if (score > (best?.score || 0)) best = { card, score };
  }
  if (!best) return null;
  if (duel.castSpell(state, idx, best.card, chooseTargets(state, idx, best.card))) {
    return `casts ${CARDS[best.card.id].name}`;
  }
  return null;
}

/* ---------- one action --------------------------------------------------- */

/* Performs a single action for whoever holds priority. Returns a label, or
   null when the bot has nothing left to do (the caller should then have moved
   on, because every branch below ends by changing the step). */
export function botAct(state, skill = 0.9) {
  if (state.over) return null;
  const idx = state.priority;

  if (state.step === "mulligan") {
    botMulligan(state, idx);
    return "keeps";
  }

  if (state.step === "blockers") {
    const trick = castReflex(state, idx);
    if (trick) return trick;
    return botBlocks(state, skill);
  }

  if (state.step === "tricks") {
    const trick = castReflex(state, idx);
    if (trick) return trick;
    duel.resolveCombat(state);
    return "damage";
  }

  if (state.step === "main" && state.active === idx) {
    const land = bestLand(state, idx);
    if (land && !state.players[idx].landPlayed) {
      duel.playLand(state, land);
      return `plays ${CARDS[land.id].name}`;
    }
    const cast = castBest(state, idx);
    if (cast) return cast;
    if (!state.combatDone) {
      const attackers = pickAttackers(state, idx, skill);
      if (attackers.length && duel.declareAttackers(state, attackers)) return "attacks";
      state.combatDone = true;
      return "holds back";
    }
    duel.endTurn(state);
    return "ends the turn";
  }
  return null;
}

/* Runs the bot until priority leaves it (or the duel ends). The browser
   doesn't use this - it wants one action at a time - but the simulator does. */
export function botTurn(state, skill = 0.9, cap = 60) {
  const mine = state.priority;
  let n = 0;
  while (!state.over && state.priority === mine && n++ < cap) {
    if (!botAct(state, skill)) break;
  }
}
