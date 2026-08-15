/* The battle engine.

   Deliberately free of DOM: resolveRound() takes the queued commands and
   returns a flat list of events describing everything that happened, in
   order. The UI replays that list with animation, which keeps the rules
   testable on their own and stops presentation timing from leaking into
   the maths. */

import { SKILLS, STATUSES, ITEMS, ENEMIES } from "./data.js";

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const chance = (p) => Math.random() < p;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

let nextId = 1;

export function makeHeroFighter(hero, stats) {
  return {
    uid: `h${nextId++}`,
    heroId: hero.id,
    name: hero.name,
    sprite: hero.sprite,
    side: "ally",
    hp: stats.hp, maxHp: stats.maxHp,
    mp: stats.mp, maxMp: stats.maxMp,
    atk: stats.atk, def: stats.def, mag: stats.mag, res: stats.res, spd: stats.spd,
    weak: [], resist: [],
    statuses: [],
    defending: false,
    alive: stats.hp > 0,
    skills: stats.skills,
  };
}

export function makeEnemyFighter(key, label) {
  const e = ENEMIES[key];
  return {
    uid: `e${nextId++}`,
    enemyKey: key,
    name: label || e.name,
    sprite: e.sprite,
    side: "enemy",
    hp: e.hp, maxHp: e.hp,
    mp: 0, maxMp: 0,
    atk: e.atk, def: e.def, mag: e.mag, res: e.res, spd: e.spd,
    weak: e.weak || [], resist: e.resist || [],
    statuses: [],
    defending: false,
    alive: true,
    ai: e.ai,
    boss: !!e.boss,
    enrage: e.enrage || null,
    enraged: false,
    xp: e.xp, gold: e.gold,
  };
}

/* Two of the same monster in one fight get A/B/C suffixes, so "Attack the
   second Slime" is a thing the player can actually express. */
export function buildEnemies(keys) {
  const counts = {};
  keys.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
  const seen = {};
  return keys.map((k) => {
    if (counts[k] === 1) return makeEnemyFighter(k);
    seen[k] = (seen[k] || 0) + 1;
    return makeEnemyFighter(k, `${ENEMIES[k].name} ${"ABCD"[seen[k] - 1]}`);
  });
}

export function startBattle(allies, enemyKeys) {
  return {
    allies,
    enemies: buildEnemies(enemyKeys),
    round: 1,
    over: null, // 'victory' | 'defeat'
  };
}

export const living = (list) => list.filter((f) => f.alive);
export const allFighters = (state) => [...state.allies, ...state.enemies];
export const findFighter = (state, uid) => allFighters(state).find((f) => f.uid === uid);

/* Status modifiers are proportional and additive: Weaken (-0.3) plus Might
   (+0.4) nets +0.1 rather than one silently overriding the other. */
export function effectiveStat(fighter, stat) {
  let mult = 1;
  for (const s of fighter.statuses) {
    const mod = STATUSES[s.type]?.mod;
    if (mod && mod[stat] != null) mult += mod[stat];
  }
  if (stat === "def" && fighter.defending) mult += 1;
  return Math.max(1, fighter[stat] * Math.max(0.1, mult));
}

export function hasStatus(fighter, type) {
  return fighter.statuses.some((s) => s.type === type);
}

function addStatus(fighter, type, turns) {
  const existing = fighter.statuses.find((s) => s.type === type);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    return false;
  }
  fighter.statuses.push({ type, turns });
  return true;
}

function elementMultiplier(target, element) {
  if (!element) return 1;
  if (target.weak.includes(element)) return 1.6;
  if (target.resist.includes(element)) return 0.5;
  return 1;
}

function damageRoll(actor, target, opts) {
  const magic = opts.kind === "magic";
  const power = opts.power ?? 1;

  /* Defence divides rather than subtracts.

     Subtraction looks fine early and breaks late: defence grows every level,
     so by the endgame a knight's DEF exceeded the boss's ATK outright and
     every hit landed on the minimum-damage floor. Diminishing returns keep
     armour worth buying while leaving every attacker a real threat. */
  const SOFTENING = 48;
  const attack = magic ? effectiveStat(actor, "mag") * 1.9 : effectiveStat(actor, "atk") * 1.8;
  const guard = magic ? effectiveStat(target, "res") : effectiveStat(target, "def");

  let base = attack * (SOFTENING / (SOFTENING + guard));
  base *= power * rand(0.9, 1.1);

  // Vengeance and friends: the more HP the actor has lost, the harder it lands.
  if (opts.scaleMissingHp) base *= 1 + (1 - actor.hp / actor.maxHp) * 1.2;

  const crit = !magic && chance(1 / 16);
  if (crit) base *= 2;

  const mult = elementMultiplier(target, opts.element);
  base *= mult;

  return {
    amount: Math.max(1, Math.round(base)),
    crit,
    effective: mult > 1 ? "weak" : mult < 1 ? "resist" : null,
    element: opts.element || null,
  };
}

function applyDamage(state, target, amount, events, meta = {}) {
  target.hp = Math.max(0, target.hp - amount);
  events.push({ t: "damage", uid: target.uid, amount, ...meta });

  // Being hit shakes you awake - otherwise Slumber would be a stun-lock.
  if (hasStatus(target, "sleep") && amount > 0) {
    target.statuses = target.statuses.filter((s) => s.type !== "sleep");
    events.push({ t: "message", text: `${target.name} jolts awake!` });
  }
  if (target.hp === 0 && target.alive) {
    target.alive = false;
    events.push({ t: "ko", uid: target.uid });
  }
}

function applyHeal(state, target, amount, events) {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  events.push({ t: "heal", uid: target.uid, amount: target.hp - before });
}

function resolveTargets(state, actor, spec, requested) {
  const enemySide = actor.side === "ally" ? state.enemies : state.allies;
  const allySide = actor.side === "ally" ? state.allies : state.enemies;

  switch (spec) {
    case "enemies": return living(enemySide);
    case "allies": return living(allySide);
    case "self": return [actor];
    case "ko": {
      // Explicit pick if it's still valid, else any fallen ally.
      if (requested && !requested.alive) return [requested];
      const down = allySide.filter((f) => !f.alive);
      return down.length ? [pick(down)] : [];
    }
    case "ally": {
      if (requested && requested.alive) return [requested];
      const up = living(allySide);
      return up.length ? [pick(up)] : [];
    }
    case "enemy":
    default: {
      // Retarget rather than fizzle: the queued target may have died earlier
      // in the same round, and wasting the turn feels like a bug to a player.
      if (requested && requested.alive) return [requested];
      const up = living(enemySide);
      return up.length ? [pick(up)] : [];
    }
  }
}

function performSkill(state, actor, skill, requestedTarget, events) {
  const targets = resolveTargets(state, actor, skill.target, requestedTarget);
  if (!targets.length) {
    events.push({ t: "message", text: `${actor.name}'s ${skill.name} finds no target.` });
    return;
  }

  events.push({ t: "act", uid: actor.uid, label: skill.name, kind: skill.kind, element: skill.element || null });

  for (const target of targets) {
    if (skill.kind === "physical" || skill.kind === "magic") {
      const roll = damageRoll(actor, target, skill);
      applyDamage(state, target, roll.amount, events, {
        crit: roll.crit, effective: roll.effective, element: roll.element,
      });
      if (skill.drain) {
        const gain = Math.round(roll.amount * 0.5);
        applyHeal(state, actor, gain, events);
      }
      if (skill.status && target.alive && chance(skill.chance ?? 1)) {
        if (addStatus(target, skill.status, skill.turns ?? 3)) {
          events.push({ t: "status", uid: target.uid, status: skill.status, applied: true });
        }
      }
    } else if (skill.kind === "heal") {
      applyHeal(state, target, Math.round(effectiveStat(actor, "mag") * skill.power + 8), events);
    } else if (skill.kind === "revive") {
      target.alive = true;
      target.hp = Math.max(1, Math.round(target.maxHp * skill.power));
      target.statuses = [];
      events.push({ t: "revive", uid: target.uid, hp: target.hp });
    } else if (skill.kind === "buff" || skill.kind === "debuff") {
      if (chance(skill.chance ?? 1)) {
        const fresh = addStatus(target, skill.status, skill.turns ?? 3);
        events.push({ t: "status", uid: target.uid, status: skill.status, applied: fresh });
      } else {
        events.push({ t: "message", text: `${target.name} shrugs it off.` });
      }
    }
  }
}

function performItem(state, actor, itemId, requestedTarget, events) {
  const item = ITEMS[itemId];
  const targets = resolveTargets(state, actor, item.target, requestedTarget);
  if (!targets.length) {
    events.push({ t: "message", text: `No one needs the ${item.name}.` });
    return { consumed: false };
  }
  events.push({ t: "act", uid: actor.uid, label: item.name, kind: "item" });

  const target = targets[0];
  if (item.kind === "heal") {
    applyHeal(state, target, item.power, events);
  } else if (item.kind === "mp") {
    const before = target.mp;
    target.mp = Math.min(target.maxMp, target.mp + item.power);
    events.push({ t: "mp", uid: target.uid, amount: target.mp - before });
  } else if (item.kind === "revive") {
    target.alive = true;
    target.hp = Math.max(1, Math.round(target.maxHp * item.power));
    target.statuses = [];
    events.push({ t: "revive", uid: target.uid, hp: target.hp });
  } else if (item.kind === "cure") {
    target.statuses = target.statuses.filter((s) => s.type !== item.status);
    events.push({ t: "status", uid: target.uid, status: item.status, cured: true });
  }
  return { consumed: true };
}

/* Enemy turn choice: weighted pick from the bestiary entry. Healing-type
   skills aim at their own side, everything else at the party. */
export function planEnemyAction(state, enemy) {
  const options = enemy.ai || [{ skill: null, weight: 1 }];
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  let chosen = options[options.length - 1];
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) { chosen = option; break; }
  }

  const targets = living(state.allies);
  if (!targets.length) return { type: "attack", targetUid: null };
  if (!chosen.skill) return { type: "attack", targetUid: pick(targets).uid };

  const skill = SKILLS[chosen.skill];
  const wantsAlly = skill.target === "allies" || skill.target === "ally" || skill.target === "self";
  const pool = wantsAlly ? living(state.enemies) : targets;
  return { type: "skill", skillId: chosen.skill, targetUid: pool.length ? pick(pool).uid : null };
}

function basicAttack(state, actor, requestedTarget, events) {
  const targets = resolveTargets(state, actor, "enemy", requestedTarget);
  if (!targets.length) return;
  const target = targets[0];
  events.push({ t: "act", uid: actor.uid, label: "Attack", kind: "physical" });
  const roll = damageRoll(actor, target, { kind: "physical", power: 1 });
  applyDamage(state, target, roll.amount, events, {
    crit: roll.crit, effective: roll.effective, element: null,
  });
}

/* Runs one full round.

   `commands` maps an ally uid to its queued command. Everything - allies and
   monsters alike - is sorted into one speed order, so a fast monster really
   can act before your knight. */
export function resolveRound(state, commands, inventory) {
  const events = [];
  const spent = {};

  const actions = [];
  for (const ally of living(state.allies)) {
    const command = commands[ally.uid];
    if (command) actions.push({ actor: ally, command });
  }
  for (const enemy of living(state.enemies)) {
    actions.push({ actor: enemy, command: planEnemyAction(state, enemy) });
  }

  // Speed order, with a little jitter so identical speeds aren't fixed.
  actions.sort((a, b) =>
    effectiveStat(b.actor, "spd") + rand(0, 1.5) - (effectiveStat(a.actor, "spd") + rand(0, 1.5)));

  for (const { actor, command } of actions) {
    if (!actor.alive || state.over) continue;

    if (hasStatus(actor, "sleep")) {
      events.push({ t: "message", text: `${actor.name} is fast asleep.` });
      continue;
    }

    const target = command.targetUid ? findFighter(state, command.targetUid) : null;

    if (command.type === "attack") {
      basicAttack(state, actor, target, events);
    } else if (command.type === "defend") {
      actor.defending = true;
      events.push({ t: "act", uid: actor.uid, label: "Defend", kind: "defend" });
      const regained = Math.min(actor.maxMp - actor.mp, Math.ceil(actor.maxMp * 0.08));
      if (regained > 0) {
        actor.mp += regained;
        events.push({ t: "mp", uid: actor.uid, amount: regained });
      }
    } else if (command.type === "skill") {
      const skill = SKILLS[command.skillId];
      if (actor.side === "ally") {
        if (actor.mp < skill.mp) {
          events.push({ t: "message", text: `${actor.name} lacks the MP.` });
          continue;
        }
        actor.mp -= skill.mp;
        events.push({ t: "mp", uid: actor.uid, amount: -skill.mp });
      }
      performSkill(state, actor, skill, target, events);
    } else if (command.type === "item") {
      const result = performItem(state, actor, command.itemId, target, events);
      if (result.consumed) spent[command.itemId] = (spent[command.itemId] || 0) + 1;
    }

    checkBossEnrage(state, events);
    checkOutcome(state, events);
  }

  if (!state.over) endOfRound(state, events);
  if (!state.over) checkOutcome(state, events);

  return { events, spent };
}

function checkBossEnrage(state, events) {
  for (const enemy of living(state.enemies)) {
    if (!enemy.enrage || enemy.enraged) continue;
    if (enemy.hp / enemy.maxHp <= enemy.enrage.at) {
      enemy.enraged = true;
      enemy.atk = Math.round(enemy.atk * enemy.enrage.atk);
      enemy.mag = Math.round(enemy.mag * enemy.enrage.mag);
      events.push({ t: "enrage", uid: enemy.uid, text: enemy.enrage.message });
    }
  }
}

function endOfRound(state, events) {
  for (const fighter of allFighters(state)) {
    fighter.defending = false;
    if (!fighter.alive) continue;

    for (const status of [...fighter.statuses]) {
      const def = STATUSES[status.type];
      if (def.tick === "damage") {
        const amount = Math.max(1, Math.round(fighter.maxHp * def.pct));
        events.push({ t: "tick", uid: fighter.uid, status: status.type });
        applyDamage(state, fighter, amount, events, { dot: true });
      } else if (def.tick === "heal" && fighter.hp < fighter.maxHp) {
        const amount = Math.max(1, Math.round(fighter.maxHp * def.pct));
        events.push({ t: "tick", uid: fighter.uid, status: status.type });
        applyHeal(state, fighter, amount, events);
      }
      status.turns -= 1;
      if (status.turns <= 0) {
        fighter.statuses = fighter.statuses.filter((s) => s !== status);
        events.push({ t: "status", uid: fighter.uid, status: status.type, expired: true });
      }
    }
  }
  state.round += 1;
  events.push({ t: "round", round: state.round });
}

function checkOutcome(state, events) {
  if (state.over) return;
  if (!living(state.enemies).length) {
    state.over = "victory";
    const xp = state.enemies.reduce((sum, e) => sum + e.xp, 0);
    const gold = state.enemies.reduce((sum, e) => sum + e.gold, 0);
    events.push({ t: "victory", xp, gold });
  } else if (!living(state.allies).length) {
    state.over = "defeat";
    events.push({ t: "defeat" });
  }
}
