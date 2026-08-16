/* Balance simulator for Deckdelve.

   The fight engine and the run state are both DOM-free, so a whole career -
   deck choices, camps, shrines, three floors of monsters - can be played
   thousands of times in Node. Tuning a deckbuilder by eye is hopeless: the
   first pass of these numbers looked fine for one fight and had the Adept
   losing 94% of runs on floor two.

       node tools/deck-sim.mjs [runs]

   What good output looks like: a fresh account clearing 35-50% of runs and a
   fully unlocked one 45-70% (the bot plays worse than a person, so these are
   a floor, not a ceiling); no class more than ~20 points off the others;
   normal fights 3-5 turns and bosses 6-9; almost nobody dying on floor 1;
   and around 18 Echoes a run against a 146-Echo unlock board, so a career is
   roughly eight runs.

   Not part of serving the site - nothing under games/ imports it. */

import { CARDS, CLASSES, FLOORS, NODES_PER_FLOOR } from "../games/deckdelve/data.js";
import * as combat from "../games/deckdelve/combat.js";
import * as run from "../games/deckdelve/run.js";

/* ---------- a reasonable, non-optimal player ---------------------------- */

// How much a card is worth to the pick-a-reward decision. Deliberately blunt:
// a real player's read is better than this, so results here are a floor.
const VALUE = {
  bulwark: 4, cleave: 4, riposte: 3, shieldbash: 3, warcry: 5, rampart: 5,
  secondwind: 3, colossus: 5, whirlwind: 5,
  firebolt: 4, frostbite: 4, hex: 3, channel: 3, chainlightning: 4, siphon: 3,
  leyline: 5, meteor: 5,
  nettle: 3, venomspray: 4, thorncoat: 4, regrowth: 4, cull: 4, symbiosis: 3,
  plague: 5, brambleveil: 5,
  vault: 3, steelnerve: 2, ration: 2, prepare: 2, fury: 4, adrenaline: 2,
};

const POWERS = new Set(["warcry", "rampart", "colossus", "leyline", "thorncoat", "regrowth", "brambleveil"]);

function incomingDamage(state) {
  return combat.livingEnemies(state).reduce((sum, enemy) => {
    const intent = combat.intentPreview(enemy);
    return intent?.kind === "attack" ? sum + intent.amount * intent.times : sum;
  }, 0);
}

function chooseCard(state) {
  const hero = state.hero;
  const foes = combat.livingEnemies(state);
  const playable = state.hand
    .map((card, index) => ({ card, index, def: combat.defOf(card) }))
    .filter((c) => c.def.cost <= hero.energy);
  if (!playable.length) return null;

  const weakest = foes.slice().sort((a, b) => a.hp + a.block - (b.hp + b.block))[0];
  const toughest = foes.slice().sort((a, b) => b.hp - a.hp)[0];
  const threat = Math.max(0, incomingDamage(state) - hero.block);

  const find = (test) => playable.find(test);

  // Free draw and energy first - they only ever add options.
  const free = find((c) => c.def.cost === 0 && c.def.effects.some((e) => e.kind === "draw" || e.kind === "energy"));
  if (free) return { ...free, target: null };

  // Powers early, while there are still turns left for them to pay off.
  if (state.turn <= 3) {
    const power = find((c) => POWERS.has(c.card.id));
    if (power) return { ...power, target: null };
  }

  // Debuffs land best on whatever is going to live longest.
  const debuff = find((c) => c.def.target === "enemy" && c.def.effects.every((e) => e.kind === "status"));
  if (debuff && toughest && !combat.stackOf(toughest, "vulnerable")) {
    return { ...debuff, target: toughest.uid };
  }

  // Block up if the telegraphed hit would actually hurt.
  if (threat >= 6) {
    const guard = find((c) => c.def.effects.some((e) => e.kind === "block") && !c.def.effects.some((e) => e.kind === "damage"));
    if (guard) return { ...guard, target: null };
  }

  const sweep = find((c) => c.def.effects.some((e) => e.kind === "damage" && e.all));
  if (sweep && foes.length >= 2) return { ...sweep, target: null };

  const attack = find((c) => c.def.effects.some((e) => e.kind === "damage"));
  if (attack && (weakest || attack.def.target !== "enemy")) {
    return { ...attack, target: attack.def.target === "enemy" ? weakest.uid : null };
  }

  const any = find((c) => c.def.target !== "enemy");
  return any ? { ...any, target: null } : null;
}

function fight(state, cap = 60) {
  let turns = 0;
  while (!state.over && turns < cap) {
    turns++;
    for (let guard = 0; guard < 20 && !state.over; guard++) {
      const choice = chooseCard(state);
      if (!choice) break;
      const before = state.hand.length;
      combat.playCard(state, choice.index, choice.target);
      if (state.hand.length === before) break; // refused - stop rather than spin
    }
    if (state.over) break;
    combat.endTurn(state);
  }
  return turns;
}

/* ---------- deck decisions ---------------------------------------------- */

function takeReward(state, choices) {
  const best = choices
    .map((c) => ({ c, score: VALUE[c.id] || 1 }))
    .sort((a, b) => b.score - a.score)[0];
  // Deck thinning matters more than raw card quality: every card added is one
  // more chance to draw filler instead of the card that wins the turn.
  const limit = state.deck.length >= 18 ? 5 : state.deck.length >= 14 ? 4 : 2;
  if (best.score >= limit) run.addCard(state, best.c);
}

function camp(state) {
  if (state.hp < state.maxHp * 0.55) {
    run.restHeal(state);
    return;
  }
  const index = state.deck.findIndex((c) => run.canUpgrade(c) && CARDS[c.id].cost >= 1 && !CARDS[c.id].neutral);
  if (index >= 0) run.upgradeCard(state, index);
  else run.restHeal(state);
}

function shrine(state, meta, rng) {
  const basics = ["strike", "guard", "bolt", "ward", "rake", "bark"];
  const index = state.deck.findIndex((c) => basics.includes(c.id) && !c.upgraded);
  if (state.deck.length > 10 && index >= 0) {
    run.removeCard(state, index);
    return;
  }
  takeReward(state, run.shrineChoices(state, rng));
}

/* ---------- one full run ------------------------------------------------ */

function playRun(classId, meta, rng = Math.random) {
  const state = run.newRun(classId, meta);
  const cls = run.classById(classId);
  const turnsByKind = [];

  while (!state.over) {
    const options = run.rollOptions(state, rng);
    // Prefer the fight when healthy, the camp when not.
    const wantsRest = state.hp < state.maxHp * 0.5;
    const node = options.length === 1
      ? options[0]
      : options.find((o) => (wantsRest ? o.type === "rest" : o.type !== "rest")) || options[0];

    if (node.type === "rest") camp(state);
    else if (node.type === "shrine") shrine(state, meta, rng);
    else {
      const fightState = combat.startCombat({
        hero: { name: cls.name, sprite: cls.sprite, hp: state.hp, maxHp: state.maxHp, maxEnergy: state.energy },
        deck: state.deck,
        enemies: node.enemies,
        rng,
        extraDraw: run.hasUnlock(meta, "reserve") ? 1 : 0,
      });
      const turns = fight(fightState);
      const lost = state.hp - fightState.hero.hp;
      state.hp = fightState.hero.hp;

      if (fightState.over !== "victory") {
        run.loseRun(state);
        return { state, turnsByKind, deathFloor: state.floor, deathNode: node.type };
      }
      turnsByKind.push({ kind: node.type, floor: state.floor, turns, lost });
      run.winFight(state, node.type);
      takeReward(state, run.rewardChoices(state, meta, rng));
    }
    run.advance(state);
  }
  return { state, turnsByKind };
}

/* ---------- report ------------------------------------------------------ */

const N = Number(process.argv[2]) || 400;
const fullMeta = { ...run.newMeta(), unlocked: ["vigor", "arsenal", "warden", "honing", "reserve", "insight"] };

for (const meta of [{ label: "fresh account (no unlocks)", meta: run.newMeta() },
                    { label: "everything unlocked", meta: fullMeta }]) {
  console.log(`\n=== ${meta.label} ===`);
  console.log("class      cleared   avg floor   echoes   deck   deaths by floor");

  for (const cls of CLASSES) {
    if (run.classIsLocked(cls, meta.meta)) continue;
    let cleared = 0, echoes = 0, floors = 0, deck = 0;
    const deaths = [0, 0, 0];
    const turns = { fight: [], elite: [], boss: [] };
    const lost = { fight: [], elite: [], boss: [] };

    for (let i = 0; i < N; i++) {
      const result = playRun(cls.id, meta.meta, Math.random);
      const state = result.state;
      if (state.over === "cleared") cleared++;
      else deaths[Math.min(2, state.floor)]++;
      echoes += state.echoes;
      floors += state.floor + state.node / (NODES_PER_FLOOR + 1);
      deck += state.deck.length;
      for (const entry of result.turnsByKind) {
        (turns[entry.kind] ||= []).push(entry.turns);
        (lost[entry.kind] ||= []).push(entry.lost);
      }
    }

    const avg = (list) => (list.length ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(1) : "-");
    console.log(
      `${cls.name.padEnd(10)} ${String(Math.round(cleared / N * 100)).padStart(4)}%   ` +
      `${(floors / N).toFixed(2).padStart(9)}   ${(echoes / N).toFixed(1).padStart(6)}   ` +
      `${(deck / N).toFixed(1).padStart(4)}   ${deaths.join(" / ")}` +
      `   turns ${avg(turns.fight)}/${avg(turns.elite)}/${avg(turns.boss)}` +
      `   hp lost ${avg(lost.fight)}/${avg(lost.elite)}/${avg(lost.boss)}`
    );
  }
}
