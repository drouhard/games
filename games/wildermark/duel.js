/* The duel.

   Real Magic-shaped rules, cut down until they fit a phone screen: lands and
   coloured mana, creatures that arrive tired, an attack step where the
   defender chooses blocks, and one window for combat tricks.

   Two things are deliberately *not* here. There is no mana pool - a spell taps
   the lands it needs at the moment you cast it, so mana can never be floating
   and lost. And there is no priority ping-pong: instants exist as `reflex`
   cards, and the only window for them is combat, once per side.

   A turn:

     untap  ->  draw  ->  main  ->  attack  ->  blocks  ->  tricks
            ->  damage  ->  main again  ->  discard to seven

   The engine is a state machine, not a loop. It never asks for input: it puts
   `state.step` and `state.priority` on the table and waits for the UI, or for
   ai.js, to call one of the actions below. That is what lets the whole game be
   played in Node by tools/wild-sim.mjs.

   No DOM in here. Nothing in this file may reach for `document`. */

import { CARDS, COLORS, cardValue, isLand } from "./cards.js";

const HAND_SIZE = 7;
const START_HAND = 7;

let seq = 1;
const uid = (p) => `${p}${seq++}`;

export function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/* A small deterministic generator, so a duel can be replayed and a whole
   career can be simulated from one seed. */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  // The career saves this back out, so reloading a game picks the sequence up
  // where it left off instead of quietly re-rolling the world.
  next.state = () => s;
  return next;
}

/* ---------- cards and permanents ----------------------------------------- */

export const makeCard = (id) => ({ uid: uid("c"), id });

function makePermanent(card, owner) {
  const def = CARDS[card.id];
  return {
    uid: uid("p"),
    id: card.id,
    name: def.name,
    owner,
    kind: def.type === "land" ? "land" : "creature",
    color: def.color,
    art: def.art || null,
    any: !!def.any,
    ramp: def.ramp || 0,
    basePower: def.power || 0,
    baseToughness: def.toughness || 0,
    counters: 0,
    tempP: 0,
    tempT: 0,
    kw: (def.kw || []).slice(),
    tempKw: [],
    tapped: !!def.entersTapped,
    frozen: false,
    sick: def.type !== "land",
    damage: 0,
    doomed: false,
    token: false,
  };
}

function makeToken(fx, owner) {
  return {
    uid: uid("p"), id: "token", name: fx.name, owner, kind: "creature", color: null,
    art: fx.art || "lanternward",
    any: false, ramp: 0, basePower: fx.power, baseToughness: fx.toughness,
    counters: 0, tempP: 0, tempT: 0, kw: (fx.kw || []).slice(), tempKw: [],
    tapped: false, frozen: false, sick: true, damage: 0, doomed: false, token: true,
  };
}

export const power = (p) => Math.max(0, p.basePower + p.counters + p.tempP);
export const toughness = (p) => p.baseToughness + p.counters + p.tempT;
export const has = (p, kw) => p.kw.includes(kw) || p.tempKw.includes(kw);
export const creatures = (pl) => pl.board.filter((p) => p.kind === "creature");
export const isManaSource = (p) => p.kind === "land" || p.ramp > 0;

/* ---------- setting up --------------------------------------------------- */

export function newPlayer({ name, sprite, deck, life, maxLife, colors }) {
  return {
    name,
    sprite,
    life,
    maxLife: maxLife ?? life,
    colors: colors || [],
    library: deck.map(makeCard),
    hand: [],
    board: [],
    graveyard: [],
    landPlayed: false,
    fatigue: 0,
    mulliganed: false,
  };
}

export function newDuel({ hero, foe, rng = Math.random, heroFirst = true, ante = null }) {
  const state = {
    rng,
    players: [hero, foe],
    active: heroFirst ? 0 : 1,
    priority: heroFirst ? 0 : 1,
    step: "mulligan",
    turn: 1,
    combat: null,
    combatDone: false,
    over: null, // { winner, loser }
    log: [],
    ante,
  };
  for (const pl of state.players) {
    shuffle(pl.library, rng);
    draw(state, pl, START_HAND, true);
  }
  say(state, `${foe.name} steps up on ${foe.life} life. You have ${hero.life}.`, "start");
  return state;
}

/* The log talks to you in the second person and about the monster in the
   third, so "You casts Emberling" never happens. `v` picks the verb form and
   `poss` the possessive. */
const YOU = "You";
const v = (pl, third, base) => `${pl.name} ${pl.name === YOU ? base : third}`;
const poss = (pl) => (pl.name === YOU ? "Your" : `${pl.name}'s`);

const say = (state, text, kind = "info") => {
  state.log.push({ text, kind });
  if (state.log.length > 120) state.log.shift();
};

const other = (i) => (i === 0 ? 1 : 0);
export const opponentOf = (state, pl) => state.players[other(state.players.indexOf(pl))];

/* ---------- drawing ------------------------------------------------------ */

function draw(state, pl, n = 1, quiet = false) {
  for (let i = 0; i < n; i++) {
    if (!pl.library.length) {
      // No deck-out loss: an empty library bites, and bites harder each time,
      // which ends a stalled duel without ending it on a technicality.
      pl.fatigue += 1;
      pl.life -= pl.fatigue;
      say(state, `${v(pl, "draws", "draw")} on an empty deck and lose${pl.name === YOU ? "" : "s"} ${pl.fatigue}.`, "bad");
      checkDeaths(state);
      continue;
    }
    pl.hand.push(pl.library.pop());
  }
  if (!quiet && n > 0) say(state, `${v(pl, "draws", "draw")} ${n}.`);
}

/* One free mulligan: seven fresh cards, then one goes to the bottom. Both
   sides get it, and the bot takes it on a hand that cannot function. */
export function mulligan(state, playerIndex) {
  const pl = state.players[playerIndex];
  if (pl.mulliganed || state.step !== "mulligan") return false;
  pl.mulliganed = true;
  pl.library.push(...pl.hand);
  pl.hand = [];
  shuffle(pl.library, state.rng);
  draw(state, pl, START_HAND, true);
  // Bottom the least useful card: a surplus land if there is one, else the
  // most expensive thing in hand.
  const lands = pl.hand.filter((c) => isLand(c.id));
  const drop = lands.length > 3
    ? lands[0]
    : pl.hand.slice().sort((a, b) => (CARDS[b.id].cost || 0) - (CARDS[a.id].cost || 0))[0];
  pl.hand.splice(pl.hand.indexOf(drop), 1);
  pl.library.unshift(drop);
  say(state, `${v(pl, "mulligans", "mulligan")}.`, "info");
  return true;
}

export function keepHands(state) {
  if (state.step !== "mulligan") return;
  state.step = "main";
  state.combatDone = false;
  const pl = state.players[state.active];
  pl.landPlayed = false;
  say(state, `${poss(pl)} turn.`, "turn");
}

export const landsInHand = (pl) => pl.hand.filter((c) => isLand(c.id)).length;

/* ---------- mana --------------------------------------------------------- */

function sources(pl) {
  return pl.board.filter((p) => isManaSource(p) && !p.tapped && !(p.ramp && p.sick));
}

/* Can this player cast that card right now? Colour pips first, then the
   generic remainder - any-colour sources count for both. */
export function canPay(pl, id) {
  const card = CARDS[id];
  if (card.type === "land") return false;
  const open = sources(pl);
  const total = open.reduce((n, s) => n + (s.ramp || 1), 0);
  if (total < card.cost) return false;
  const pips = card.pips || 0;
  if (!pips) return true;
  const colored = open.filter((s) => s.any || s.ramp || s.color === card.color);
  return colored.reduce((n, s) => n + (s.ramp || 1), 0) >= pips;
}

function pay(pl, id) {
  const card = CARDS[id];
  const open = sources(pl);
  // Spend exact-colour lands on the pips, keep flexible sources for last.
  const exact = open.filter((s) => !s.any && !s.ramp && s.color === card.color);
  const flexible = open.filter((s) => s.any || s.ramp);
  const offColor = open.filter((s) => !exact.includes(s) && !flexible.includes(s));
  let pips = card.pips || 0;
  let left = card.cost;
  const spend = (src) => {
    src.tapped = true;
    left -= src.ramp || 1;
  };
  while (pips > 0 && exact.length) { const s = exact.shift(); spend(s); pips -= 1; }
  while (pips > 0 && flexible.length) { const s = flexible.shift(); pips -= s.ramp || 1; spend(s); }
  // The generic half: burn the lands that make the least useful colour first.
  const rest = [...offColor, ...exact, ...flexible];
  while (left > 0 && rest.length) spend(rest.shift());
}

/* ---------- playing cards ------------------------------------------------ */

export function playLand(state, uidOrCard) {
  const pl = state.players[state.priority];
  if (state.step !== "main" || state.priority !== state.active || pl.landPlayed) return false;
  const card = pl.hand.find((c) => c.uid === (uidOrCard.uid || uidOrCard));
  if (!card || !isLand(card.id)) return false;
  pl.hand.splice(pl.hand.indexOf(card), 1);
  const perm = makePermanent(card, state.players.indexOf(pl));
  perm.sick = false;
  pl.board.push(perm);
  pl.landPlayed = true;
  say(state, `${v(pl, "plays", "play")} ${CARDS[card.id].name}.`);
  return true;
}

const TARGETED = ["any", "creature", "theirs", "yours", "theirsFlying"];

/* What a card is waiting to be aimed at. One entry per *kind* of target, not
   per effect: Fury pumps a creature and grants it Trample, and asking twice
   for the same creature would be a worse card and a worse tap. */
export function targetSpec(id) {
  const card = CARDS[id];
  const list = [];
  for (const fx of card.fx || []) {
    if (TARGETED.includes(fx.to) && !list.includes(fx.to)) list.push(fx.to);
  }
  return list;
}

export function legalTargets(state, playerIndex, kind) {
  const me = state.players[playerIndex];
  const them = state.players[other(playerIndex)];
  const mine = creatures(me);
  const theirs = creatures(them);
  switch (kind) {
    case "any": return [...mine, ...theirs, { uid: "player", isPlayer: true, name: them.name }];
    case "creature": return [...mine, ...theirs];
    case "theirs": return theirs;
    case "theirsFlying": return theirs.filter((c) => has(c, "flying"));
    case "yours": return mine;
    default: return [];
  }
}

export function castable(state, playerIndex, card) {
  const def = CARDS[card.id];
  if (def.type === "land") return state.step === "main" && state.active === playerIndex && !state.players[playerIndex].landPlayed;
  if (!canPay(state.players[playerIndex], card.id)) return false;
  // A spell with nowhere to point is not castable. Offering it and then
  // refusing at the last step is the worst version of this.
  for (const kind of targetSpec(card.id)) {
    if (!legalTargets(state, playerIndex, kind).length) return false;
  }
  if (def.type === "reflex") {
    // Combat only, and only in your own window.
    if (state.step === "blockers") return playerIndex !== state.active;
    if (state.step === "tricks") return playerIndex === state.active;
    return false;
  }
  return state.step === "main" && state.active === playerIndex && state.priority === playerIndex;
}

export function castSpell(state, playerIndex, uidOrCard, targets = []) {
  const pl = state.players[playerIndex];
  const card = pl.hand.find((c) => c.uid === (uidOrCard.uid || uidOrCard));
  if (!card || !castable(state, playerIndex, card)) return false;
  const def = CARDS[card.id];

  // Every target must still be a legal one, or the spell fizzles rather than
  // resolving against a creature that died in the meantime.
  const spec = targetSpec(card.id);
  const chosen = [];
  for (let i = 0; i < spec.length; i++) {
    const legal = legalTargets(state, playerIndex, spec[i]);
    const want = targets[i];
    const found = legal.find((t) => t.uid === (want?.uid || want));
    if (!found) return false;
    chosen.push(found);
  }
  void chosen;

  pay(pl, card.id);
  pl.hand.splice(pl.hand.indexOf(card), 1);
  say(state, `${v(pl, "casts", "cast")} ${def.name}.`, playerIndex === 0 ? "good" : "bad");

  if (def.type === "creature") {
    const perm = makePermanent(card, playerIndex);
    if (has(perm, "haste")) perm.sick = false;
    pl.board.push(perm);
    if (def.enter) applyEffects(state, playerIndex, def.enter, [], perm);
  } else {
    pl.graveyard.push(card);
    applyEffects(state, playerIndex, def.fx, chosen, null);
  }
  checkDeaths(state);
  return true;
}

/* ---------- effects ------------------------------------------------------ */

function damageTo(state, target, amount, sourcePerm, controller) {
  if (amount <= 0) return;
  if (target.isPlayer || target.life !== undefined) {
    const pl = target.isPlayer ? state.players[other(controller)] : target;
    pl.life -= amount;
    say(state, `${v(pl, "takes", "take")} ${amount}.`, pl === state.players[0] ? "bad" : "good");
  } else {
    target.damage += amount;
    if (sourcePerm && has(sourcePerm, "deathtouch")) target.doomed = true;
  }
  if (sourcePerm && has(sourcePerm, "lifelink")) {
    const owner = state.players[sourcePerm.owner];
    owner.life = Math.min(owner.maxLife, owner.life + amount);
  }
}

/* A trigger has no one to ask, so it picks for itself: burn goes at the
   biggest thing it can actually kill, and otherwise at the face. */
function autoTarget(state, playerIndex, fx) {
  const them = state.players[other(playerIndex)];
  const theirs = creatures(them);
  if (fx.to === "player" || fx.to === "self") return null;
  if (fx.to === "any") {
    const killable = theirs
      .filter((c) => toughness(c) - c.damage <= (fx.amount || 0))
      .sort((a, b) => cardValue(b.id) - cardValue(a.id))[0];
    return killable || { isPlayer: true };
  }
  if (fx.to === "theirs" || fx.to === "creature") {
    return theirs.sort((a, b) => cardValue(b.id) - cardValue(a.id))[0] || null;
  }
  if (fx.to === "yours") return creatures(state.players[playerIndex])[0] || null;
  return null;
}

function groupFor(state, playerIndex, to) {
  const me = state.players[playerIndex];
  const them = state.players[other(playerIndex)];
  if (to === "allYours") return creatures(me);
  if (to === "allTheirs") return creatures(them);
  if (to === "allCreatures") return [...creatures(me), ...creatures(them)];
  return null;
}

export function applyEffects(state, playerIndex, fxList, chosen = [], sourcePerm = null) {
  const me = state.players[playerIndex];
  const them = state.players[other(playerIndex)];
  // `chosen` lines up with the *kinds* in targetSpec, so every effect that
  // wants the same kind of target resolves against the same one.
  const kinds = [];
  for (const fx of fxList) if (TARGETED.includes(fx.to) && !kinds.includes(fx.to)) kinds.push(fx.to);
  for (const fx of fxList) {
    const group = groupFor(state, playerIndex, fx.to);
    const single = group
      ? null
      : TARGETED.includes(fx.to)
        ? (chosen[kinds.indexOf(fx.to)] || autoTarget(state, playerIndex, fx))
        : null;
    const targets = group || (single ? [single] : []);

    switch (fx.k) {
      case "damage":
        if (fx.to === "player") damageTo(state, { isPlayer: true }, fx.amount, sourcePerm, playerIndex);
        else for (const t of targets) damageTo(state, t, fx.amount, sourcePerm, playerIndex);
        break;
      case "heal":
        me.life = Math.min(me.maxLife, me.life + fx.amount);
        say(state, `${v(me, "gains", "gain")} ${fx.amount}.`, playerIndex === 0 ? "good" : "bad");
        break;
      case "drain":
        them.life -= fx.amount;
        me.life = Math.min(me.maxLife, me.life + fx.amount);
        say(state, `${v(them, "loses", "lose")} ${fx.amount}; ${v(me, "gain", "gain")} it.`, playerIndex === 0 ? "good" : "bad");
        break;
      case "draw": draw(state, me, fx.amount); break;
      case "discard":
        for (let i = 0; i < fx.amount && them.hand.length; i++) {
          const worst = them.hand.slice().sort((a, b) => cardValue(a.id) - cardValue(b.id))[0];
          them.hand.splice(them.hand.indexOf(worst), 1);
          them.graveyard.push(worst);
        }
        say(state, `${v(them, "discards", "discard")}.`);
        break;
      case "pump":
      case "wither":
        for (const t of targets) { t.tempP += fx.power; t.tempT += fx.toughness; }
        break;
      case "counters":
        for (const t of targets) t.counters += fx.amount;
        break;
      case "grant":
        for (const t of targets) if (!t.tempKw.includes(fx.kw)) t.tempKw.push(fx.kw);
        break;
      case "destroy":
        for (const t of targets) { t.doomed = true; say(state, `${t.name} is destroyed.`); }
        break;
      case "exile":
        for (const t of targets) { t.exiled = true; t.doomed = true; say(state, `${t.name} is banished.`); }
        break;
      case "bounce":
        for (const t of targets) {
          const owner = state.players[t.owner];
          owner.board.splice(owner.board.indexOf(t), 1);
          if (!t.token) owner.hand.push({ uid: uid("c"), id: t.id });
          say(state, `${t.name} is pulled back to hand.`);
        }
        break;
      case "freeze":
        for (const t of targets) { t.tapped = true; t.frozen = true; }
        say(state, "The water holds them still.");
        break;
      case "wrath":
        for (const t of creatures(them)) t.doomed = true;
        say(state, "The light burns the field clean.", playerIndex === 0 ? "good" : "bad");
        break;
      case "growth": {
        const idx = me.library.map((c, i) => (isLand(c.id) ? i : -1)).filter((i) => i >= 0).pop();
        if (idx === undefined || idx < 0) { say(state, "No land answers the call."); break; }
        const [card] = me.library.splice(idx, 1);
        const perm = makePermanent(card, playerIndex);
        perm.sick = false;
        perm.tapped = !!CARDS[card.id].entersTapped;
        me.board.push(perm);
        say(state, `${v(me, "calls", "call")} up ${CARDS[card.id].name}.`);
        break;
      }
      case "token":
        for (let i = 0; i < fx.count; i++) me.board.push(makeToken(fx, playerIndex));
        say(state, `${v(me, "musters", "muster")} ${fx.count} ${fx.name}s.`);
        break;
      default: break;
    }
  }
  checkDeaths(state);
}

/* ---------- deaths ------------------------------------------------------- */

export function checkDeaths(state) {
  for (const pl of state.players) {
    const dead = pl.board.filter(
      (p) => p.kind === "creature" && (p.doomed || toughness(p) <= 0 || p.damage >= toughness(p)),
    );
    for (const perm of dead) {
      pl.board.splice(pl.board.indexOf(perm), 1);
      if (!perm.token && !perm.exiled) pl.graveyard.push({ uid: uid("c"), id: perm.id });
      say(state, `${perm.name} falls.`);
      const def = CARDS[perm.id];
      if (def?.dies && !perm.exiled) applyEffects(state, perm.owner, def.dies, [], perm);
    }
  }
  for (let i = 0; i < 2; i++) {
    if (state.players[i].life <= 0 && !state.over) {
      state.over = { winner: other(i), loser: i };
      state.step = "over";
      say(state, `${v(state.players[other(i)], "wins", "win")} the duel.`, other(i) === 0 ? "good" : "bad");
    }
  }
}

/* ---------- combat ------------------------------------------------------- */

export const canAttack = (p) =>
  p.kind === "creature" && !p.tapped && !p.sick && !has(p, "defender");

export function canBlock(attacker, blocker) {
  if (blocker.tapped || blocker.kind !== "creature") return false;
  if (has(attacker, "flying") && !has(blocker, "flying") && !has(blocker, "reach")) return false;
  return true;
}

export function declareAttackers(state, uids) {
  if (state.step !== "main" || state.combatDone) return false;
  const me = state.players[state.active];
  const chosen = uids
    .map((u) => me.board.find((p) => p.uid === (u.uid || u)))
    .filter((p) => p && canAttack(p));
  if (!chosen.length) return false;

  for (const perm of chosen) {
    if (!has(perm, "vigilance")) perm.tapped = true;
    const def = CARDS[perm.id];
    if (def?.attacks) applyEffects(state, state.active, def.attacks, [], perm);
  }
  if (state.over) return true;
  state.combat = { attackers: chosen.map((p) => p.uid), blocks: {} };
  state.step = "blockers";
  state.priority = other(state.active);
  say(state, `${v(me, "attacks", "attack")} with ${chosen.length}.`, state.active === 0 ? "good" : "bad");
  return true;
}

/* blocks: { attackerUid: [blockerUid, ...] } */
export function declareBlockers(state, blocks) {
  if (state.step !== "blockers") return false;
  const defender = state.players[other(state.active)];
  const attacker = state.players[state.active];
  const used = new Set();
  const clean = {};
  for (const [atkUid, list] of Object.entries(blocks || {})) {
    const atk = attacker.board.find((p) => p.uid === atkUid);
    if (!atk || !state.combat.attackers.includes(atkUid)) continue;
    for (const bUid of list) {
      const b = defender.board.find((p) => p.uid === (bUid.uid || bUid));
      if (!b || used.has(b.uid) || !canBlock(atk, b)) continue;
      used.add(b.uid);
      (clean[atkUid] ||= []).push(b.uid);
    }
  }
  state.combat.blocks = clean;
  state.step = "tricks";
  state.priority = state.active;
  const n = Object.values(clean).reduce((a, l) => a + l.length, 0);
  say(state, n ? `${v(defender, "blocks", "block")} with ${n}.` : `${v(defender, "lets", "let")} it through.`);
  return true;
}

function strikesIn(perm, phase) {
  return phase === "first" ? has(perm, "firststrike") : !has(perm, "firststrike");
}

export function resolveCombat(state) {
  if (state.step !== "tricks") return false;
  const atkPlayer = state.players[state.active];
  const defPlayer = state.players[other(state.active)];
  const { attackers, blocks } = state.combat;

  for (const phase of ["first", "normal"]) {
    const pending = [];
    for (const atkUid of attackers) {
      const atk = atkPlayer.board.find((p) => p.uid === atkUid);
      if (!atk) continue;
      const blockers = (blocks[atkUid] || [])
        .map((u) => defPlayer.board.find((p) => p.uid === u))
        .filter(Boolean);

      if (strikesIn(atk, phase)) {
        if (!blockers.length) {
          pending.push({ target: { isPlayer: true }, amount: power(atk), source: atk, by: state.active });
        } else {
          // Lethal down the line, in the order the blocks were declared;
          // deathtouch makes one point lethal, trample spills the rest.
          let left = power(atk);
          for (const b of blockers) {
            if (left <= 0) break;
            const need = has(atk, "deathtouch") ? 1 : Math.max(1, toughness(b) - b.damage);
            const give = Math.min(left, need);
            pending.push({ target: b, amount: give, source: atk, by: state.active });
            left -= give;
          }
          if (left > 0 && has(atk, "trample")) {
            pending.push({ target: { isPlayer: true }, amount: left, source: atk, by: state.active });
          }
        }
      }
      for (const b of blockers) {
        if (strikesIn(b, phase)) {
          pending.push({ target: atk, amount: power(b), source: b, by: other(state.active) });
        }
      }
    }
    // Damage in a phase lands simultaneously, so a first-striker's kill only
    // removes its victim once the whole phase has been dealt.
    for (const hit of pending) damageTo(state, hit.target, hit.amount, hit.source, hit.by);
    checkDeaths(state);
    if (state.over) return true;
  }

  state.combat = null;
  state.combatDone = true;
  state.step = "main";
  state.priority = state.active;
  return true;
}

/* ---------- turns -------------------------------------------------------- */

export function endTurn(state) {
  if (state.step !== "main" || state.over) return false;
  const me = state.players[state.active];

  while (me.hand.length > HAND_SIZE) {
    const worst = me.hand
      .slice()
      .sort((a, b) => cardValue(a.id) - cardValue(b.id))[0];
    me.hand.splice(me.hand.indexOf(worst), 1);
    me.graveyard.push(worst);
    say(state, `${v(me, "discards", "discard")} ${CARDS[worst.id].name}.`);
  }
  for (const pl of state.players) {
    for (const perm of pl.board) { perm.damage = 0; perm.tempP = 0; perm.tempT = 0; perm.tempKw = []; }
  }

  state.active = other(state.active);
  state.priority = state.active;
  state.turn += 1;
  beginTurn(state);
  return true;
}

function beginTurn(state) {
  const me = state.players[state.active];
  for (const perm of me.board) {
    if (perm.frozen) { perm.frozen = false; continue; }
    perm.tapped = false;
    perm.sick = false;
  }
  me.landPlayed = false;
  state.combatDone = false;
  state.step = "main";
  say(state, `— ${poss(me)} turn —`, "turn");
  // Whoever moves first skips the first draw, the way they should.
  if (state.turn > 2 || state.active === 1) draw(state, me, 1, true);
  checkDeaths(state);
}

/* The whole board, flattened for a bot or a renderer. */
export function snapshot(state) {
  return state.players.map((pl) => ({
    name: pl.name,
    life: pl.life,
    hand: pl.hand.length,
    board: pl.board.map((p) => `${p.name}${p.kind === "creature" ? ` ${power(p)}/${toughness(p) - p.damage}` : ""}${p.tapped ? " (T)" : ""}`),
  }));
}
