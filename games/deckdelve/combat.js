/* The fight engine.

   No DOM in here. playCard() and endTurn() mutate the state and hand back a
   flat list of events describing what happened, in order; the UI replays that
   list with animation and the balance simulator ignores it entirely. That
   split is what makes tools/deck-sim.mjs able to play a thousand runs in
   Node - the rules never wait on a transition to finish. */

import { cardDef, ENEMIES, HAND_SIZE, MAX_ENERGY, STATUSES } from "./data.js";

let nextUid = 1;
const uid = (prefix) => `${prefix}${nextUid++}`;

/* Every card in a deck is an instance: same printed card, own upgrade state,
   own identity in the discard pile. */
export function makeCard(id, upgraded = false) {
  return { uid: uid("c"), id, upgraded: !!upgraded };
}

export function defOf(card) {
  return cardDef(card.id, card.upgraded);
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const roll = (range, rng) => range[0] + Math.floor(rng() * (range[1] - range[0] + 1));

export const livingEnemies = (state) => state.enemies.filter((e) => e.alive);

export function findTarget(state, uid) {
  if (state.hero.uid === uid) return state.hero;
  return state.enemies.find((e) => e.uid === uid);
}

function makeEnemy(key, rng, label) {
  const def = ENEMIES[key];
  const hp = roll(def.hp, rng);
  return {
    uid: uid("e"),
    key,
    name: label || def.name,
    sprite: def.sprite,
    side: "enemy",
    boss: !!def.boss,
    hp,
    maxHp: hp,
    block: 0,
    statuses: {},
    alive: true,
    step: 0,
    intent: null,
  };
}

/* Two of the same monster get A/B suffixes so the player can say which one
   they mean. */
function buildEnemies(keys, rng) {
  const counts = {};
  keys.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
  const seen = {};
  return keys.map((k) => {
    if (counts[k] === 1) return makeEnemy(k, rng);
    seen[k] = (seen[k] || 0) + 1;
    return makeEnemy(k, rng, `${ENEMIES[k].name} ${"ABCD"[seen[k] - 1]}`);
  });
}

export function startCombat({ hero, deck, enemies, rng = Math.random, extraDraw = 0 }) {
  const state = {
    rng,
    turn: 0,
    over: null,
    extraDraw, // Reserve unlock: only spent on the first turn
    hero: {
      uid: "hero",
      side: "hero",
      name: hero.name,
      sprite: hero.sprite,
      hp: hero.hp,
      maxHp: hero.maxHp,
      block: 0,
      energy: 0,
      maxEnergy: hero.maxEnergy || MAX_ENERGY,
      statuses: {},
      alive: true,
    },
    enemies: buildEnemies(enemies, rng),
    draw: shuffle(deck.map((c) => makeCard(c.id, c.upgraded)), rng),
    hand: [],
    discard: [],
    exhausted: [],
  };
  for (const enemy of state.enemies) planIntent(state, enemy);
  beginTurn(state);
  return state;
}

/* ---------- statuses ---------------------------------------------------- */

export const stackOf = (fighter, status) => fighter.statuses[status] || 0;

function addStatus(state, fighter, status, amount, events) {
  if (!fighter.alive || amount <= 0) return;
  fighter.statuses[status] = stackOf(fighter, status) + amount;
  events.push({ t: "status", uid: fighter.uid, status, amount });
}

/* Timers tick down at the end of their owner's turn; stacks (poison) and
   powers (Strength and friends) are handled elsewhere. Driven off STATUSES so
   adding a status to the data cannot quietly leave it permanent. */
const TIMERS = Object.entries(STATUSES).filter(([, s]) => s.decay === "turn").map(([id]) => id);

function decayTimers(fighter) {
  for (const status of TIMERS) {
    if (fighter.statuses[status] > 0 && --fighter.statuses[status] <= 0) {
      delete fighter.statuses[status];
    }
  }
}

/* ---------- damage ------------------------------------------------------ */

function outgoing(attacker, amount) {
  let value = amount + stackOf(attacker, "strength");
  if (stackOf(attacker, "weak") > 0) value *= 0.75;
  return Math.max(0, Math.floor(value));
}

function dealDamage(state, attacker, target, raw, events) {
  if (!target.alive) return 0;
  let amount = raw;
  if (stackOf(target, "vulnerable") > 0) amount = Math.floor(amount * 1.5);

  const blocked = Math.min(target.block, amount);
  target.block -= blocked;
  const through = amount - blocked;
  target.hp = Math.max(0, target.hp - through);
  events.push({ t: "hit", uid: target.uid, amount, blocked, hp: target.hp });

  // Thorns answer the attack itself, so they bite even when the hit was
  // fully blocked.
  if (attacker && stackOf(target, "thorns") > 0) {
    const spikes = stackOf(target, "thorns");
    const soaked = Math.min(attacker.block, spikes);
    attacker.block -= soaked;
    attacker.hp = Math.max(0, attacker.hp - (spikes - soaked));
    events.push({ t: "hit", uid: attacker.uid, amount: spikes, blocked: soaked, hp: attacker.hp, thorns: true });
    checkDeath(state, attacker, events);
  }

  checkDeath(state, target, events);
  return through;
}

function loseHp(state, fighter, amount, events) {
  if (!fighter.alive || amount <= 0) return;
  fighter.hp = Math.max(0, fighter.hp - amount);
  events.push({ t: "hit", uid: fighter.uid, amount, blocked: 0, hp: fighter.hp, poison: true });
  checkDeath(state, fighter, events);
}

function heal(state, fighter, amount, events) {
  if (!fighter.alive) return;
  const before = fighter.hp;
  fighter.hp = Math.min(fighter.maxHp, fighter.hp + amount);
  if (fighter.hp !== before) events.push({ t: "heal", uid: fighter.uid, amount: fighter.hp - before });
}

function checkDeath(state, fighter, events) {
  if (fighter.hp > 0 || !fighter.alive) return;
  fighter.alive = false;
  events.push({ t: "die", uid: fighter.uid });
  if (fighter.side === "hero") finish(state, "defeat", events);
  else if (!livingEnemies(state).length) finish(state, "victory", events);
}

function finish(state, result, events) {
  if (state.over) return;
  state.over = result;
  events.push({ t: "over", result });
}

/* ---------- the draw pile ----------------------------------------------- */

function drawCards(state, count, events) {
  for (let i = 0; i < count; i++) {
    if (!state.draw.length) {
      if (!state.discard.length) return; // deck genuinely exhausted
      state.draw = shuffle(state.discard, state.rng);
      state.discard = [];
      events.push({ t: "reshuffle" });
    }
    state.hand.push(state.draw.pop());
    events.push({ t: "draw" });
  }
}

/* ---------- turns ------------------------------------------------------- */

function beginTurn(state) {
  const events = [];
  const hero = state.hero;
  state.turn += 1;
  hero.block = 0;
  hero.energy = hero.maxEnergy + stackOf(hero, "surge");

  if (stackOf(hero, "regen") > 0) heal(state, hero, stackOf(hero, "regen"), events);
  if (stackOf(hero, "rampart") > 0) {
    hero.block += stackOf(hero, "rampart");
    events.push({ t: "block", uid: hero.uid, amount: stackOf(hero, "rampart") });
  }
  if (stackOf(hero, "poison") > 0) {
    loseHp(state, hero, stackOf(hero, "poison"), events);
    hero.statuses.poison -= 1;
    if (hero.statuses.poison <= 0) delete hero.statuses.poison;
  }
  if (state.over) return events;

  const bonus = state.turn === 1 ? state.extraDraw : 0;
  drawCards(state, HAND_SIZE + bonus, events);
  events.push({ t: "turn", n: state.turn });
  return events;
}

export function endTurn(state) {
  if (state.over) return [];
  const events = [];

  // Everything left in hand is discarded; nothing is retained between turns.
  state.discard.push(...state.hand);
  state.hand = [];
  decayTimers(state.hero);

  for (const enemy of state.enemies) {
    if (!enemy.alive || state.over) continue;

    if (stackOf(enemy, "poison") > 0) {
      loseHp(state, enemy, stackOf(enemy, "poison"), events);
      enemy.statuses.poison -= 1;
      if (enemy.statuses.poison <= 0) delete enemy.statuses.poison;
      if (!enemy.alive) continue;
    }
    if (state.over) break;

    enemy.block = 0;
    takeEnemyTurn(state, enemy, events);
    decayTimers(enemy);
  }

  if (state.over) return events;

  for (const enemy of livingEnemies(state)) planIntent(state, enemy);
  return events.concat(beginTurn(state));
}

function takeEnemyTurn(state, enemy, events) {
  const move = enemy.intent;
  if (!move) return;
  events.push({ t: "act", uid: enemy.uid, move });

  switch (move.kind) {
    case "attack": {
      const hits = move.times || 1;
      for (let i = 0; i < hits && !state.over; i++) {
        dealDamage(state, enemy, state.hero, outgoing(enemy, move.amount), events);
      }
      break;
    }
    case "block":
      enemy.block += move.amount;
      events.push({ t: "block", uid: enemy.uid, amount: move.amount });
      break;
    case "status":
      addStatus(state, state.hero, move.status, move.amount, events);
      break;
    case "buff":
      addStatus(state, enemy, move.status, move.amount, events);
      break;
  }
}

function planIntent(state, enemy) {
  const def = ENEMIES[enemy.key];
  const index = def.pattern
    ? def.pattern[enemy.step % def.pattern.length]
    : Math.floor(state.rng() * def.moves.length);
  enemy.step += 1;
  enemy.intent = def.moves[index];
}

/* What the player sees above a monster's head: the actual damage it will do,
   Strength and Weak already folded in, so the number never lies. */
export function intentPreview(enemy) {
  const move = enemy.intent;
  if (!move) return null;
  if (move.kind === "attack") {
    return { kind: "attack", amount: outgoing(enemy, move.amount), times: move.times || 1 };
  }
  return { kind: move.kind, status: move.status, amount: move.amount };
}

/* ---------- playing a card ---------------------------------------------- */

export function canPlay(state, card) {
  if (state.over) return false;
  return state.hero.energy >= defOf(card).cost;
}

export function needsTarget(card) {
  const def = defOf(card);
  return def.target === "enemy";
}

export function playCard(state, handIndex, targetUid) {
  const card = state.hand[handIndex];
  if (!card || state.over) return [];
  const def = defOf(card);
  if (state.hero.energy < def.cost) return [];

  const target = targetUid ? findTarget(state, targetUid) : null;
  if (def.target === "enemy" && (!target || !target.alive)) return [];

  const events = [];
  state.hero.energy -= def.cost;
  state.hand.splice(handIndex, 1);
  events.push({ t: "play", card: card.uid, name: def.name });

  for (const effect of def.effects) {
    if (state.over) break;
    applyEffect(state, effect, target, events);
  }

  if (def.exhaust) state.exhausted.push(card);
  else state.discard.push(card);

  return events;
}

function applyEffect(state, effect, target, events) {
  const hero = state.hero;
  switch (effect.kind) {
    case "damage": {
      const targets = effect.all ? livingEnemies(state) : [target];
      const times = effect.times || 1;
      for (let i = 0; i < times; i++) {
        for (const each of effect.random ? [randomEnemy(state)] : targets) {
          if (!each || !each.alive || state.over) continue;
          let base = effect.scale === "block" ? hero.block + (effect.bonus || 0) : effect.amount;
          if (effect.bonusIfPoisoned && stackOf(each, "poison") > 0) base += effect.bonusIfPoisoned;
          dealDamage(state, hero, each, outgoing(hero, base), events);
        }
      }
      break;
    }
    case "block":
      hero.block += effect.amount;
      events.push({ t: "block", uid: hero.uid, amount: effect.amount });
      break;
    case "draw":
      drawCards(state, effect.amount, events);
      break;
    case "energy":
      hero.energy += effect.amount;
      events.push({ t: "energy", amount: effect.amount });
      break;
    case "heal":
      heal(state, hero, effect.amount, events);
      break;
    case "status": {
      const targets = effect.all ? livingEnemies(state) : [target];
      for (const each of targets) addStatus(state, each, effect.status, effect.amount, events);
      break;
    }
    case "buff":
      addStatus(state, hero, effect.status, effect.amount, events);
      break;
  }
}

function randomEnemy(state) {
  const alive = livingEnemies(state);
  if (!alive.length) return null;
  return alive[Math.floor(state.rng() * alive.length)];
}
