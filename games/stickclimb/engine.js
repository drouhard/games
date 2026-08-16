/* The rules. No DOM, no timers, no randomness of its own - a fight is a plain
   object you push fixed steps into, so tools/climb-sim.mjs can play thousands
   of them in Node at whatever speed it likes.

   The fight is a duel on one screen. The foe throws a hazard that travels
   from its side to yours; a low one is jumped, a high one is slid under. Read
   it right and you bank momentum, read it wrong and you eat the hit. Your
   damage comes from tapping Strike, from spending momentum on Heavy, and from
   the Shadow Twin ticking away underneath all of it. */

import { TUNING, foeAt, stats } from "./data.js";

export const STEP = 1 / 60; // both the browser loop and the simulator use this

export function startFight(save, index = save.target) {
  const st = stats(save);
  const foe = foeAt(index);
  return {
    foe: { ...foe, hp: foe.maxHp },
    hp: st.maxHp,
    maxHp: st.maxHp,
    // `stance` is what the hazard check reads; `swing` is only ever animation,
    // which is why they are separate - punching must not cancel a slide.
    stance: "idle",
    stanceT: 0,
    swing: 0,
    hazards: [],
    nextAttack: foe.period * 0.9,
    momentum: 0,
    cd: { strike: 0, heavy: 0, focus: 0 },
    focusT: 0,
    time: 0,
    dodged: 0,
    taken: 0,
    over: null, // 'won' | 'lost'
    events: [],
  };
}

function emit(fight, event) {
  fight.events.push(event);
}

function setStance(fight, stance, duration) {
  fight.stance = stance;
  fight.stanceT = duration;
}

function damageFoe(fight, amount, source) {
  if (fight.over) return;
  const dealt = Math.min(fight.foe.hp, amount);
  fight.foe.hp -= dealt;
  if (source !== "auto") emit(fight, { type: "hit", amount: dealt, source });
  if (fight.foe.hp <= 0) {
    fight.foe.hp = 0;
    fight.over = "won";
    emit(fight, { type: "won" });
  }
}

function damageMult(fight, st) {
  return fight.focusT > 0 ? TUNING.focusMult : 1;
}

/* A tap. Returns false when the action was refused, so the interface can
   buzz the button instead of silently eating the press. */
export function input(fight, save, kind) {
  if (fight.over) return false;
  const st = stats(save);

  if (kind === "jump" || kind === "slide") {
    if (fight.stance !== "idle") return false;
    setStance(fight, kind === "jump" ? "air" : "slide", kind === "jump" ? st.airTime : st.slideTime);
    return true;
  }

  if (fight.stance === "hurt") return false; // reeling: no attacks either

  if (kind === "strike") {
    if (fight.cd.strike > 0) return false;
    fight.cd.strike = TUNING.strikeCd;
    fight.swing = 0.16;
    damageFoe(fight, st.strike * damageMult(fight, st), "strike");
    return true;
  }

  if (kind === "heavy") {
    if (fight.cd.heavy > 0 || fight.momentum <= 0) return false;
    fight.cd.heavy = TUNING.heavyCd;
    fight.swing = 0.26;
    const power = 1 + st.momentumPower * fight.momentum;
    const spent = fight.momentum;
    fight.momentum = 0;
    damageFoe(fight, st.strike * TUNING.heavyMult * power * damageMult(fight, st), "heavy");
    emit(fight, { type: "spend", momentum: spent });
    return true;
  }

  if (kind === "focus") {
    if (fight.cd.focus > 0) return false;
    fight.cd.focus = TUNING.focusCd;
    fight.focusT = TUNING.focusDur;
    emit(fight, { type: "focus" });
    return true;
  }

  return false;
}

function resolveHazard(fight, hazard) {
  const safe = hazard.kind === "low" ? fight.stance === "air" : fight.stance === "slide";
  if (safe) {
    fight.dodged += 1;
    fight.momentum = Math.min(TUNING.momentumCap, fight.momentum + 1);
    emit(fight, { type: "dodge", kind: hazard.kind, momentum: fight.momentum });
    return;
  }
  fight.hp -= fight.foe.hit;
  fight.taken += fight.foe.hit;
  fight.momentum = 0;
  setStance(fight, "hurt", TUNING.hurtTime);
  emit(fight, { type: "hurt", amount: fight.foe.hit });
  if (fight.hp <= 0) {
    fight.hp = 0;
    fight.over = "lost";
    emit(fight, { type: "lost" });
  }
}

/* One fixed tick. `rng` is passed in rather than reached for, so a simulated
   climb can be replayed exactly. */
export function step(fight, save, rng = Math.random, dt = STEP) {
  if (fight.over) return fight.events;
  const st = stats(save);
  fight.time += dt;

  for (const key of Object.keys(fight.cd)) fight.cd[key] = Math.max(0, fight.cd[key] - dt);
  fight.focusT = Math.max(0, fight.focusT - dt);
  fight.swing = Math.max(0, fight.swing - dt);

  if (fight.stance !== "idle") {
    fight.stanceT -= dt;
    if (fight.stanceT <= 0) setStance(fight, "idle", 0);
  }

  if (st.autoDps > 0) damageFoe(fight, st.autoDps * damageMult(fight, st) * dt, "auto");
  if (fight.over) return fight.events;

  fight.hp = Math.min(fight.maxHp, fight.hp + fight.maxHp * st.regen * dt);

  fight.nextAttack -= dt;
  if (fight.nextAttack <= 0) {
    fight.hazards.push({ kind: rng() < 0.5 ? "low" : "high", p: 0, speed: 1 / fight.foe.travel });
    fight.nextAttack = fight.foe.period * (0.85 + rng() * 0.3);
    emit(fight, { type: "windup" });
  }

  for (const hazard of fight.hazards) hazard.p += hazard.speed * dt;
  // Walk a copy: resolving can end the fight, and the list is rebuilt anyway.
  const landed = fight.hazards.filter((h) => h.p >= 1);
  fight.hazards = fight.hazards.filter((h) => h.p < 1);
  for (const hazard of landed) {
    if (fight.over) break;
    resolveHazard(fight, hazard);
  }

  return fight.events;
}

export function drainEvents(fight) {
  const events = fight.events;
  fight.events = [];
  return events;
}

export function payout(save, index) {
  return foeAt(index).bounty * stats(save).scrapMult;
}

/* Beating a rung banks its bounty and, the first time, opens the next one.
   Losing costs the time you spent and nothing else: the retry has to start
   from exactly the strength that just failed, or a bad run turns into a
   spiral. */
export function resolveWin(save, index) {
  const gain = payout(save, index);
  save.scrap += gain;
  save.kills += 1;
  const firstClear = index > save.best;
  if (firstClear) {
    save.best = index;
    save.target = index + 1;
  }
  return { gain, firstClear };
}

/* What the Shadow Twin ground out while the tab was closed. It only ever
   farms the rung you left it on, only if that rung is already cleared, and
   only at a fraction of your live rate - so coming back is a nice lump, not a
   reason to stop playing. */
export function offlineGains(save, seconds) {
  const st = stats(save);
  const capped = Math.min(TUNING.offlineCap, Math.max(0, seconds));
  if (st.autoDps <= 0 || capped < 30) return null;
  const index = Math.min(save.target, save.best);
  if (index < 0) return null;
  const foe = foeAt(index);
  const perKill = foe.maxHp / (st.autoDps * TUNING.offlineRate);
  const kills = Math.floor(capped / perKill);
  if (kills <= 0) return null;
  return { kills, scrap: kills * foe.bounty * st.scrapMult, seconds: capped, foe };
}
