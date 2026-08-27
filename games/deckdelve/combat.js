/* The duel.

   One monster, one hero, and two decks. A round runs in this order:

     1. the monster draws its hand and plays all of it, face up
     2. you draw to your hand size and play what you like - knowing exactly
        what is coming, because it has already committed
     3. both swings land: your Attack less its Defense, then its Attack less
        your Defense. You strike first, so killing it means never being hit.

   Attack and Defense are pools that empty every round; the class resource
   (Rage, Mana, Venom) is not, which is what makes banking it a decision.

   No DOM in here. tools/deck-sim.mjs plays thousands of these in Node. */

import { CARDS, FOES, FOE_CARDS, PATIENCE, cardDef } from "./data.js";

let nextUid = 1;
const uid = (prefix) => `${prefix}${nextUid++}`;

export const makeCard = (id, upgraded = false) => ({ uid: uid("c"), id, upgraded: !!upgraded });
export const defOf = (card) => cardDef(card.id, card.upgraded);

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const roll = (range, rng) => range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
export const stackOf = (who, status) => who.statuses[status] || 0;

/* ---------- setting up --------------------------------------------------- */

export function makeFoe(key, { elite = false, scale = null, rng = Math.random } = {}) {
  const def = FOES[key];
  const mult = elite && scale ? scale : null;
  const hp = Math.round(roll(def.hp, rng) * (mult ? mult.hp : 1));
  return {
    key,
    side: "foe",
    name: elite ? `Dire ${def.name}` : def.name,
    sprite: def.sprite,
    boss: !!def.boss,
    elite,
    hp,
    maxHp: hp,
    attack: 0,
    defense: 0,
    statuses: {},
    alive: true,
    draws: def.draws + (mult ? mult.draws : 0),
    deck: def.deck.slice(),
    draw: [],
    discard: [],
    played: [],
    xp: Math.round(def.xp * (mult ? mult.xp : 1)),
    gold: Math.round(roll(def.gold, rng) * (mult ? mult.gold : 1)),
  };
}

export function startCombat({ hero, deck, foe, rng = Math.random }) {
  const state = {
    rng,
    round: 0,
    over: null, // 'win' | 'lose'
    log: [],
    hero: {
      side: "hero",
      name: hero.name,
      sprite: hero.sprite,
      hp: hero.hp,
      maxHp: hero.maxHp,
      attack: 0,
      defense: 0,
      res: hero.startRes || 0,
      resName: hero.resName,
      ragePerRound: !!hero.ragePerRound,
      handSize: hero.hand,
      statuses: {},
      alive: true,
      hurtThisRound: false,
    },
    foe,
    draw: shuffle(deck.map((c) => makeCard(c.id, c.upgraded)), rng),
    hand: [],
    discard: [],
    playedThisRound: 0,
  };
  state.foe.draw = shuffle(state.foe.deck.slice(), rng);
  beginRound(state);
  return state;
}

/* ---------- rounds ------------------------------------------------------- */

function drawFor(state, count, events) {
  for (let i = 0; i < count; i++) {
    if (!state.draw.length) {
      if (!state.discard.length) return;
      state.draw = shuffle(state.discard, state.rng);
      state.discard = [];
      events.push({ t: "reshuffle" });
    }
    state.hand.push(state.draw.pop());
  }
}

function foeDraw(state) {
  if (!state.foe.draw.length) {
    state.foe.draw = shuffle(state.foe.discard, state.rng);
    state.foe.discard = [];
  }
  return state.foe.draw.pop();
}

function beginRound(state) {
  const events = [];
  const { hero, foe } = state;
  state.round += 1;
  state.playedThisRound = 0;
  hero.hurtThisRound = false;

  hero.attack = stackOf(hero, "edge");
  hero.defense = 0;
  foe.attack = stackOf(foe, "edge");
  foe.defense = 0;
  delete hero.statuses.soften;
  if (stackOf(hero, "flow") > 0) hero.res += stackOf(hero, "flow");

  // The monster commits first, in the open.
  foe.played = [];
  for (let i = 0; i < foe.draws; i++) {
    const id = foeDraw(state);
    if (!id) break;
    const card = FOE_CARDS[id];
    foe.discard.push(id);
    foe.played.push(card.name);
    for (const effect of card.effects) applyEffect(state, foe, hero, effect, events);
  }
  events.push({ t: "foeTurn", cards: foe.played.slice() });

  drawFor(state, hero.handSize, events);
  events.push({ t: "round", n: state.round });
  return events;
}

/* ---------- effects ------------------------------------------------------ */

function addStatus(who, status, amount) {
  if (amount <= 0) return;
  who.statuses[status] = stackOf(who, status) + amount;
}

function applyEffect(state, source, target, effect, events) {
  switch (effect.kind) {
    case "attack": {
      let amount = effect.scale === "defense"
        ? source.defense + (effect.bonus || 0)
        : effect.amount;
      if (effect.plusIfPoisoned && stackOf(target, "poison") > 0) amount += effect.plusIfPoisoned;
      source.attack += amount;
      break;
    }
    case "defense": source.defense += effect.amount; break;
    case "res": source.res = (source.res || 0) + effect.amount; break;
    case "draw": drawFor(state, effect.amount, events); break;
    case "heal": {
      const before = source.hp;
      source.hp = Math.min(source.maxHp, source.hp + effect.amount);
      if (source.hp !== before) events.push({ t: "heal", side: source.side, amount: source.hp - before });
      break;
    }
    case "poison": addStatus(target, "poison", effect.amount); break;
    // The monster has already played, so shaving its swing takes effect now;
    // shaving yours has to wait for the resolution, hence Soften.
    case "weaken":
      if (target.side === "foe") target.attack = Math.max(0, target.attack - effect.amount);
      else addStatus(target, "soften", effect.amount);
      break;
    case "thorns": addStatus(source, "thorns", effect.amount); break;
    case "edge": addStatus(source, "edge", effect.amount); source.attack += effect.amount; break;
    case "regen": addStatus(source, "regen", effect.amount); break;
    case "flow": addStatus(source, "flow", effect.amount); source.res += effect.amount; break;
  }
}

/* ---------- playing a card ----------------------------------------------- */

export function canPlay(state, card) {
  if (state.over) return false;
  return (defOf(card).cost || 0) <= state.hero.res;
}

export function playCard(state, index, modeIndex = 0) {
  const card = state.hand[index];
  if (!card || state.over) return [];
  const def = defOf(card);
  const cost = def.cost || 0;
  if (cost > state.hero.res) return [];

  const events = [];
  state.hero.res -= cost;
  state.hand.splice(index, 1);
  state.discard.push(card);
  state.playedThisRound += 1;

  const effects = def.modes ? def.modes[modeIndex]?.effects ?? def.modes[0].effects : def.effects;
  for (const effect of effects) applyEffect(state, state.hero, state.foe, effect, events);
  events.push({ t: "play", name: def.name });
  return events;
}

/* ---------- ending the round --------------------------------------------- */

function hurt(state, target, amount, events, { pierce = false, from = null } = {}) {
  if (amount <= 0) return 0;
  target.hp = Math.max(0, target.hp - amount);
  events.push({ t: "hit", side: target.side, amount, pierce });
  if (target.side === "hero") state.hero.hurtThisRound = true;
  if (from && stackOf(target, "thorns") > 0) {
    const spikes = stackOf(target, "thorns");
    from.hp = Math.max(0, from.hp - spikes);
    events.push({ t: "hit", side: from.side, amount: spikes, thorns: true });
  }
  return amount;
}

export function endRound(state) {
  if (state.over) return [];
  const events = [];
  const { hero, foe } = state;

  state.discard.push(...state.hand);
  state.hand = [];

  // You swing first: a monster killed outright never gets to answer.
  const swing = Math.max(0, hero.attack - stackOf(hero, "soften"));
  const landed = Math.max(0, swing - foe.defense);
  events.push({ t: "swing", side: "hero", raw: swing, blocked: Math.min(swing, foe.defense), landed });
  if (landed > 0) hurt(state, foe, landed, events, { from: hero });

  if (foe.hp <= 0) {
    foe.alive = false;
    state.over = "win";
    events.push({ t: "over", result: "win" });
    return events;
  }

  const back = Math.max(0, foe.attack - hero.defense);
  events.push({ t: "swing", side: "foe", raw: foe.attack, blocked: Math.min(foe.attack, hero.defense), landed: back });
  if (foe.attack > 0) hurt(state, hero, back, events, { from: foe });

  // End-of-round upkeep: poison bites through armour, regen mends.
  for (const who of [foe, hero]) {
    const poison = stackOf(who, "poison");
    if (poison > 0) {
      hurt(state, who, poison, events, { pierce: true });
      who.statuses.poison -= 1;
      if (who.statuses.poison <= 0) delete who.statuses.poison;
    }
    const regen = stackOf(who, "regen");
    if (regen > 0 && who.hp > 0) {
      const before = who.hp;
      who.hp = Math.min(who.maxHp, who.hp + regen);
      if (who.hp !== before) events.push({ t: "heal", side: who.side, amount: who.hp - before });
    }
  }

  // Neither of you can outlast the dungeon itself.
  if (state.round > PATIENCE) {
    const press = state.round - PATIENCE;
    events.push({ t: "press", amount: press });
    hurt(state, foe, press, events, { pierce: true });
    if (hero.hp > 0) hurt(state, hero, press, events, { pierce: true });
  }

  // A Knight banks Rage simply for still being there, and faster for having
  // been hit - the class wants the fight to go one round longer.
  if (hero.ragePerRound && hero.hp > 0) hero.res += hero.hurtThisRound ? 2 : 1;

  if (foe.hp <= 0) {
    foe.alive = false;
    state.over = "win";
    events.push({ t: "over", result: "win" });
    return events;
  }
  if (hero.hp <= 0) {
    hero.alive = false;
    state.over = "lose";
    events.push({ t: "over", result: "lose" });
    return events;
  }

  return events.concat(beginRound(state));
}

/* What the monster is holding, for the inspector: its whole deck, which is
   the only honest way to show a duellist's intentions. */
export function foeDeckList(foe) {
  const counts = new Map();
  for (const id of FOES[foe.key].deck) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, n]) => ({ name: FOE_CARDS[id].name, n, effects: FOE_CARDS[id].effects }));
}

export const KNOWN_CARDS = new Set(Object.keys(CARDS));
